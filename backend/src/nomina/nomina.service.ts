import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BoletasService } from '../boletas/boletas.service';
import { WorkersService } from '../workers/workers.service';

export interface ConceptoItem {
  concepto: string;
  monto: number;
  movim?: string;
}

export interface DetalleNomina {
  empresa: string;
  ruc: string;
  direccion: string;
  remune: string;
  sdoBasico: number;
  sdoBasFam: number;
  totDias: number;
  totHoras: number;
  documento: string;
  situacion: string;
  fIngreso: string;
  fCese: string;
  regimenPensionario: string;
  cuspp: string;
  centroCostos: string;
  ocupacion: string;
  tipoTrabajador: string;
  condicion: string;
  otrosEmpRta5ta: string;
  periodoTexto: string;
  diasLaborados: string;
  jornadaOrdinaria: string;
  sobretiempo: string;
  diasLab: number;
  diasNL: number;
  diasSub: number;
  horasExtra: number;
  minutos: number;
  minutosSob: number;
  formaPago: string;
  categoria: string;
  periodoPlanilla: string;
  lugarFecha: string;
  representante: string;
  cargoRepresentante: string;
  ingresos: ConceptoItem[];
  descuentos: ConceptoItem[];
  aportesTrabajador: ConceptoItem[];
  aportes: ConceptoItem[];
  netoPagar: number;
}

export interface Periodo {
  id_periodo: number;
  emp_codigo: string;
  id_remune: number;
  rem_anomes: string;
  rem_correl: string;
  rem_fecini: string;
  rem_fecfin: string;
  st_anulado: string;
}

interface Fila {
  id_traba: number;
  tra_nrodni: string;
  tra_apepat: string;
  tra_apemat: string;
  tra_nombre: string;
  ocu_descri: string;
  cc_descri: string;
  tip_descri: string;
  Stip: string;
  Est_Emple: string;
  reg_descri: string;
  reg_fecins: string;
  tra_nroafp: string;
  SdoBasico: number;
  SdoBasFam: number;
  DiaBasico: number;
  totDias: number;
  todDiasDMedi: number;
  totDiasFalta: number;
  totHoras: number;
  totHorasSob: number;
  totMinuto: number;
  totMinutoSob: number;
  rem_fecini: string;
  rem_fecfin: string;
  con_descri: string;
  Ingresos: number;
  Descuentos: number;
  Neto: number;
  Horas: number;
  emp_descri: string;
  emp_ruc: string;
  emp_dirfis: string;
  rem_descri: string;
}

@Injectable()
export class NominaService {
  private readonly logger = new Logger(NominaService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workers: WorkersService,
    private readonly boletas: BoletasService,
    private readonly config: ConfigService,
  ) {}

  private num(v: unknown): number {
    return Math.round((Number(v) || 0) * 100) / 100;
  }

  private txt(v: unknown): string {
    return v == null ? '' : String(v).trim();
  }

  /**
   * Ejecuta el SP local que materializa el periodo en NominaDetalle.
   * Es el UNICO punto que consulta el ERP (vía linked server, una vez por periodo).
   */
  async sincronizar(anomes: string, correl: string) {
    const emp = this.config.get<string>('NOMINA_EMP_CODIGO', '003');
    const rem = Number(this.config.get<string>('NOMINA_ID_REMUNE', '1'));
    await this.dataSource.query(
      `EXEC dbo.usp_Nomina_Sincronizar @anomes=@0, @correl=@1, @emp_codigo=@2, @id_remune=@3`,
      [anomes, correl, emp, rem],
    );
    const filas = await this.dataSource.query(
      `SELECT COUNT(*) AS filas, COUNT(DISTINCT id_traba) AS trabajadores
       FROM dbo.NominaDetalle WHERE anomes=@0 AND correl=@1`,
      [anomes, correl],
    );
    const f = filas[0];
    this.logger.log(
      `Sincronizado ${anomes}/${correl}: ${f.filas} filas, ${f.trabajadores} trabajadores`,
    );
    return {
      periodo: `${anomes}/${correl}`,
      filas: Number(f.filas),
      trabajadores: Number(f.trabajadores),
    };
  }

