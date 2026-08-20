"use client";

import { forwardRef, useEffect, useState, type ReactNode } from "react";
import InlineSignature, {
  type InlineSignatureHandle,
} from "@/components/InlineSignature";
import { API_URL } from "@/lib/api";
import { Detalle } from "@/lib/types";
import { money } from "@/lib/format";

type Props = {
  detalle: Detalle;
  trabajador: string;
  dni: string;
  periodo: string;
  boletaId: number;
  firma: string | null;
  padWidth: number;
  canUndo: boolean;
  readOnly?: boolean;
  firmaUrl?: string | null;
  onFirmaChange: (dataUrl: string | null) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onUndo: () => void;
  onClear: () => void;
};

function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="bg-neutral-800 px-3 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white">
          {titulo}
        </h3>
      </div>
      <div className="divide-y divide-neutral-100">{children}</div>
    </section>
  );
}

function Campo({
  etiqueta,
  valor,
  mono,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">
        {etiqueta}
      </p>
      <p className={`text-sm text-neutral-900 ${mono ? "font-mono" : "font-medium"}`}>
        {valor}
      </p>
    </div>
  );
}

function MontoRow({
  concepto,
  monto,
  negativo,
}: {
  concepto: string;
  monto: number;
  negativo?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <span className="text-sm text-neutral-700">{concepto}</span>
      <span
        className={`shrink-0 font-mono text-sm ${
          negativo ? "text-red-600" : "text-neutral-900"
        }`}
      >
        {negativo ? `− ${money(monto)}` : money(monto)}
      </span>
    </div>
  );
}

