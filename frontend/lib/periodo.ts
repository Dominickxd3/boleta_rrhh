/**
 * Utilidades para la lógica de períodos y reglas de negocio del módulo Boletas.
 */

export interface PeriodoSeleccion {
  anio: string;
  mes: string;
}

const STORAGE_KEY_ANIO = "boletas_filtro_anio";
const STORAGE_KEY_MES = "boletas_filtro_mes";

/**
 * Retorna el último período cerrado disponible respecto a la fecha actual.
 * Por ejemplo:
 * - Durante septiembre 2026 -> retorna agosto 2026 (mes: "08", anio: "2026")
 * - Durante octubre 2026 -> retorna septiembre 2026 (mes: "09", anio: "2026")
 * - Durante enero 2027 -> retorna diciembre 2026 (mes: "12", anio: "2026")
 */
export function getUltimoPeriodoCerrado(fechaReferencia: Date = new Date()): PeriodoSeleccion {
  // Al restar 1 al mes actual (getMonth() es 0-11):
  // Por ejemplo, para septiembre (getMonth() === 8), new Date(year, 8 - 1, 1) da agosto (month 7).
  // Para enero (getMonth() === 0), new Date(year, 0 - 1, 1) da diciembre del año anterior automáticamente.
  const d = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() - 1, 1);
  return {
    anio: String(d.getFullYear()),
    mes: String(d.getMonth() + 1).padStart(2, "0"),
  };
}

/**
 * Valida si un período (anio, mes) ya finalizó completamente.
 */
export function esPeriodoCerrado(
  anio: number | string,
  mes: number | string,
  fechaReferencia: Date = new Date(),
): boolean {
  const a = Number(anio);
  const m = Number(mes);
  const hoyAnio = fechaReferencia.getFullYear();
  const hoyMes = fechaReferencia.getMonth() + 1;

  return a < hoyAnio || (a === hoyAnio && m < hoyMes);
}

/**
 * Valida si un período (anio, mes) corresponde al mes actual en curso (aún no finalizado).
 */
export function esPeriodoEnCurso(
  anio: number | string,
  mes: number | string,
  fechaReferencia: Date = new Date(),
): boolean {
  const a = Number(anio);
  const m = Number(mes);
  const hoyAnio = fechaReferencia.getFullYear();
  const hoyMes = fechaReferencia.getMonth() + 1;

  return a === hoyAnio && m === hoyMes;
}

/**
 * Valida si un período (anio, mes) es futuro.
 */
export function esPeriodoFuturo(
  anio: number | string,
  mes: number | string,
  fechaReferencia: Date = new Date(),
): boolean {
  const a = Number(anio);
  const m = Number(mes);
  const hoyAnio = fechaReferencia.getFullYear();
  const hoyMes = fechaReferencia.getMonth() + 1;

  return a > hoyAnio || (a === hoyAnio && m > hoyMes);
}

/**
 * Obtiene el período inicial para el módulo de Boletas:
 * 1. Prioriza el período persistido en sessionStorage si existe y es válido.
 * 2. Si no hay nada guardado (primera vez que entra), prioriza por defecto el último período cerrado.
 */
export function getPeriodoPersistido(): PeriodoSeleccion {
  if (typeof window !== "undefined") {
    try {
      const anio = sessionStorage.getItem(STORAGE_KEY_ANIO);
      const mes = sessionStorage.getItem(STORAGE_KEY_MES);
      if (anio && mes && /^\d{4}$/.test(anio) && /^(0[1-9]|1[0-2])$/.test(mes)) {
        return { anio, mes };
      }
    } catch {
      /* sessionStorage bloqueado o no disponible */
    }
  }
  return getUltimoPeriodoCerrado();
}

/**
 * Guarda en sessionStorage el período seleccionado por el usuario.
 */
export function guardarPeriodoPersistido(anio: string, mes: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY_ANIO, anio);
    sessionStorage.setItem(STORAGE_KEY_MES, mes);
  } catch {
    /* noop */
  }
}
