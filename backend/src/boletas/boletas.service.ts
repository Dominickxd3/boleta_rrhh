import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { In, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { WorkersService } from '../workers/workers.service';
import { PdfService } from '../pdf/pdf.service';
import { AuditoriaService, type ActorAuditoria } from '../auditoria/auditoria.service';
import { EventBusService } from '../events/event-bus.service';
import { Boleta } from './boleta.entity';
import { CreateBoletaDto } from './dto/create-boleta.dto';

interface CachéPorArea {
  data: PorAreaData;
  expira: number;
}

export interface PorAreaItem {
  id: number;
  periodo: string;
  anio: number;
  mes: number;
  estado: string;
  emailEnviado: boolean;
  [k: string]: unknown;
}

export interface PorAreaGrupo {
  area: string;
  total: number;
  firmadas: number;
  pendientes: number;
  sinCorreo: number;
  boletas: PorAreaItem[];
}

export interface PeriodoInfo {
  anio: number;
  mes: number;
  esCerrado: boolean;
  esEnCurso: boolean;
  esFuturo: boolean;
  estadoTexto: string;
}

export interface PorAreaData {
  total: number;
  areas: PorAreaGrupo[];
  periodoInfo?: PeriodoInfo;
}

@Injectable()
export class BoletasService implements OnModuleInit {
  // Caché en memoria del endpoint por-area: evita el viaje a la BD en cada
  // consulta del panel. Al firmar se actualiza en memoria (sin tocar la BD)
  // para que el estado FIRMADA se refleje al instante (~ms).
  private cachéPorArea = new Map<string, CachéPorArea>();
  private readonly TTL_POR_AREA = 15_000;

  constructor(
    @InjectRepository(Boleta) private readonly repo: Repository<Boleta>,
    private readonly workers: WorkersService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventBusService,
  ) {}

  onModuleInit() {
    // Al firmar una boleta, actualiza en memoria (sin BD) la boleta afectada
    // para que el panel refleje el estado FIRMADA al instante.
    this.events.on('boleta.firmada', (payload: { boletaId?: number }) => {
      if (payload && typeof payload.boletaId === 'number') {
        this.actualizarCachePorFirma(payload.boletaId);
      }
    });
  }

  /** Marca como FIRMADA una boleta en la caché y recalcula los conteos, sin consultar la BD. */
  private actualizarCachePorFirma(boletaId: number) {
    const ahora = Date.now();
    for (const [clave, cache] of this.cachéPorArea) {
      if (cache.expira <= ahora) {
        this.cachéPorArea.delete(clave);
        continue;
      }
      let cambiado = false;
      for (const area of cache.data.areas) {
        const item = area.boletas.find((b) => b.id === boletaId);
        if (item && item.estado !== 'FIRMADA') {
          item.estado = 'FIRMADA';
          cambiado = true;
        }
      }
      if (cambiado) {
        for (const area of cache.data.areas) {
          area.firmadas = area.boletas.filter((x) => x.estado === 'FIRMADA').length;
          area.pendientes = area.boletas.filter((x) => x.estado === 'PENDIENTE').length;
        }
        cache.data.total = cache.data.areas.reduce((s, a) => s + a.boletas.length, 0);
      }
    }
  }

  async auditar(
    accion: string,
    entidad: string,
    entidadId: number | null,
    actor: ActorAuditoria | undefined,
    detalle?: string,
  ) {
    await this.auditoria.registrar({
      usuario: actor?.usuario ?? null,
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
      accion,
      entidad,
      entidadId,
      detalle: detalle ?? null,
    });
  }

  async auditoriaDe(id: number) {
    return this.auditoria.listar({ entidad: 'boleta', entidadId: id });
  }

  async auditarCopiarLink(
    id: number,
    actor?: ActorAuditoria,
  ) {
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    await this.auditar(
      'copiar_link',
      'boleta',
      id,
      actor,
      `Se copió el link de firma (boleta ${boleta.periodo})`,
    );
    return { ok: true };
  }

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
    const { firmaPng: _firmaPng, detalleJson: _detalleJson, ...resto } = boleta;
    return {
      ...resto,
      detalle: this.leerDetalle(boleta),
      urlFirma: boleta.tokenFirma
        ? `${this.frontUrl()}/firmar/${boleta.tokenFirma}`
        : null,
      urlVer: boleta.tokenVer
        ? `${this.frontUrl()}/ver/${boleta.tokenVer}`
        : null,
    };
  }

  async create(
    dto: CreateBoletaDto,
    actor?: ActorAuditoria,
  ) {
    this.cachéPorArea.clear();
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
      creadoPor: actor?.usuario ?? null,
      creadoIp: actor?.ip ?? null,
    });
    const guardada = await this.repo.save(boleta);
    await this.auditar(
      'crear_boleta',
      'boleta',
      guardada.id,
      actor,
      `Boleta ${periodo}`,
    );
    return this.conUrls(guardada);
  }

  async crearDesdeNomina(
    trabajadorId: number,
    periodo: string,
    detalle: object,
    actor?: ActorAuditoria,
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
        existente.modificadoPor = actor?.usuario ?? null;
        existente.modificadoIp = actor?.ip ?? null;
        existente.modificadoEn = new Date();
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
      creadoPor: actor?.usuario ?? null,
      creadoIp: actor?.ip ?? null,
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
    const qb = this.repo
      .createQueryBuilder('b')
      .select('b.estado', 'estado')
      .addSelect('COUNT(*)', 'n');
    if (query.anio) qb.andWhere('b.anio = :anio', { anio: Number(query.anio) });
    if (query.mes) qb.andWhere('b.mes = :mes', { mes: Number(query.mes) });
    qb.groupBy('b.estado');

    const rows = await qb.getRawMany<{ estado: string; n: string }>();
    const contar = (estado: string) =>
      Number(rows.find((r) => r.estado === estado)?.n ?? 0);

    return {
      total: rows.reduce((sum, r) => sum + Number(r.n), 0),
      firmadas: contar('FIRMADA'),
      pendientes: contar('PENDIENTE'),
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
    const clave = `${query.anio ?? ''}-${query.mes ?? ''}-${query.soloPendientes ?? ''}`;
    const ahora = Date.now();
    const cache = this.cachéPorArea.get(clave);
    if (cache && cache.expira > ahora) {
      return cache.data;
    }

    // Consulta ligera: excluye detalle_json y firma_png (payloads grandes).
    // El detalle completo se obtiene por boleta con GET /boletas/:id.
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoin('b.trabajador', 't')
      .select('b.id', 'id')
      .addSelect('b.periodo', 'periodo')
      .addSelect('b.anio', 'anio')
      .addSelect('b.mes', 'mes')
      .addSelect('b.estado', 'estado')
      .addSelect('b.emailEnviado', 'emailEnviado')
      .addSelect('b.tokenFirma', 'tokenFirma')
      .addSelect('b.tokenVer', 'tokenVer')
      .addSelect('t.id', 'trabajadorId')
      .addSelect('t.dni', 'dni')
      .addSelect('t.nombres', 'nombres')
      .addSelect('t.apellidoPaterno', 'apPaterno')
      .addSelect('t.apellidoMaterno', 'apMaterno')
      .addSelect('t.area', 'area')
      .addSelect('t.email', 'email');

    if (query.anio) qb.andWhere('b.anio = :anio', { anio: Number(query.anio) });
    if (query.mes) qb.andWhere('b.mes = :mes', { mes: Number(query.mes) });
    if (query.soloPendientes === '1') {
      qb.andWhere('b.emailEnviado = :enviado', { enviado: false });
    }
    qb.addOrderBy('t.area', 'ASC')
      .addOrderBy('t.apellidoPaterno', 'ASC')
      .addOrderBy('t.apellidoMaterno', 'ASC');

    const rows = await qb.getRawMany<{
      id: number;
      periodo: string;
      anio: number;
      mes: number;
      estado: string;
      emailEnviado: boolean;
      tokenFirma: string | null;
      tokenVer: string | null;
      trabajadorId: number;
      dni: string;
      nombres: string;
      apPaterno: string | null;
      apMaterno: string | null;
      area: string | null;
      email: string | null;
    }>();

    const front = this.frontUrl();
    const items = rows.map((r) => ({
      id: r.id,
      periodo: r.periodo,
      anio: r.anio,
      mes: r.mes,
      estado: r.estado,
      emailEnviado: !!r.emailEnviado,
      tokenFirma: r.tokenFirma,
      tokenVer: r.tokenVer,
      trabajador: {
        id: r.trabajadorId,
        dni: r.dni,
        email: (r.email || '').trim(),
        area: (r.area || '').trim(),
        nombreCompleto:
          `${r.apPaterno || ''} ${r.apMaterno || ''} ${r.nombres || ''}`.trim(),
      },
      urlFirma: r.tokenFirma ? `${front}/firmar/${r.tokenFirma}` : null,
      urlVer: r.tokenVer ? `${front}/ver/${r.tokenVer}` : null,
    }));

    const grupos = new Map<string, typeof items>();
    for (const it of items) {
      const area = it.trabajador.area || 'Sin área';
      if (!grupos.has(area)) grupos.set(area, []);
      grupos.get(area)!.push(it);
    }

    const areas = Array.from(grupos.entries())
      .map(([area, lista]) => ({
        area,
        total: lista.length,
        firmadas: lista.filter((x) => x.estado === 'FIRMADA').length,
        pendientes: lista.filter((x) => x.estado === 'PENDIENTE').length,
        sinCorreo: lista.filter((x) => !x.emailEnviado).length,
        boletas: lista,
      }))
    const hoy = new Date();
    const hoyAnio = hoy.getFullYear();
    const hoyMes = hoy.getMonth() + 1;
    const qAnio = Number(query.anio) || hoyAnio;
    const qMes = Number(query.mes) || hoyMes;

    const esCerrado = qAnio < hoyAnio || (qAnio === hoyAnio && qMes < hoyMes);
    const esEnCurso = qAnio === hoyAnio && qMes === hoyMes;
    const esFuturo = qAnio > hoyAnio || (qAnio === hoyAnio && qMes > hoyMes);
    const estadoTexto = esCerrado
      ? 'Período cerrado'
      : esEnCurso
        ? 'Período en curso – envío masivo bloqueado'
        : 'Período futuro – envío masivo bloqueado';

    const periodoInfo: PeriodoInfo = {
      anio: qAnio,
      mes: qMes,
      esCerrado,
      esEnCurso,
      esFuturo,
      estadoTexto,
    };

    const resultado: PorAreaData = { total: items.length, areas, periodoInfo };

    this.cachéPorArea.set(clave, {
      data: resultado,
      expira: ahora + this.TTL_POR_AREA,
    });

    return resultado;
  }

  async marcarEmailEnviado(
    id: number,
    actor?: ActorAuditoria,
  ) {
    this.cachéPorArea.clear();
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    boleta.emailEnviado = true;
    boleta.fechaEmail = new Date();
    boleta.modificadoPor = actor?.usuario ?? null;
    boleta.modificadoIp = actor?.ip ?? null;
    boleta.modificadoEn = new Date();
    const guardada = await this.repo.save(boleta);
    await this.auditar(
      'marcar_email_enviado',
      'boleta',
      id,
      actor,
      `Boleta ${boleta.periodo}`,
    );
    return this.conUrls(guardada);
  }

  async revertirFirma(
    id: number,
    actor?: ActorAuditoria,
  ) {
    this.cachéPorArea.clear();
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
    boleta.modificadoPor = actor?.usuario ?? null;
    boleta.modificadoIp = actor?.ip ?? null;
    boleta.modificadoEn = new Date();

    const guardada = await this.repo.save(boleta);
    await this.auditar(
      'revertir_firma',
      'boleta',
      id,
      actor,
      `Boleta ${boleta.periodo} revertida a PENDIENTE (${boleta.trabajador.nombreCompleto})`,
    );
    return { ...this.conUrls(guardada), revertida: true };
  }

  async enviarCorreo(
    id: number,
    actor?: ActorAuditoria,
  ) {
    this.cachéPorArea.clear();
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
    boleta.modificadoPor = actor?.usuario ?? null;
    boleta.modificadoIp = actor?.ip ?? null;
    boleta.modificadoEn = new Date();
    const guardada = await this.repo.save(boleta);
    await this.auditar(
      'enviar_correo',
      'boleta',
      id,
      actor,
      `Correo a ${email}`,
    );
    return { ...this.conUrls(guardada), enviado: true, destinatario: email };
  }

  async enviarMasivo(
    ids: number[],
    actor?: ActorAuditoria,
  ) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No se seleccionaron boletas para enviar');
    }

    const boletasAEnviar = await this.repo.find({
      where: { id: In(ids) },
      relations: { trabajador: true },
    });

    if (boletasAEnviar.length === 0) {
      throw new NotFoundException('No se encontraron las boletas solicitadas');
    }

    // Regla de negocio: El período actual permanece bloqueado para el envío masivo hasta que finalice el mes.
    const hoy = new Date();
    const hoyAnio = hoy.getFullYear();
    const hoyMes = hoy.getMonth() + 1;

    for (const b of boletasAEnviar) {
      const esPeriodoCerrado =
        b.anio < hoyAnio || (b.anio === hoyAnio && b.mes < hoyMes);

      if (!esPeriodoCerrado) {
        const esEnCurso = b.anio === hoyAnio && b.mes === hoyMes;
        const msg = esEnCurso
          ? `El período actual (${b.periodo}) está en curso. El envío masivo está bloqueado hasta que finalice el mes.`
          : `El período (${b.periodo}) no está cerrado. El envío masivo está bloqueado.`;
        throw new BadRequestException(msg);
      }
    }

    this.cachéPorArea.clear();
    await this.mail.sincronizarDesdeBd();
    const delayMs = Math.max(
      0,
      Number(this.config.get<string>('SMTP_DELAY_MS', '1500')),
    );
    const inicio = Date.now();
    let enviados = 0;
    let sinEmail = 0;
    let yaEnviados = 0;
    let errores = 0;
    let topeAlcanzado = false;
    const sinEmailDetalle: { nombre: string; area: string }[] = [];
    const erroresDetalle: { nombre: string; periodo: string; motivo: string }[] = [];
    const boletaMap = new Map(boletasAEnviar.map((b) => [b.id, b]));

    for (const id of ids) {
      if (this.mail.restantesHoy() <= 0) {
        topeAlcanzado = true;
        break;
      }
      const boleta = boletaMap.get(id);
      if (!boleta) {
        errores++;
        continue;
      }
      // Si el enlace ya venció, se genera un token nuevo (enlace fresco), igual que el envío individual.
      const vencido =
        boleta.estado !== 'FIRMADA' &&
        !!boleta.firmaExpira &&
        boleta.firmaExpira.getTime() < Date.now();
      if (vencido) {
        boleta.tokenFirma = this.generarToken();
        boleta.firmaExpira = this.fechaExpiracion();
        await this.repo.save(boleta);
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
      } catch (e) {
        errores++;
        erroresDetalle.push({
          nombre: boleta.trabajador.nombreCompleto,
          periodo: boleta.periodo,
          motivo: (e as Error).message,
        });
      }
      if (delayMs > 0) await this.dormir(delayMs);
    }

    const duracionSeg = Math.round((Date.now() - inicio) / 1000);
    const estadoCorreo = await this.mail.estadoCorreo();

    await this.auditar(
      'envio_masivo',
      'boleta',
      null,
      actor,
      JSON.stringify({
        total: ids.length,
        enviados,
        sinEmail,
        yaEnviados,
        errores,
        topeAlcanzado,
        usadosHoy: estadoCorreo.usadosHoy,
        restantesHoy: estadoCorreo.restantesHoy,
      }),
    );

    return {
      total: ids.length,
      enviados,
      sinEmail,
      yaEnviados,
      errores,
      sinEmailDetalle,
      erroresDetalle,
      topeAlcanzado,
      duracionSeg,
      usadosHoy: estadoCorreo.usadosHoy,
      restantesHoy: estadoCorreo.restantesHoy,
      limiteDiario: estadoCorreo.limiteDiario,
      smtpEstado: estadoCorreo.estado,
      ultimoError: estadoCorreo.ultimoError,
      ultimoErrorFecha: estadoCorreo.ultimoErrorFecha,
    };
  }

  async estadoCorreo() {
    return this.mail.estadoCorreo();
  }

  private dormir(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  async remove(
    id: number,
    actor?: ActorAuditoria,
  ) {
    this.cachéPorArea.clear();
    const boleta = await this.repo.findOne({ where: { id } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    if (boleta.rutaPdf) {
      await fs.unlink(boleta.rutaPdf).catch(() => undefined);
    }
    await this.repo.delete(id);
    await this.auditar(
      'eliminar_boleta',
      'boleta',
      id,
      actor,
      `Boleta ${boleta.periodo}`,
    );
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

  /** Nombre del trabajador tal como estaba al generar la boleta (snapshot). */
  nombreTrabajador(boleta: Boleta): string {
    const d = this.leerDetalle(boleta) as Record<string, unknown>;
    return String(
      d?.trabajadorNombre || boleta.trabajador?.nombreCompleto || '',
    ).trim();
  }

  /** DNI del trabajador tal como estaba al generar la boleta (snapshot). */
  dniTrabajador(boleta: Boleta): string {
    const d = this.leerDetalle(boleta) as Record<string, unknown>;
    return String(d?.dni || boleta.trabajador?.dni || '').trim();
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