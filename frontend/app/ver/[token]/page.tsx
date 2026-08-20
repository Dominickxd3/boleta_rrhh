"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, API_URL } from "@/lib/api";
import BoletaBloques from "@/components/BoletaBloques";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fechaLarga } from "@/lib/format";
import { Detalle } from "@/lib/types";

interface InfoVer {
  boletaId: number;
  trabajador: string;
  dni: string;
  periodo: string;
  anio: number;
  mes: number;
  fechaFirmado: string | null;
  detalle: Detalle;
  firma: string | null;
  urlPdf: string;
}

export default function VerDocumentoPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InfoVer | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const isMobile = useIsMobile();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setInfo(await apiFetch<InfoVer>(`/firma/ver/${token}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const descargar = useCallback(async () => {
    if (!info) return;
    try {
      const res = await fetch(`${API_URL}${info.urlPdf}`);
      if (!res.ok) throw new Error("No se pudo obtener el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `boleta-${info.periodo}-${info.trabajador}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  }, [info]);

  if (cargando) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Cargando…</p>
      </main>
    );
  }

  if (error || !info) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <h1 className="font-bold text-lg">Documento firmado</h1>
            <p className="text-sm text-gray-500">
              {info.trabajador} — periodo {info.periodo}
            </p>
            <p className="text-sm text-gray-500">
              Firmado el {fechaLarga(info.fechaFirmado)}
            </p>
          </div>
          <button
            type="button"
            onClick={descargar}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700"
          >
            Descargar PDF
          </button>
        </div>

        {isMobile ? (
          <BoletaBloques
            readOnly
            firmaUrl={info.firma}
            detalle={info.detalle}
            trabajador={info.trabajador}
            dni={info.dni}
            periodo={info.periodo}
            boletaId={info.boletaId}
            firma={null}
            padWidth={0}
            canUndo={false}
            onFirmaChange={() => {}}
            onUndo={() => {}}
            onClear={() => {}}
          />
        ) : (
          <div className="bg-white rounded-xl shadow p-2">
            <iframe
              src={`${API_URL}${info.urlPdf}`}
              className="w-full h-[75vh] rounded-lg"
              title="Documento firmado"
            />
          </div>
        )}
      </div>
    </main>
  );
}