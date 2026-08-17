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
  ) {}

  private frontUrl(): string {
    return this.config.get<string>('FRONT_URL', 'http://localhost:3000');
  }

  private generarToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private conUrls(boleta: Boleta) {
    return {
      ...boleta,
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
    if (existente) return null;

    const boleta = this.repo.create({
      trabajadorId,
      periodo,
      anio,
      mes,
      detalleJson: JSON.stringify(detalle),
      estado: 'PENDIENTE',
      tokenFirma: this.generarToken(),
      tokenVer: this.generarToken(),
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
    return { ...this.conUrls(guardada), enviado: true, destinatario: email };
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

    if (boleta.estado === 'FIRMADA' && boleta.rutaPdf) {
      const existe = await fs
        .access(boleta.rutaPdf)
        .then(() => true)
        .catch(() => false);
      if (existe) {
        const buffer = await fs.readFile(boleta.rutaPdf);
        return { buffer: new Uint8Array(buffer), nombre: this.pdf.nombreArchivo(boleta) };
      }
    }
    const buffer = await this.pdf.generarBoleta(boleta);
    return { buffer, nombre: this.pdf.nombreArchivo(boleta) };
  }

  async obtenerPdfPorToken(token: string): Promise<{ buffer: Uint8Array; nombre: string }> {
    const boleta = await this.repo.findOne({ where: { tokenVer: token } });
    if (!boleta) throw new NotFoundException('Enlace no válido');
    if (boleta.estado !== 'FIRMADA' || !boleta.rutaPdf) {
      throw new NotFoundException('El documento aún no ha sido firmado');
    }
    const existe = await fs
      .access(boleta.rutaPdf)
      .then(() => true)
      .catch(() => false);
    if (!existe) throw new NotFoundException('El archivo no existe en el servidor');
    const buffer = await fs.readFile(boleta.rutaPdf);
    return { buffer: new Uint8Array(buffer), nombre: this.pdf.nombreArchivo(boleta) };
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