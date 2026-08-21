import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { WorkersService } from '../workers/workers.service';
import { PdfService } from '../pdf/pdf.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Boleta } from './boleta.entity';
import { CreateBoletaDto } from './dto/create-boleta.dto';

@Injectable()
export class BoletasService {
  constructor(
    @InjectRepository(Boleta) private readonly repo: Repository<Boleta>,
    private readonly workers: WorkersService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private frontUrl(): string {
    return this.config.get<string>('FRONT_URL', 'http://localhost:3000');
  }

  private generarToken(): string {
    return randomBytes(24).toString('base64url');
  }

  /** Horas de validez del enlace de firma desde la creación de la boleta. */
  private validezLinkHoras(): number {
    return Number(this.config.get('VALIDEZ_LINK_HORAS', '72')) || 72;
  }

  private fechaExpiracion(): Date {
    const horas = this.validezLinkHoras();
    return new Date(Date.now() + horas * 60 * 60 * 1000);
  }

  private conUrls(boleta: Boleta) {
    return {
      ...boleta,
      detalle: this.leerDetalle(boleta),
      urlFirma: boleta.tokenFirma
        ? `${this.frontUrl()}/firmar/${boleta.tokenFirma}`
        : null,
      urlVer: boleta.tokenVer
        ? `${this.frontUrl()}/ver/${boleta.tokenVer}`
        : null,
    };
  }

  async create(dto: CreateBoletaDto) {
    await this.workers.findOne(dto.trabajadorId);

    const periodo = dto.periodo;
    const anio = Number(periodo.slice(0, 4));
    const mes = Number(periodo.slice(4, 6));

    const duplicada = await this.repo.findOne({
      where: {
        trabajadorId: dto.trabajadorId,
        periodo,
      },
    });
    if (duplicada) {
      throw new Error('Ya existe una boleta para este trabajador y periodo');
    }

    const boleta = this.repo.create({
      trabajadorId: dto.trabajadorId,
      periodo,
      anio,
      mes,
      detalleJson: JSON.stringify(dto.detalle),
      estado: 'PENDIENTE',
      tokenFirma: this.generarToken(),
      tokenVer: this.generarToken(),
      firmaExpira: this.fechaExpiracion(),
    });
    const guardada = await this.repo.save(boleta);
    return this.conUrls(guardada);
  }

  async crearDesdeNomina(
    trabajadorId: number,
    periodo: string,
    detalle: object,
  ) {
    const anio = Number(periodo.slice(0, 4));
    const mes = Number(periodo.slice(4, 6));

    const existente = await this.repo.findOne({
      where: { trabajadorId, periodo },
    });
    if (existente) {
      const nuevoJson = JSON.stringify(detalle);
      if (existente.detalleJson !== nuevoJson) {
        existente.detalleJson = nuevoJson;
        await this.repo.save(existente);
      }
      return null;
    }

    const boleta = this.repo.create({
      trabajadorId,
      periodo,
      anio,
      mes,
      detalleJson: JSON.stringify(detalle),
      estado: 'PENDIENTE',
      tokenFirma: this.generarToken(),
      tokenVer: this.generarToken(),
      firmaExpira: this.fechaExpiracion(),
    });
    const guardada = await this.repo.save(boleta);
    return this.conUrls(guardada);
  }

  async findAll(query: { anio?: string; mes?: string; estado?: string }) {
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.trabajador', 't')
      .orderBy('b.periodo', 'DESC')
      .addOrderBy('t.apellido_paterno', 'ASC');

    if (query.anio) qb.andWhere('b.anio = :anio', { anio: Number(query.anio) });
    if (query.mes) qb.andWhere('b.mes = :mes', { mes: Number(query.mes) });
    if (query.estado) qb.andWhere('b.estado = :estado', { estado: query.estado });

    const boletas = await qb.getMany();
    return boletas.map((b) => this.conUrls(b));
  }

  async findOne(id: number) {
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    return this.conUrls(boleta);
  }

  async resumen(query: { anio?: string; mes?: string }) {
    const qb = this.repo.createQueryBuilder('b');
    if (query.anio) qb.andWhere('b.anio = :anio', { anio: Number(query.anio) });
    if (query.mes) qb.andWhere('b.mes = :mes', { mes: Number(query.mes) });
    const todas = await qb.getMany();
    return {
      total: todas.length,
      firmadas: todas.filter((b) => b.estado === 'FIRMADA').length,
      pendientes: todas.filter((b) => b.estado === 'PENDIENTE').length,
    };
  }

  async firmasPorMes(anio?: string) {
    const year = anio ? Number(anio) : new Date().getFullYear();
    const rows = await this.repo
      .createQueryBuilder('b')
      .select('b.mes', 'mes')
      .addSelect('COUNT(*)', 'total')
      .where('b.estado = :firmada', { firmada: 'FIRMADA' })
      .andWhere('b.anio = :anio', { anio: year })
      .groupBy('b.mes')
      .getRawMany();

    const porMes = new Map(rows.map((r) => [Number(r.mes), Number(r.total)]));
    const etiquetas = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic',
    ];
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return {
        mes: String(m).padStart(2, '0'),
        label: etiquetas[i],
        firmadas: porMes.get(m) ?? 0,
      };
    });
  }

  async actividadReciente(limite = 15) {
    const boletas = await this.repo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.trabajador', 't')
      .orderBy('b.fechaFirmado', 'DESC')
      .addOrderBy('b.fechaEmail', 'DESC')
      .addOrderBy('b.creadoEn', 'DESC')
      .take(150)
      .getMany();

    const eventos: {
      tipo: string;
      titulo: string;
      detalle: string;
      fecha: Date;
      boletaId: number;
    }[] = [];

    for (const b of boletas) {
      eventos.push({
        tipo: 'generacion',
        titulo: 'Boleta generada',
        detalle: `${b.trabajador.nombreCompleto} · Periodo ${b.periodo}`,
        fecha: b.creadoEn,
        boletaId: b.id,
      });
      if (b.fechaFirmado) {
        eventos.push({
          tipo: 'firma',
          titulo: 'Boleta firmada',
          detalle: `${b.trabajador.nombreCompleto} · Periodo ${b.periodo}`,
          fecha: b.fechaFirmado,
          boletaId: b.id,
        });
      }
      if (b.fechaEmail) {
        eventos.push({
          tipo: 'correo',
          titulo: 'Correo de firma enviado',
          detalle: `${b.trabajador.nombreCompleto} · Periodo ${b.periodo}`,
          fecha: b.fechaEmail,
          boletaId: b.id,
        });
      }
    }

    eventos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return eventos.slice(0, limite);
  }

  async porArea(query: { anio?: string; mes?: string; soloPendientes?: string }) {
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.trabajador', 't')
      .addOrderBy('t.area', 'ASC')
      .addOrderBy('t.apellido_paterno', 'ASC')
      .addOrderBy('t.apellido_materno', 'ASC');

    if (query.anio) qb.andWhere('b.anio = :anio', { anio: Number(query.anio) });
    if (query.mes) qb.andWhere('b.mes = :mes', { mes: Number(query.mes) });
    if (query.soloPendientes === '1') {
      qb.andWhere('b.emailEnviado = :enviado', { enviado: false });
    }

    const boletas = await qb.getMany();

    const grupos = new Map<string, Boleta[]>();
    for (const b of boletas) {
      const area = (b.trabajador.area || '').trim() || 'Sin área';
      if (!grupos.has(area)) grupos.set(area, []);
      grupos.get(area)!.push(b);
    }

    const areas = Array.from(grupos.entries())
      .map(([area, lista]) => ({
        area,
        total: lista.length,
        firmadas: lista.filter((b) => b.estado === 'FIRMADA').length,
        pendientes: lista.filter((b) => b.estado === 'PENDIENTE').length,
        sinCorreo: lista.filter((b) => !b.emailEnviado).length,
        boletas: lista.map((b) => this.conUrls(b)),
      }))
      .sort((a, b) => a.area.localeCompare(b.area));

    return { total: boletas.length, areas };
  }

  async marcarEmailEnviado(id: number) {
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    boleta.emailEnviado = true;
    boleta.fechaEmail = new Date();
    const guardada = await this.repo.save(boleta);
    return this.conUrls(guardada);
  }

  async revertirFirma(id: number) {
    const boleta = await this.repo.findOne({
      where: { id },
      relations: { trabajador: true },
    });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    if (boleta.estado !== 'FIRMADA') {
      throw new BadRequestException(
        'Solo se puede revertir la firma de una boleta ya firmada',
      );
    }

    // Eliminar el PDF firmado anterior (si existe)
    const rutaAnt = boleta.rutaPdf;
    if (rutaAnt) {
      try {
        await fs.unlink(rutaAnt);
      } catch {
        /* el archivo pudo ya no existir */
      }
    }

    boleta.estado = 'PENDIENTE';
    boleta.fechaFirmado = null;
    boleta.firmaPng = null;
    boleta.rutaPdf = null;
    boleta.emailEnviado = false;
    boleta.fechaEmail = null;
    boleta.tokenFirma = this.generarToken();
    boleta.firmaExpira = this.fechaExpiracion();
    boleta.tokenVer = this.generarToken();

    const guardada = await this.repo.save(boleta);
    await this.auditoria.registrar({
      accion: 'revertir_firma',
      entidad: 'boleta',
      entidadId: id,
      detalle: `Boleta ${boleta.periodo} revertida a PENDIENTE (${boleta.trabajador.nombreCompleto})`,
    });
    return { ...this.conUrls(guardada), revertida: true };
  }

  async enviarCorreo(id: number) {
    const boleta = await this.repo.findOne({
      where: { id },
      relations: { trabajador: true },
    });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');

    const email = (boleta.trabajador.email || '').trim();
    if (!email) {
      throw new BadRequestException(
        `El trabajador ${boleta.trabajador.nombreCompleto} no tiene email registrado`,
      );
    }

    // Si el enlace ya venció, se genera un token nuevo (enlace fresco)
    const vencido =
      boleta.estado !== 'FIRMADA' &&
      !!boleta.firmaExpira &&
      boleta.firmaExpira.getTime() < Date.now();
    if (vencido) {
      boleta.tokenFirma = this.generarToken();
      boleta.firmaExpira = this.fechaExpiracion();
      await this.repo.save(boleta);
    }

    const conUrl = this.conUrls(boleta);
    if (!conUrl.urlFirma) {
      throw new BadRequestException('La boleta no tiene token de firma');
    }

    try {
      await this.mail.enviarBoleta({
        destinatario: email,
        nombreTrabajador: boleta.trabajador.nombreCompleto,
        periodo: boleta.periodo,
        urlFirma: conUrl.urlFirma,
      });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    boleta.emailEnviado = true;
    boleta.fechaEmail = new Date();
    const guardada = await this.repo.save(boleta);
    await this.auditoria.registrar({
      accion: 'enviar_correo',
      entidad: 'boleta',
      entidadId: id,
      detalle: `Correo a ${email}`,
    });
    return { ...this.conUrls(guardada), enviado: true, destinatario: email };
  }

  async enviarMasivo(ids: number[]) {
    let enviados = 0;
    let sinEmail = 0;
    let yaEnviados = 0;
    let errores = 0;
    const sinEmailDetalle: { nombre: string; area: string }[] = [];

    for (const id of ids) {
      const boleta = await this.repo.findOne({
        where: { id },
        relations: { trabajador: true },
      });
      if (!boleta) {
        errores++;
        continue;
      }
      if (boleta.emailEnviado) {
        yaEnviados++;
        continue;
      }
      const email = (boleta.trabajador.email || '').trim();
      if (!email) {
        sinEmail++;
        sinEmailDetalle.push({
          nombre: boleta.trabajador.nombreCompleto,
          area: (boleta.trabajador.area || '').trim() || 'Sin área',
        });
        continue;
      }
      const conUrl = this.conUrls(boleta);
      if (!conUrl.urlFirma) {
        errores++;
        continue;
      }
      try {
        await this.mail.enviarBoleta({
          destinatario: email,
          nombreTrabajador: boleta.trabajador.nombreCompleto,
          periodo: boleta.periodo,
          urlFirma: conUrl.urlFirma,
        });
        boleta.emailEnviado = true;
        boleta.fechaEmail = new Date();
        await this.repo.save(boleta);
        enviados++;
      } catch {
        errores++;
      }
    }

    await this.auditoria.registrar({
      accion: 'envio_masivo',
      entidad: 'boleta',
      detalle: JSON.stringify({
        total: ids.length,
        enviados,
        sinEmail,
        yaEnviados,
        errores,
      }),
    });

    return {
      total: ids.length,
      enviados,
      sinEmail,
      yaEnviados,
      errores,
      sinEmailDetalle,
    };
  }

  async exportarCsv(query: { anio?: string; mes?: string; soloPendientes?: string }) {
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.trabajador', 't')
      .addOrderBy('t.area', 'ASC')
      .addOrderBy('t.apellido_paterno', 'ASC')
      .addOrderBy('t.apellido_materno', 'ASC');

    if (query.anio) qb.andWhere('b.anio = :anio', { anio: Number(query.anio) });
    if (query.mes) qb.andWhere('b.mes = :mes', { mes: Number(query.mes) });
    if (query.soloPendientes === '1') {
      qb.andWhere('b.emailEnviado = :enviado', { enviado: false });
    }

    const boletas = await qb.getMany();

    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };

    const filas = [
      [
        'Área',
        'Trabajador',
        'DNI',
        'Email',
        'Periodo',
        'Estado',
        'Correo enviado',
        'Fecha envío',
        'Link de firma',
      ].join(';'),
      ...boletas.map((b) => {
        const area = (b.trabajador.area || '').trim() || 'Sin área';
        return [
          esc(area),
          esc(b.trabajador.nombreCompleto),
          esc(b.trabajador.dni),
          esc(b.trabajador.email),
          esc(b.periodo),
          esc(b.estado),
          esc(b.emailEnviado ? 'Sí' : 'No'),
          esc(b.fechaEmail ? new Date(b.fechaEmail).toLocaleString('es-PE') : ''),
          this.conUrls(b).urlFirma ?? '',
        ].join(';');
      }),
    ];

    const anio = query.anio || 'AAAA';
    const mes = query.mes || 'MM';
    return {
      contenido: '\uFEFF' + filas.join('\r\n'),
      nombre: `boletas_${anio}-${mes}.csv`,
    };
  }

  async remove(id: number) {
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    if (boleta.rutaPdf) {
      await fs.unlink(boleta.rutaPdf).catch(() => undefined);
    }
    await this.repo.delete(id);
  }

  async obtenerPdf(id: number): Promise<{ buffer: Uint8Array; nombre: string }> {
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');

    const firma =
      boleta.estado === 'FIRMADA' && boleta.firmaPng
        ? `data:image/png;base64,${boleta.firmaPng}`
        : undefined;
    const buffer = await this.pdf.generarBoleta(boleta, firma);
    return { buffer, nombre: this.pdf.nombreArchivo(boleta) };
  }

  async obtenerPdfPorToken(token: string): Promise<{ buffer: Uint8Array; nombre: string }> {
    const boleta = await this.repo.findOne({ where: { tokenVer: token } });
    if (!boleta) throw new NotFoundException('Enlace no válido');
    if (boleta.estado !== 'FIRMADA' || !boleta.firmaPng) {
      throw new NotFoundException('El documento aún no ha sido firmado');
    }
    const firma = `data:image/png;base64,${boleta.firmaPng}`;
    const buffer = await this.pdf.generarBoleta(boleta, firma);
    return { buffer, nombre: this.pdf.nombreArchivo(boleta) };
  }

  leerDetalle(boleta: Boleta) {
    try {
      return JSON.parse(boleta.detalleJson);
    } catch {
      return { ingresos: [], descuentos: [], netoPagar: 0 };
    }
  }

  existeArchivo(ruta: string): Promise<boolean> {
    return fs.access(ruta).then(() => true).catch(() => false);
  }

  rutaPdfDeBoleta(boleta: Boleta): string {
    return path.join(
      this.pdf.getCarpetaBase(),
      String(boleta.anio),
      String(boleta.mes).padStart(2, '0'),
      this.pdf.nombreArchivo(boleta),
    );
  }
}