  async getPeriodos(): Promise<Periodo[]> {
    const rows = await this.dataSource.query(
      `SELECT id_periodo, emp_codigo, id_remune, rem_anomes, rem_correl, rem_fecini, rem_fecfin, st_anulado
       FROM dbo.NominaPeriodo
       ORDER BY rem_anomes DESC, rem_correl DESC`,
    );
    return rows.map((r: Record<string, unknown>) => ({
      id_periodo: Number(r.id_periodo),
      emp_codigo: this.txt(r.emp_codigo),
      id_remune: Number(r.id_remune),
      rem_anomes: this.txt(r.rem_anomes),
      rem_correl: this.txt(r.rem_correl),
      rem_fecini: this.txt(r.rem_fecini),
      rem_fecfin: this.txt(r.rem_fecfin),
      st_anulado: this.txt(r.st_anulado),
    }));
  }

  async getEmpresa() {
    const rows = await this.dataSource.query(
      `SELECT TOP 1 emp_codigo, emp_descri, emp_ruc, emp_dirfis
       FROM dbo.NominaDetalle
       WHERE emp_codigo IS NOT NULL AND LTRIM(RTRIM(emp_codigo)) <> ''
       ORDER BY id DESC`,
    );
    if (!rows[0]) return null;
    return {
      codigo: this.txt(rows[0].emp_codigo),
      descripcion: this.txt(rows[0].emp_descri),
      ruc: this.txt(rows[0].emp_ruc),
      direccion: this.txt(rows[0].emp_dirfis),
    };
  }

  private async leerDetalleLocal(anomes: string, correl: string): Promise<Fila[]> {
    return this.dataSource.query(
      `SELECT id_traba, tra_nrodni, tra_apepat, tra_apemat, tra_nombre, ocu_descri, cc_descri,
              tip_descri, Stip, Est_Emple, reg_descri, reg_fecins, tra_nroafp,
              SdoBasico, SdoBasFam, DiaBasico, totDias, todDiasDMedi, totDiasFalta,
              totHoras, totHorasSob, totMinuto, totMinutoSob, rem_fecini, rem_fecfin, con_descri, Horas,
              Ingresos, Descuentos, Neto, emp_descri, emp_ruc, emp_dirfis, rem_descri
       FROM dbo.NominaDetalle
       WHERE anomes=@0 AND correl=@1
       ORDER BY id_traba, id`,
      [anomes, correl],
    );
  }

