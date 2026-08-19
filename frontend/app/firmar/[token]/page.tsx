"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, API_URL } from "@/lib/api";
import SignatureOnDocument from "@/components/SignatureOnDocument";
import FloatingToolbar, { Icons } from "@/components/FloatingToolbar";
import type { InlineSignatureHandle } from "@/components/InlineSignature";
import BoletaBloques from "@/components/BoletaBloques";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Detalle } from "@/lib/types";

interface InfoFirma {
  boletaId: number;
  trabajador: string;
  dni: string;
  periodo: string;
  anio: number;
  mes: number;
  estado: string;
  yaFirmada: boolean;
  detalle: Detalle;
}

interface RespuestaFirma {
  mensaje: string;
  urlVer: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

export default function FirmarPage() {
  const { token } = useParams<{ token: string }>();
  const sigRef = useRef<InlineSignatureHandle>(null);
  const [info, setInfo] = useState<InfoFirma | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaFirma | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isMobile = useIsMobile();
  const [padWidth, setPadWidth] = useState(300);

  useEffect(() => {
    const calc = () =>
      setPadWidth(Math.min(window.innerWidth - 32, 560));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setInfo(await apiFetch<InfoFirma>(`/firma/firma/${token}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const firmar = useCallback(async () => {
    if (!firma) {
      setError("Debe dibujar su firma antes de continuar");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const res = await apiFetch<RespuestaFirma>(`/firma/firma/${token}`, {
        method: "POST",
        body: JSON.stringify({ firma }),
      });
      setResultado(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }, [firma, token]);

  const onHistoryChange = useCallback(
    (state: { canUndo: boolean; canRedo: boolean }) => {
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
    },
    [],
  );

  const undo = useCallback(() => sigRef.current?.undo(), []);
  const redo = useCallback(() => sigRef.current?.redo(), []);
  const clearSign = useCallback(() => {
    sigRef.current?.clear();
    setFirma(null);
  }, []);

  const zoomIn = useCallback(
    () =>
      setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10)),
    [],
  );
  const zoomOut = useCallback(
    () =>
      setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10)),
    [],
  );
  const zoomReset = useCallback(() => setZoom(1), []);

  const actions = useMemo(
    () => [
      {
        id: "undo",
        label: "Deshacer (Ctrl+Z)",
        icon: Icons.undo,
        onClick: undo,
        disabled: !canUndo,
      },
      {
        id: "redo",
        label: "Rehacer (Ctrl+Y)",
        icon: Icons.redo,
        onClick: redo,
        disabled: !canRedo,
      },
      {
        id: "clear",
        label: "Borrar firma",
        icon: Icons.eraser,
        onClick: clearSign,
        disabled: !firma && !canUndo,
        danger: true,
        dividerBefore: true,
      },
      {
        id: "zoom-out",
        label: "Alejar",
        icon: Icons.zoomOut,
        onClick: zoomOut,
        disabled: zoom <= ZOOM_MIN,
        dividerBefore: true,
      },
      {
        id: "zoom-reset",
        label: `Zoom ${Math.round(zoom * 100)}%`,
        icon: Icons.resetZoom,
        onClick: zoomReset,
        disabled: zoom === 1,
      },
      {
        id: "zoom-in",
        label: "Acercar",
        icon: Icons.zoomIn,
        onClick: zoomIn,
        disabled: zoom >= ZOOM_MAX,
      },
      {
        id: "send",
        label: enviando ? "Firmando…" : "Firmar boleta",
        icon: Icons.send,
        onClick: firmar,
        disabled: !firma || enviando,
        loading: enviando,
        primary: true,
        dividerBefore: true,
      },
    ],
    [
      undo,
      redo,
      canUndo,
      canRedo,
      clearSign,
      firma,
      zoom,
      zoomIn,
      zoomOut,
      zoomReset,
      firmar,
      enviando,
    ],
  );

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando boleta…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-bold text-gray-900">Enlace no válido</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </main>
    );
  }

  if (resultado && info) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
          <div className="mb-3 text-5xl">✅</div>
          <h1 className="mb-1 text-xl font-bold text-green-700">
            ¡Boleta firmada correctamente!
          </h1>
          <p className="mb-4 text-gray-600">
            {info.trabajador} — periodo {info.periodo}
          </p>
          <Link
            href={resultado.urlVer}
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Ver documento firmado
          </Link>
        </div>
      </main>
    );
  }

  if (info?.yaFirmada) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-bold text-amber-700">
            Esta boleta ya fue firmada
          </h1>
          <p className="text-gray-600">
            Solo se puede firmar una vez. Si necesita ver su documento, use el
            enlace de consulta enviado por Recursos Humanos.
          </p>
        </div>
      </main>
    );
  }

  if (isMobile) {
    return (
      <main
        className="flex flex-col bg-neutral-100"
        style={{ height: "100dvh" }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <BoletaBloques
            ref={sigRef}
            detalle={info!.detalle}
            trabajador={info!.trabajador}
            dni={info!.dni}
            periodo={info!.periodo}
            boletaId={info!.boletaId}
            firma={firma}
            padWidth={padWidth}
            canUndo={canUndo}
            onFirmaChange={setFirma}
            onHistoryChange={onHistoryChange}
            onUndo={undo}
            onClear={clearSign}
          />
        </div>

        <div className="border-t border-neutral-200 bg-white px-4 py-3">
          {error && (
            <p className="mb-2 text-center text-sm text-red-600">{error}</p>
          )}
          <button
            type="button"
            onClick={firmar}
            disabled={!firma || enviando}
            className="h-12 w-full rounded-xl bg-green-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Firmando…" : "Firmar boleta"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 py-6">
      <div className="flex justify-center overflow-auto px-4">
        <div
          className="origin-top transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
        >
          <SignatureOnDocument
            ref={sigRef}
            pdfUrl={`${API_URL}/firma/firma/${token}/pdf`}
            onChange={setFirma}
            onHistoryChange={onHistoryChange}
          />
        </div>
      </div>

      {error && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2">
          <p className="rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
            {error}
          </p>
        </div>
      )}

      <FloatingToolbar
        actions={actions}
        hint={
          canUndo
            ? undefined
            : "Firme sobre la línea · Deshacer / Rehacer por trazo"
        }
      />
    </main>
  );
}