"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Clock } from "lucide-react";
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
  firmaExpira: string | null;
  detalle: Detalle;
}

interface RespuestaFirma {
  mensaje: string;
  urlVer: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

// Bloqueo por inactividad: si el usuario deja la pestaña abierta sin tocar nada,
// se bloquea la firma para no dejar enlaces abiertos indefinidamente.
const INACTIVIDAD_MS = 15 * 60 * 1000;

function VigenciaEnlace({ expira }: { expira: string }) {
  const fecha = new Date(expira);
  const ahora = new Date();
  const ms = Math.max(0, fecha.getTime() - ahora.getTime());
  const horas = Math.floor(ms / 3600000);
  const dias = Math.floor(horas / 24);
  const horasResto = horas % 24;
  const texto = dias > 0 ? `${dias} d ${horasResto} h` : `${horas} h`;

  return (
    <div className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-4 py-2.5 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
        <Clock className="h-5 w-5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600/80">
          Enlace válido hasta
        </p>
        <p className="truncate text-sm font-semibold text-neutral-800">
          {fecha.toLocaleString("es-PE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
        Vence en {texto}
      </span>
    </div>
  );
}

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
  const [inactivo, setInactivo] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const isMobile = useIsMobile();
  const [padWidth, setPadWidth] = useState(300);

  useEffect(() => {
    const calc = () =>
      setPadWidth(Math.min(window.innerWidth - 32, 560));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setInactivo(false);
      clearTimeout(timer);
      timer = setTimeout(() => setInactivo(true), INACTIVIDAD_MS);
    };
    const eventos = [
      "pointerdown",
      "pointermove",
      "touchstart",
      "touchmove",
      "keydown",
      "scroll",
      "wheel",
    ];
    eventos.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      eventos.forEach((ev) => window.removeEventListener(ev, reset));
    };
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
    if (!aceptaTerminos) {
      setError("Debe aceptar los términos y condiciones antes de firmar");
      return;
    }
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
  }, [firma, token, aceptaTerminos]);

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

  if (inactivo) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-bold text-amber-700">
            Enlace inactivo
          </h1>
          <p className="mb-4 text-gray-600">
            La página estuvo abierta sin actividad durante un tiempo y se
            bloqueó por seguridad. Vuelve a abrir el enlace de firma para
            continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Recargar enlace
          </button>
        </div>
      </main>
    );
  }

  const renderTerminos = () => (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-neutral-50">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-bold text-neutral-900">
              Términos y condiciones de la firma digital
            </h2>
            <p className="text-sm text-neutral-500">
              Boleta de pago de haberes
            </p>
          </div>
          <div className="space-y-4 px-6 py-5 text-sm text-neutral-700">
            <p>
              Al firmar este documento, usted reconoce que su firma
              digital/electrónica tiene plena validez jurídica conforme a la
              legislación peruana y declara lo siguiente:
            </p>

            <section>
              <h3 className="mb-1 font-semibold text-neutral-900">
                1. Base legal de la firma electrónica
              </h3>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <b>Ley N.° 27269 – Ley de Firmas y Certificados Digitales</b>:
                  regula el uso de la firma electrónica y le otorga validez
                  jurídica a los actos celebrados por medios electrónicos.
                </li>
                <li>
                  <b>Decreto Supremo N.° 052-2008-PCM</b>: establece las normas
                  técnicas y legales para la aplicación de los certificados y
                  firmas digitales.
                </li>
                <li>
                  <b>Código Civil, Artículo 141-A</b>: reconoce que la
                  manifestación de voluntad puede realizarse a través de medios
                  electrónicos.
                </li>
                <li>
                  <b>Informe N.° 104-2019-MTPE/2/14.1 del MTPE</b>: confirma que
                  empleadores y trabajadores pueden utilizar firmas digitales o
                  electrónicas en los documentos y contratos laborales.
                </li>
              </ul>
            </section>

            <section>
              <h3 className="mb-1 font-semibold text-neutral-900">
                2. Efectos de su firma
              </h3>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Declara que ha revisado la información de su boleta (sueldo,
                  descuentos, aportes y neto a pagar).
                </li>
                <li>
                  Declara que los datos contenidos son correctos y corresponden
                  al periodo indicado.
                </li>
                <li>
                  Manifiesta su conformidad con la boleta de pago de haberes del
                  periodo.
                </li>
                <li>
                  Reconoce que la firma es de su autoría y de carácter personal
                  e intransferible.
                </li>
              </ul>
            </section>

            <section>
              <h3 className="mb-1 font-semibold text-neutral-900">
                3. Confidencialidad y uso de datos
              </h3>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  La información contenida es de carácter confidencial y de uso
                  exclusivo para la gestión de remuneraciones.
                </li>
                <li>
                  El documento firmado se conserva electrónicamente y puede ser
                  consultado por el trabajador.
                </li>
                <li>El enlace de firma es personal e intransferible.</li>
              </ul>
            </section>

            <section>
              <h3 className="mb-1 font-semibold text-neutral-900">
                4. Validez del documento
              </h3>
              <p>
                El documento firmado digitalmente tiene validez jurídica y valor
                probatorio, conforme a la normativa citada en el numeral 1.
              </p>
            </section>
          </div>
          <div className="flex flex-col gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4 sm:flex-row">
            <button
              type="button"
              onClick={() => setAceptaTerminos(true)}
              className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
            >
              Acepto los términos y firmo
            </button>
            <button
              type="button"
              onClick={() =>
                setError(
                  "Debe aceptar los términos y condiciones para poder firmar su boleta.",
                )
              }
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              No acepto
            </button>
          </div>
        </div>
      </div>
    </div>
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
          {info!.firmaExpira && (
            <div className="mb-3">
              <VigenciaEnlace expira={info!.firmaExpira} />
            </div>
          )}
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
        {!aceptaTerminos && renderTerminos()}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 py-6">
      <div className="mx-auto max-w-3xl px-4 pb-2">
        {info!.firmaExpira && (
          <VigenciaEnlace expira={info!.firmaExpira} />
        )}
      </div>
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
      {!aceptaTerminos && renderTerminos()}
    </main>
  );
}