"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import InlineSignature, {
  type InlineSignatureHandle,
} from "@/components/InlineSignature";

export type SignatureOnDocumentHandle = {
  clear: () => void;
  undo: () => void;
  redo: () => void;
  hasSignature: () => boolean;
};

type Props = {
  pdfUrl: string;
  mode?: "inline" | "preview";
  onChange?: (dataUrl: string | null) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
};

/** Escala de visualización del PDF (ancho de página en píxeles de pantalla) */
const BASE_SCALE = 1.6;

/** Área FIRMA TRABAJADOR en coordenadas del PDF (pt desde el borde superior). */
const FIRMA_LEFT = 330;
const FIRMA_WIDTH = 210;
const FIRMA_BOTTOM = 716; // = 841.89 - 126 (encima de la línea a 120pt del borde inferior)
const FIRMA_HEIGHT = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const SignatureOnDocument = forwardRef<
  SignatureOnDocumentHandle,
  Props
>(function SignatureOnDocument(
  { pdfUrl, mode = "inline", onChange, onHistoryChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<InlineSignatureHandle>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispScale, setDispScale] = useState(BASE_SCALE);

  // Ajusta la escala para que el documento quepa en pantallas pequeñas (móvil/tablet)
  useEffect(() => {
    const calc = () => Math.min((window.innerWidth - 24) / PAGE_W, BASE_SCALE);
    const update = () => setDispScale(Math.max(calc(), 0.4));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const firmaW = FIRMA_WIDTH * dispScale;
  const firmaH = FIRMA_HEIGHT * dispScale;

  useEffect(() => {
    let cancel = false;

    const render = async () => {
      const cont = contRef.current;
      const canvas = canvasRef.current;
      if (!cont || !canvas) return;
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const data = await (await fetch(pdfUrl)).arrayBuffer();
        if (cancel) return;
        const pdf = await pdfjs
          .getDocument({ data, standardFontDataUrl: "/standard_fonts/" })
          .promise;
        if (cancel) return;
        const page = await pdf.getPage(1);
        if (cancel) return;

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const viewport = page.getViewport({
          scale: dispScale * ratio,
        });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${PAGE_W * dispScale}px`;
        canvas.style.height = `${PAGE_H * dispScale}px`;

        await page.render({ canvas, viewport }).promise;
        if (cancel) return;

        setListo(true);
        setError(null);
      } catch (e) {
        if (!cancel) {
          setError(e instanceof Error ? e.message : "No se pudo cargar el documento");
        }
      }
    };

    render();
    return () => {
      cancel = true;
    };
  }, [pdfUrl, dispScale]);

  const clear = useCallback(() => sigRef.current?.clear(), []);
  const undo = useCallback(() => sigRef.current?.undo(), []);
  const redo = useCallback(() => sigRef.current?.redo(), []);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      undo,
      redo,
      hasSignature: () => sigRef.current?.hasSignature() ?? false,
    }),
    [clear, undo, redo],
  );

  return (
    <div
      ref={contRef}
      className="relative overflow-hidden rounded-lg border bg-gray-100"
      style={{ width: PAGE_W * dispScale, maxWidth: "100%" }}
    >
      <div
        className="relative mx-auto"
        style={{ width: PAGE_W * dispScale, height: PAGE_H * dispScale }}
      >
        <canvas ref={canvasRef} className="block" />
        {listo && mode === "inline" && (
          <div
            className="absolute"
            style={{
              left: FIRMA_LEFT * dispScale,
              top: (FIRMA_BOTTOM - FIRMA_HEIGHT) * dispScale,
              width: firmaW,
              height: firmaH,
            }}
          >
            <InlineSignature
              ref={sigRef}
              onChange={onChange ?? (() => {})}
              onHistoryChange={onHistoryChange}
              width={firmaW}
              height={firmaH}
            />
          </div>
        )}
      </div>
      {!listo && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-gray-500">Cargando documento…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-red-600">
            No se pudo cargar el documento: {error}
          </p>
        </div>
      )}
    </div>
  );
});

export default SignatureOnDocument;