  private agrupar(rows: Fila[]): Map<number, Fila[]> {
    const grupos = new Map<number, Fila[]>();
    for (const row of rows) {
      const id = Number(row.id_traba);
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id)!.push(row);
    }
    return grupos;
  }

  private f8(v: unknown): string {
    const s = this.txt(v);
    if (!/^\d{8}$/.test(s)) return '';
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  }

  private fechaLetras(v: unknown): string {
    const s = this.txt(v);
    if (!/^\d{8}$/.test(s)) return '';
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const d = Number(s.slice(6, 8));
    const m = Number(s.slice(4, 6));
    const a = s.slice(0, 4);
    return `${d} de ${meses[m - 1] || ''} de ${a}`;
  }

  private fechaCorta(v: unknown): string {
    const s = this.txt(v);
    if (!/^\d{8}$/.test(s)) return '';
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return `${s.slice(6, 8)} ${meses[Number(s.slice(4, 6)) - 1] || ''} ${s.slice(0, 4)}`;
  }

  private movimDe(f: Fila, concepto: string, diaBasico: number): string {
    if (concepto === 'SUELDO BASICO' && diaBasico > 0) {
      return `${diaBasico.toFixed(2)} DIAS`;
    }
    if (/INASISTENCIA|FALTA/i.test(concepto)) {
      return '';
    }
    const horas = this.num(f.Horas);
    if (horas > 0) return `${horas.toFixed(2)} HORAS`;
    return '';
  }

  private buildDetalle(filas: Fila[]): DetalleNomina {
    const f0 = filas[0];
    const ingresos: ConceptoItem[] = [];
    const descuentos: ConceptoItem[] = [];
    const aportesTrabajador: ConceptoItem[] = [];
    const aportes: ConceptoItem[] = [];

    const diaBasico = this.num(f0.DiaBasico);
    const totDias = this.num(f0.totDias);

    for (const f of filas) {
      const concepto = this.txt(f.con_descri);
      const ing = this.num(f.Ingresos);
      const desc = this.num(f.Descuentos);
      const neto = this.num(f.Neto);
      const movim = this.movimDe(f, concepto, diaBasico);
      const stip = this.txt(f.Stip);
      const item = { concepto, monto: ing, movim };
      if (stip.startsWith('01') && ing > 0) {
        ingresos.push(item);
      } else if (stip.startsWith('02') && desc > 0) {
        descuentos.push({ concepto, monto: desc, movim });
      } else if (stip.startsWith('03') && desc > 0) {
        aportesTrabajador.push({ concepto, monto: desc, movim });
      } else if (stip.startsWith('04') && neto > 0) {
        aportes.push({ concepto, monto: neto, movim });
      } else if (!stip) {
        if (ing > 0) ingresos.push(item);
        if (desc > 0) descuentos.push({ concepto, monto: desc, movim });
        if (neto > 0) aportes.push({ concepto, monto: neto, movim });
      }
    }

    const totalIngresos = ingresos.reduce((a, b) => a + b.monto, 0);
    const totalDescuentos =
      descuentos.reduce((a, b) => a + b.monto, 0) +
      aportesTrabajador.reduce((a, b) => a + b.monto, 0);
    const netoPagar = Math.round((totalIngresos - totalDescuentos) * 100) / 100;

    const remIni = this.txt(f0.rem_fecini);
    const remFin = this.txt(f0.rem_fecfin);
    const est = this.txt(f0.Est_Emple);

    return {
      empresa: this.txt(f0.emp_descri),
      ruc: this.txt(f0.emp_ruc),
      direccion: this.txt(f0.emp_dirfis),
      remune: this.txt(f0.rem_descri),
      sdoBasico: this.num(f0.SdoBasico),
      sdoBasFam: this.num(f0.SdoBasFam),
      totDias,
      totHoras: this.num(f0.totHoras),
      documento: `DNI ${this.txt(f0.tra_nrodni)}`,
      situacion: est === '0' ? 'ACTIVO' : est,
      fIngreso: this.f8(f0.reg_fecins),
      fCese: '',
      regimenPensionario: this.txt(f0.reg_descri),
      cuspp: this.txt(f0.tra_nroafp),
      centroCostos: this.txt(f0.cc_descri),
      ocupacion: this.txt(f0.ocu_descri),
      tipoTrabajador: this.txt(f0.tip_descri),
      condicion: 'DOMICILIADO',
      otrosEmpRta5ta: 'NO TIENE',
      periodoTexto: `${remIni.slice(4, 6)}/${remIni.slice(0, 4)} - Del ${this.f8(remIni)} Al ${this.f8(remFin)}`,
      diasLaborados: `${diaBasico} / ${totDias - diaBasico} / ${this.num(f0.todDiasDMedi)}`,
      jornadaOrdinaria: `${this.num(f0.totHoras)} / ${this.num(f0.totMinuto)}`,
      sobretiempo: `${this.num(f0.totHorasSob)} / ${this.num(f0.totMinutoSob)}`,
      diasLab: diaBasico,
      diasNL: totDias - diaBasico,
      diasSub: this.num(f0.todDiasDMedi),
      horasExtra: this.num(f0.totHorasSob),
      minutos: this.num(f0.totMinuto),
      minutosSob: this.num(f0.totMinutoSob),
      formaPago: '',
      categoria: this.txt(f0.tip_descri).toUpperCase(),
      periodoPlanilla: `MES: ${remIni.slice(4, 6)} - ${remIni.slice(0, 4)} - Del ${this.fechaCorta(remIni)} al ${this.fechaCorta(remFin)}`,
      lugarFecha: `San Juan de Lurigancho, ${this.fechaLetras(remFin)}`,
      representante: 'EDUARDO G. DAMACEN ANGULO',
      cargoRepresentante: 'GERENTE GENERAL',
      ingresos,
      descuentos,
      aportesTrabajador,
      aportes,
      netoPagar,
    };
  }

  async getBoletas(anomes: string, correl: string) {    const rows = await this.leerDetalleLocal(anomes, correl);
    const grupos = this.agrupar(rows);
    const trabajadores: Record<string, unknown>[] = [];
    for (const [, filas] of grupos) {
      const f0 = filas[0];
      const detalle = this.buildDetalle(filas);
      trabajadores.push({
        idTraba: Number(f0.id_traba),
        dni: this.txt(f0.tra_nrodni),
        nombre: `${this.txt(f0.tra_apepat)} ${this.txt(f0.tra_apemat)} ${this.txt(f0.tra_nombre)}`,
        cargo: this.txt(f0.ocu_descri),
        ccDescri: this.txt(f0.cc_descri),
        sdoBasico: detalle.sdoBasico,
        sdoBasFam: detalle.sdoBasFam,
        totDias: detalle.totDias,
        totHoras: detalle.totHoras,
        ingresosTotal: detalle.ingresos.reduce((a, b) => a + b.monto, 0),
        descuentosTotal: detalle.descuentos.reduce((a, b) => a + b.monto, 0),
        netoPagar: detalle.netoPagar,
      });
    }
    return {
      periodo: `${anomes}/${correl}`,
      empresa: this.txt(rows[0]?.emp_descri ?? ''),
      total: trabajadores.length,
      trabajadores,
    };
  }

  async importar(anomes: string, correl: string) {
    const rows = await this.leerDetalleLocal(anomes, correl);
    const grupos = this.agrupar(rows);

    let trabajadoresCreados = 0;
    let boletasGeneradas = 0;
    let boletasOmitidas = 0;
    const boletas = [];

    for (const [, filas] of grupos) {
      const f0 = filas[0];
      const dni = this.txt(f0.tra_nrodni);
      const area = this.txt(f0.cc_descri);

      let worker = await this.workers.findByDni(dni);
      if (!worker) {
        worker = await this.workers.create({
          dni,
          nombres: this.txt(f0.tra_nombre),
          apellidoPaterno: this.txt(f0.tra_apepat),
          apellidoMaterno: this.txt(f0.tra_apemat),
          area: area || undefined,
        });
        trabajadoresCreados++;
      } else if (area && worker.area !== area) {
        worker = await this.workers.update(worker.id, { area, activo: true });
      } else if (!worker.activo) {
        worker = await this.workers.update(worker.id, { activo: true });
      }

      const boleta = await this.boletas.crearDesdeNomina(
        worker.id,
        anomes,
        this.buildDetalle(filas),
      );
      if (boleta) {
        boletas.push(boleta);
        boletasGeneradas++;
      } else {
        boletasOmitidas++;
      }
    }

    this.logger.log(
      `Importación ${anomes}/${correl}: ${grupos.size} trabajadores, ${boletasGeneradas} boletas nuevas, ${boletasOmitidas} omitidas, ${trabajadoresCreados} trabajadores creados`,
    );

    return {
      periodo: `${anomes}/${correl}`,
      trabajadores: grupos.size,
      trabajadoresCreados,
      boletasGeneradas,
      boletasOmitidas,
      boletas,
    };
  }

  /** Genera las boletas de un periodo en un solo paso: sincroniza (lectura ERP) e importa. */
  async generar(anomes: string, correl: string) {
    const sincronizado = await this.sincronizar(anomes, correl);
    const importado = await this.importar(anomes, correl);
    return { ...importado, sincronizado };
  }
}