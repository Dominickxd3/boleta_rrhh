import {
  ConflictException,
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
import { EventBusService } from '../events/event-bus.service';

@Injectable()
export class FirmaService {
  constructor(
    @InjectRepository(Boleta) private readonly repo: Repository<Boleta>,
    private readonly boletas: BoletasService,
    private readonly pdf: PdfService,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
  ) {}

  private frontUrl(): string {
    return this.config.get<string>('FRONT_URL', 'http://localhost:3000');
  }

  private generarToken(): string {
    return randomBytes(24).toString('base64url');
  }

  async infoFirma(token: string) {
    const boleta = await this.repo.findOne({ where: { tokenFirma: token } });
    if (!boleta) throw new NotFoundException('El enlace de firma no es válido');

    return {
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

    return {
      mensaje: 'Boleta firmada correctamente',
      trabajador: boleta.trabajador.nombreCompleto,
      periodo: boleta.periodo,
      fechaFirmado: guardada.fechaFirmado,
      rutaPdf: ruta,
      urlVer: `${this.frontUrl()}/ver/${nuevoTokenVer}`,
    };
  }

  async infoVer(token: string) {
    const boleta = await this.repo.findOne({ where: { tokenVer: token } });
    if (!boleta) throw new NotFoundException('El enlace no es válido');
    if (boleta.estado !== 'FIRMADA') {
      throw new NotFoundException('El documento aún no ha sido firmado');
    }
    return {
      trabajador: boleta.trabajador.nombreCompleto,
      dni: boleta.trabajador.dni,
      periodo: boleta.periodo,
      anio: boleta.anio,
      mes: boleta.mes,
      fechaFirmado: boleta.fechaFirmado,
      urlPdf: `/firma/ver/${token}/pdf`,
    };
  }
}