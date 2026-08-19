"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type InlineSignatureHandle = {
  clear: () => void;
  undo: () => void;
  redo: () => void;
  hasSignature: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

type Point = { x: number; y: number };
type Stroke = Point[];

type Props = {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  width?: number;
  height?: number;
  className?: string;
};

const MAX_HISTORY = 40;

function cropToContent(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL("image/png");
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d");
  if (!octx) return canvas.toDataURL("image/png");
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out.toDataURL("image/png");
}

const InlineSignature = forwardRef<InlineSignatureHandle, Props>(
  function InlineSignature(
    {
      value,
      onChange,
      onHistoryChange,
      width = 210,
      height = 60,
      className = "",
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const drawing = useRef(false);
    const currentStroke = useRef<Stroke>([]);
    const strokes = useRef<Stroke[]>([]);
    const redoStack = useRef<Stroke[]>([]);
    const hintRef = useRef<HTMLParagraphElement>(null);
    const skipValueSync = useRef(false);

    const notifyHistory = useCallback(() => {
      onHistoryChange?.({
        canUndo: strokes.current.length > 0,
        canRedo: redoStack.current.length > 0,
      });
    }, [onHistoryChange]);

    const syncChrome = useCallback((filled: boolean) => {
      if (hintRef.current) {
        hintRef.current.style.display = filled ? "none" : "flex";
      }
    }, []);

    const setupCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
      return { canvas, ctx };
    }, [width, height]);

    const drawStroke = useCallback(
      (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
        if (stroke.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        if (stroke.length === 1) {
          ctx.arc(stroke[0].x, stroke[0].y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.stroke();
      },
      [],
    );

    const redraw = useCallback(() => {
      const pair = setupCanvas();
      if (!pair) return;
      const { ctx } = pair;
      ctx.clearRect(0, 0, width, height);
      for (const stroke of strokes.current) {
        drawStroke(ctx, stroke);
      }
      if (currentStroke.current.length > 0) {
        drawStroke(ctx, currentStroke.current);
      }
      syncChrome(
        strokes.current.length > 0 || currentStroke.current.length > 0,
      );
    }, [setupCanvas, width, height, drawStroke, syncChrome]);

    const emit = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || strokes.current.length === 0) {
        skipValueSync.current = true;
        onChange(null);
        return;
      }
      skipValueSync.current = true;
      onChange(cropToContent(canvas));
    }, [onChange]);

    const clear = useCallback(() => {
      strokes.current = [];
      redoStack.current = [];
      redraw();
      emit();
      notifyHistory();
    }, [redraw, emit, notifyHistory]);

    const undo = useCallback(() => {
      if (strokes.current.length === 0) return;
      const last = strokes.current.pop();
      if (last) redoStack.current.push(last);
      redraw();
      emit();
      notifyHistory();
    }, [redraw, emit, notifyHistory]);

    const redo = useCallback(() => {
      if (redoStack.current.length === 0) return;
      const next = redoStack.current.pop();
      if (next) {
        strokes.current.push(next);
        if (strokes.current.length > MAX_HISTORY) {
          strokes.current.shift();
        }
      }
      redraw();
      emit();
      notifyHistory();
    }, [redraw, emit, notifyHistory]);

    useImperativeHandle(
      ref,
      () => ({
        clear,
        undo,
        redo,
        hasSignature: () => strokes.current.length > 0,
        canUndo: () => strokes.current.length > 0,
        canRedo: () => redoStack.current.length > 0,
      }),
      [clear, undo, redo],
    );

    useEffect(() => {
      if (skipValueSync.current) {
        skipValueSync.current = false;
        return;
      }
      if (value) return;
      strokes.current = [];
      redoStack.current = [];
      redraw();
      notifyHistory();
    }, [value, redraw, notifyHistory]);

    useEffect(() => {
      setupCanvas();
      redraw();
      notifyHistory();
    }, [setupCanvas, redraw, notifyHistory]);

    const toPoint = (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left) * (width / rect.width),
        y: (clientY - rect.top) * (height / rect.height),
      };
    };

    const startStroke = (p: Point) => {
      const pair = setupCanvas();
      if (!pair) return;
      drawing.current = true;
      currentStroke.current = [p];
      pair.ctx.beginPath();
      pair.ctx.moveTo(p.x, p.y);
      pair.ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      pair.ctx.fill();
    };

    const moveStroke = (p: Point) => {
      if (!drawing.current) return;
      currentStroke.current.push(p);
      redraw();
    };

    const endStroke = () => {
      if (!drawing.current) return;
      drawing.current = false;
      if (currentStroke.current.length > 0) {
        strokes.current.push([...currentStroke.current]);
        if (strokes.current.length > MAX_HISTORY) {
          strokes.current.shift();
        }
        redoStack.current = [];
        currentStroke.current = [];
        redraw();
        emit();
        notifyHistory();
      }
    };

    // --- Entrada unificada: captura puntos desde CUALQUIER evento (touch o pointer)
    //     y redibuja la firma completa al terminar, para que siempre quede visible. ---
    const handlersRef = useRef({
      start: startStroke,
      move: moveStroke,
      end: endStroke,
      point: toPoint,
    });
    handlersRef.current = {
      start: startStroke,
      move: moveStroke,
      end: endStroke,
      point: toPoint,
    };

    // Pointer Events (mouse/lápiz; también backup para el dedo si el navegador no manda touch)
    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      if (!drawing.current) {
        handlersRef.current.start(
          handlersRef.current.point(e.clientX, e.clientY),
        );
      } else {
        handlersRef.current.move(
          handlersRef.current.point(e.clientX, e.clientY),
        );
      }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      e.preventDefault();
      handlersRef.current.move(
        handlersRef.current.point(e.clientX, e.clientY),
      );
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      handlersRef.current.end();
    };

    // Touch Events NATIVOS con { passive: false } + touchAction:none para que el
    //     navegador no cancele el gesto y el trazo llegue siempre en el celular.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const onStart = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.touches[0] ?? e.changedTouches[0];
        if (!t) return;
        if (drawing.current) {
          handlersRef.current.move(
            handlersRef.current.point(t.clientX, t.clientY),
          );
        } else {
          handlersRef.current.start(
            handlersRef.current.point(t.clientX, t.clientY),
          );
        }
      };
      const onMove = (e: TouchEvent) => {
        if (!drawing.current) return;
        e.preventDefault();
        const t = e.touches[0] ?? e.changedTouches[0];
        if (t) {
          handlersRef.current.move(
            handlersRef.current.point(t.clientX, t.clientY),
          );
        }
      };
      const onEnd = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        if (drawing.current && t) {
          handlersRef.current.move(
            handlersRef.current.point(t.clientX, t.clientY),
          );
        }
        handlersRef.current.end();
        e.preventDefault();
      };

      canvas.addEventListener("touchstart", onStart, { passive: false });
      canvas.addEventListener("touchmove", onMove, { passive: false });
      canvas.addEventListener("touchend", onEnd, { passive: false });
      canvas.addEventListener("touchcancel", onEnd, { passive: false });
      return () => {
        canvas.removeEventListener("touchstart", onStart);
        canvas.removeEventListener("touchmove", onMove);
        canvas.removeEventListener("touchend", onEnd);
        canvas.removeEventListener("touchcancel", onEnd);
      };
    }, []);

    return (
      <div
        ref={wrapRef}
        className={`relative w-full rounded-sm transition ${className}`}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          className="mx-auto block w-full cursor-crosshair bg-transparent outline-none"
          style={{ height: `${height}px`, maxWidth: "100%", touchAction: "none" }}
          aria-label="Área de firma. Dibuje aquí con el mouse o el dedo."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <p
          ref={hintRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10pt] text-neutral-400 select-none"
        >
          Firme aquí
        </p>
      </div>
    );
  },
);

export default InlineSignature;