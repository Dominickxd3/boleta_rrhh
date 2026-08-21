import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { Boleta } from '../boletas/boleta.entity';
import { BoletasService } from '../boletas/boletas.service';
import { PdfService } from '../pdf/pdf.service';
import { MailService } from '../mail/mail.service';
import { EventBusService } from '../events/event-bus.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class FirmaService {
  constructor(
    @InjectRepository(Boleta) private readonly repo: Repository<Boleta>,
    private readonly boletas: BoletasService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private frontUrl(): string {
    return this.config.get<string>('FRONT_URL', 'http://localhost:3000');
  }

  private generarToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private expirado(boleta: Boleta): boolean {
    return (
      boleta.estado !== 'FIRMADA' &&
      !!boleta.firmaExpira &&
      boleta.firmaExpira.getTime() < Date.now()
    );
  }

  private validarExpirado(boleta: Boleta) {
    if (this.expirado(boleta)) {
      throw new GoneException(
        'El enlace de firma ha expirado. Solicite un nuevo enlace a RR.HH.',
      );
    }
  }

  async infoFirma(token: string) {
    const boleta = await this.repo.findOne({ where: { tokenFirma: token } });
    if (!boleta) throw new NotFoundException('El enlace de firma no es válido');
    this.validarExpirado(boleta);

    return {
      boletaId: boleta.id,
      trabajador: boleta.trabajador.nombreCompleto,
      dni: boleta.trabajador.dni,
      periodo: boleta.periodo,
      anio: boleta.anio,
      mes: boleta.mes,
      estado: boleta.estado,
      yaFirmada: boleta.estado === 'FIRMADA',
      detalle: this.boletas.leerDetalle(boleta),
    };
  }

  async firmar(token: string, firma: string) {
    const boleta = await this.repo.findOne({ where: { tokenFirma: token } });
    if (!boleta) throw new NotFoundException('El enlace de firma no es válido');
    this.validarExpirado(boleta);

    if (boleta.estado === 'FIRMADA') {
      throw new ConflictException(
        'Esta boleta ya fue firmada. Solo puede firmarse una vez.',
      );
    }

    if (!/^data:image\/png;base64,/.test(firma)) {
      throw new NotFoundException('Firma inválida: debe ser una imagen PNG');
    }

    boleta.fechaFirmado = new Date();
    boleta.firmaPng = firma.replace(/^data:image\/png;base64,/, '');

    const buffer = await this.pdf.generarBoleta(boleta, firma);
    const ruta = await this.pdf.guardarEnDisco(boleta, buffer);
    boleta.rutaPdf = ruta;
    boleta.estado = 'FIRMADA';

    const nuevoTokenVer = this.generarToken();
    boleta.tokenVer = nuevoTokenVer;
    const guardada = await this.repo.save(boleta);

    this.events.emit('boleta.firmada', {
      boletaId: guardada.id,
      periodo: guardada.periodo,
      anio: guardada.anio,
      mes: guardada.mes,
      trabajador: guardada.trabajador.nombreCompleto,
      fechaFirmado: guardada.fechaFirmado,
    });

    // Enviar al trabajador su boleta firmada por correo (si falla, no bloquea la firma)
    const email = (guardada.trabajador.email || '').trim();
    if (email && this.mail.configurado()) {
      try {
        const dni = guardada.trabajador.dni || '';
        const pdfProtegido = dni
          ? await this.pdf.protegerConClave(buffer, dni)
          : buffer;
        await this.mail.enviarBoletaFirmada({
          destinatario: email,
          nombreTrabajador: guardada.trabajador.nombreCompleto,
          periodo: guardada.periodo,
          pdfBuffer: pdfProtegido,
        });
      } catch {
        /* el correo es secundario; la firma ya se registró */
      }
    }

    await this.auditoria.registrar({
      usuario: guardada.trabajador.nombreCompleto,
      accion: 'firma_boleta',
      entidad: 'boleta',
      entidadId: guardada.id,
      detalle: `Periodo ${guardada.periodo}`,
    });

    return {
      mensaje: 'Boleta firmada correctamente',
      trabajador: boleta.trabajador.nombreCompleto,
      periodo: boleta.periodo,
      fechaFirmado: guardada.fechaFirmado,
      rutaPdf: ruta,
      urlVer: `${this.frontUrl()}/ver/${nuevoTokenVer}`,
    };
  }

  async pdfFirma(token: string) {
    const boleta = await this.repo.findOne({ where: { tokenFirma: token } });
    if (!boleta) throw new NotFoundException('El enlace de firma no es válido');
    this.validarExpirado(boleta);
    const buffer = await this.pdf.generarBoleta(boleta);
    const nombre = `boleta-${boleta.periodo}-${boleta.trabajador.dni}.pdf`;
    return { buffer, nombre };
  }

  async infoVer(token: string) {
    const boleta = await this.repo.findOne({ where: { tokenVer: token } });
    if (!boleta) throw new NotFoundException('El enlace no es válido');
    if (boleta.estado !== 'FIRMADA') {
      throw new NotFoundException('El documento aún no ha sido firmado');
    }
    return {
      boletaId: boleta.id,
      trabajador: boleta.trabajador.nombreCompleto,
      dni: boleta.trabajador.dni,
      periodo: boleta.periodo,
      anio: boleta.anio,
      mes: boleta.mes,
      fechaFirmado: boleta.fechaFirmado,
      detalle: this.boletas.leerDetalle(boleta),
      firma: boleta.firmaPng
        ? `data:image/png;base64,${boleta.firmaPng}`
        : null,
      urlPdf: `/firma/ver/${token}/pdf`,
    };
  }
}