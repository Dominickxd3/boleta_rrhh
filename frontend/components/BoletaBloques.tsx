"use client";

import { forwardRef, useEffect, useState } from "react";
import InlineSignature, {
  type InlineSignatureHandle,
} from "@/components/InlineSignature";
import DetalleContenido from "@/components/BoletaContenido";
import { API_URL } from "@/lib/api";
import { Detalle } from "@/lib/types";

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

    return (
      <div className="space-y-3">
        <DetalleContenido
          detalle={detalle}
          trabajador={trabajador}
          dni={dni}
          periodo={periodo}
          boletaId={boletaId}
        />

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