const BoletaBloques = forwardRef<InlineSignatureHandle, Props>(
  function BoletaBloques(
    {
      detalle,
      trabajador,
      dni,
      periodo,
      boletaId,
      firma,
      padWidth,
      canUndo,
      readOnly = false,
      firmaUrl = null,
      onFirmaChange,
      onHistoryChange,
      onUndo,
      onClear,
    },
    ref,
  ) {
    const [repUrl, setRepUrl] = useState<string | null>(null);

    useEffect(() => {
      let activo = true;
      fetch(`${API_URL}/settings/representante-firma`, { cache: "no-store" })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => {
          if (activo && b) setRepUrl(URL.createObjectURL(b));
        })
        .catch(() => {
          /* sin firma de representante */
        });
      return () => {
        activo = false;
      };
    }, []);

    const concepto = (grupo: string, items: { concepto: string; monto: number }[]) => (
      <div>
        <div className="bg-neutral-100 px-3 py-1">
          <p className="text-xs font-semibold text-neutral-700">{grupo}</p>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-2 text-sm text-neutral-400">—</p>
        ) : (
          items.map((i, idx) => (
            <MontoRow key={idx} concepto={i.concepto} monto={i.monto} />
          ))
        )}
      </div>
    );

    return (
      <div className="space-y-3">
        {/* ENCABEZADO: logo + datos empresa + título */}
        <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo_gp.png"
              alt=""
              className="h-12 w-auto object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight text-neutral-900">
                {detalle.empresa || "EMPRESA S.A.C."}
              </p>
              <p className="text-xs text-neutral-600">
                R.U.C.: {detalle.ruc || ""}
              </p>
              <p className="text-xs text-neutral-600">{detalle.direccion || ""}</p>
            </div>
            <p className="shrink-0 text-[10px] font-semibold text-neutral-500">
              BOLETA N° {String(boletaId).padStart(6, "0")}
            </p>
          </div>
          <h2 className="mt-2 text-center text-base font-bold text-neutral-900">
            BOLETA DE PAGO
          </h2>
          <p className="text-center text-xs text-neutral-500">Periodo {periodo}</p>
        </div>

        {/* IDENTIDAD */}
        <Bloque titulo="Datos del trabajador">
          <Campo etiqueta="Documento de identidad" valor={`DNI ${dni}`} mono />
          <Campo etiqueta="Apellidos y nombre" valor={trabajador.toUpperCase()} />
          <Campo etiqueta="Situación" valor={detalle.situacion || "-"} />
        </Bloque>

        {/* FECHAS */}
        <Bloque titulo="Fechas y régimen">
          <Campo etiqueta="Fec. ingreso" valor={detalle.fIngreso || "-"} />
          <Campo etiqueta="Fec. cese" valor={detalle.fCese || "-"} />
          <Campo etiqueta="Tipo de trabajador" valor={(detalle.tipoTrabajador || "-").toUpperCase()} />
          <Campo etiqueta="Régimen pensionario" valor={detalle.regimenPensionario || "-"} />
          <Campo etiqueta="CUSPP" valor={detalle.cuspp || "-"} mono />
        </Bloque>

        {/* JORNADA */}
        <Bloque titulo="Jornada">
          <Campo etiqueta="Días laborados" valor={String(detalle.diasLab ?? 0)} />
          <Campo etiqueta="Días no laborados" valor={String(detalle.diasNL ?? 0)} />
          <Campo etiqueta="Días subsidiados" valor={String(detalle.diasSub ?? 0)} />
          <Campo etiqueta="Condición" valor={detalle.condicion || "-"} />
          <Campo etiqueta="Jornada ordinaria · Total horas" valor={String(detalle.totHoras ?? 0)} />
          <Campo etiqueta="Jornada ordinaria · Minutos" valor={String(detalle.minutos ?? 0)} />
          <Campo etiqueta="Sobretiempo · Total horas" valor={String(detalle.horasExtra ?? 0)} />
          <Campo etiqueta="Sobretiempo · Minutos" valor={String(detalle.minutosSob ?? 0)} />
        </Bloque>

        {/* SUELDO */}
        <Bloque titulo="Sueldo básico">
          <MontoRow concepto="Sueldo básico" monto={detalle.sdoBasico ?? 0} />
        </Bloque>

        {/* CENTRO */}
        <Bloque titulo="Centro de costos">
          <Campo etiqueta="Centro de costos" valor={detalle.centroCostos || "-"} />
          <Campo etiqueta="Ocupación" valor={detalle.ocupacion || "-"} />
          <Campo etiqueta="Otros emp. rta. 5ta. cat." valor={detalle.otrosEmpRta5ta || "-"} />
        </Bloque>

        {/* PERIODO / PLANILLA */}
        <Bloque titulo="Planilla">
          <Campo etiqueta="Periodo de planilla" valor={detalle.periodoPlanilla || "-"} />
        </Bloque>

        {/* CONCEPTOS */}
        <Bloque titulo="Conceptos">
          {concepto("01 Ingresos", detalle.ingresos)}
          {detalle.descuentos.length > 0 && concepto("02 Descuentos", detalle.descuentos)}
          {detalle.aportesTrabajador && detalle.aportesTrabajador.length > 0 && (
            concepto("03 Aportes del Trabajador", detalle.aportesTrabajador)
          )}
        </Bloque>

        {/* TOTALES */}
        <Bloque titulo="Totales">
          <MontoRow
            concepto="Total ingresos"
            monto={detalle.ingresos.reduce((s, i) => s + i.monto, 0)}
          />
          <MontoRow
            concepto="Total descuentos"
            monto={
              detalle.descuentos.reduce((s, d) => s + d.monto, 0) +
              (detalle.aportesTrabajador || []).reduce((s, d) => s + d.monto, 0)
            }
            negativo
          />
          <div className="flex items-center justify-between gap-3 bg-green-50 px-3 py-2">
            <span className="text-sm font-bold text-neutral-900">IMPORTE NETO</span>
            <span className="font-mono text-base font-bold text-green-700">
              {money(detalle.netoPagar)}
            </span>
          </div>
        </Bloque>

        {/* APORTES EMPLEADOR */}
        {detalle.aportes && detalle.aportes.length > 0 && (
          <Bloque titulo="04 Aportes del Empleador">
            {detalle.aportes.map((i, idx) => (
              <MontoRow key={idx} concepto={`${i.concepto}:`} monto={i.monto} />
            ))}
          </Bloque>
        )}

        {/* FIRMAS */}
        <section className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
          <div className="mb-1 text-center">
            {repUrl ? (
              <div className="flex h-20 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={repUrl}
                  alt="Firma del representante legal"
                  className="max-h-20 w-auto object-contain"
                />
              </div>
            ) : (
              <>
                <div className="mx-auto h-px w-2/3 border-t border-neutral-500" />
                <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-600">
                  Representante legal
                </p>
              </>
            )}
            {repUrl && (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-600">
                Representante legal
              </p>
            )}
          </div>

          <div className="mt-4">
            {readOnly ? (
              <div className="flex h-20 items-center justify-center rounded-xl border border-neutral-200 bg-white">
                {firmaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={firmaUrl}
                    alt="Firma del trabajador"
                    className="max-h-20 w-auto object-contain"
                  />
                ) : (
                  <span className="text-sm text-neutral-400">—</span>
                )}
              </div>
            ) : (
              <div
                className={`overflow-hidden rounded-xl border-2 bg-sky-50/40 transition-colors ${
                  firma
                    ? "border-solid border-green-500"
                    : "border-dashed border-sky-400/60"
                }`}
              >
                <InlineSignature
                  ref={ref}
                  width={padWidth}
                  height={150}
                  onChange={onFirmaChange}
                  onHistoryChange={onHistoryChange}
                />
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-neutral-600">
                Firma del trabajador
              </p>
              {!readOnly && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 disabled:opacity-40"
                  >
                    Deshacer
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    disabled={!firma && !canUndo}
                    className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-red-600 disabled:opacity-40"
                  >
                    Borrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  },
);

export default BoletaBloques;