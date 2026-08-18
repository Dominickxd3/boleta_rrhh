export function money(monto: number): string {
  return `S/ ${monto.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fechaLarga(fecha: string | Date | null): string {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function nombreMes(mes: number): string {
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return meses[mes - 1] ?? "";
}

const AREAS_LIMPIAS: Record<string, string> = {
  "ADM ADMINISTRACION - 2020": "Administración",
  "ADM ASEGURAMIENTO DE LA CALIDAD - 2020": "Aseguramiento de la Calidad",
  "ADM CONTABILIDAD - 2020": "Contabilidad",
  "ADM FINANZAS - 2020": "Finanzas",
  "ADM GERENCIAS - 2020": "Gerencias",
  "ADM GESTION HUMANA - 2020": "Gestión Humana",
  "ADM LIMPIEZA - 2020": "Limpieza",
  "ADM SEG Y SALUD OCUPACIONAL - 2020": "Seg y Salud Ocupacional",
  "ADM SEGURIDAD Y VIGILANCIA - 2020": "Seguridad y Vigilancia",
  "ADM SISTEMAS - 2020": "Sistemas",
  "COM COMERCIAL - 2020": "Comercial",
  "COM DESARROLLO DE PRODUCTO - 2020": "Desarrollo de Producto",
  "COM DISTRIBUCION - 2020": "Distribución",
  "COM FACTURACION - 2020": "Facturación",
  "COM LOGISTICA - 2020": "Logística",
  "COM MANTENIMIENTO GENERAL - 2020": "Mantenimiento General",
  "COM PRODUCCION - 2020": "Producción",
  "COM PUNTO VENTA - VALLE SAGRADO": "Punto Venta - Valle Sagrado",
  "COM REPROCESO - 2019": "Reproceso - 2019",
};

/**
 * Nombre limpio de área para mostrar en el dashboard (sin prefijo ADM/COM ni año).
 * Solo afecta la presentación, no la data original.
 */
export function nombreAreaLimpio(area: string | null): string {
  if (!area) return "";
  const limpio = AREAS_LIMPIAS[area];
  if (limpio) return limpio;
  return area.replace(/^(ADM|COM)\s+/, "").replace(/\s+-\s+\d{4}$/, "");
}