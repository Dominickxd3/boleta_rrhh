export interface DetalleItem {
  concepto: string;
  monto: number;
  movim?: string;
}

export interface Detalle {
  ingresos: DetalleItem[];
  descuentos: DetalleItem[];
  aportes?: DetalleItem[];
  aportesTrabajador?: DetalleItem[];
  netoPagar: number;
  empresa?: string;
  ruc?: string;
  direccion?: string;
  remune?: string;
  sdoBasico?: number;
  sdoBasFam?: number;
  totDias?: number;
  totHoras?: number;
  fIngreso?: string;
  fCese?: string;
  regimenPensionario?: string;
  cuspp?: string;
  tipoTrabajador?: string;
  condicion?: string;
  otrosEmpRta5ta?: string;
  ocupacion?: string;
  centroCostos?: string;
  situacion?: string;
  documento?: string;
  diasLab?: number;
  diasNL?: number;
  diasSub?: number;
  horasExtra?: number;
  minutos?: number;
  minutosSob?: number;
  periodoPlanilla?: string;
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

export interface BoletaNominaPreview {
  idTraba: number;
  dni: string;
  nombre: string;
  cargo: string;
  ccDescri: string;
  sdoBasico: number;
  sdoBasFam: number;
  totDias: number;
  totHoras: number;
  ingresosTotal: number;
  descuentosTotal: number;
  netoPagar: number;
}

export interface NominaBoletas {
  periodo: string;
  empresa: string;
  total: number;
  trabajadores: BoletaNominaPreview[];
}

export interface SincronizarResultado {
  periodo: string;
  filas: number;
  trabajadores: number;
}

export interface ImportarResultado {
  periodo: string;
  trabajadores: number;
  trabajadoresCreados: number;
  boletasGeneradas: number;
  boletasOmitidas: number;
  boletas: Boleta[];
}

export interface GenerarResultado extends ImportarResultado {
  sincronizado: SincronizarResultado;
}

export interface Worker {
  id: number;
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
  email: string | null;
  telefono: string | null;
  area: string | null;
  cargo: string | null;
  activo: boolean;
}

export interface Boleta {
  id: number;
  trabajadorId: number;
  trabajador: Worker;
  periodo: string;
  anio: number;
  mes: number;
  estado: "PENDIENTE" | "FIRMADA";
  fechaFirmado: string | null;
  rutaPdf: string | null;
  urlFirma: string | null;
  urlVer: string | null;
  emailEnviado: boolean;
  fechaEmail: string | null;
  detalle?: Detalle;
}

export interface Resumen {
  total: number;
  firmadas: number;
  pendientes: number;
}

export interface AreaBoletas {
  area: string;
  total: number;
  firmadas: number;
  pendientes: number;
  sinCorreo: number;
  boletas: Boleta[];
}

export interface PorAreaResultado {
  total: number;
  areas: AreaBoletas[];
}

export interface SincronizarTrabajadoresResultado {
  fuente: string;
  trabajadoresErp: number;
  nuevos: number;
  actualizados: number;
  inactivos: number;
  totalActivos: number;
  totalInactivos: number;
  ultimaSync: string;
}

export interface ActividadReciente {
  tipo: "generacion" | "firma" | "correo";
  titulo: string;
  detalle: string;
  fecha: string;
  boletaId: number;
}

export interface EnvioMes {
  mes: string;
  label: string;
  enviados: number;
}

export interface EnviarMasivoResultado {
  total: number;
  enviados: number;
  sinEmail: number;
  yaEnviados: number;
  errores: number;
}