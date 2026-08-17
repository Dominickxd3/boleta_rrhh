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