"use client";

import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";

interface Props {
  onChange: (dataUrl: string | null) => void;
}

export default function SignatureCanvas({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "rgb(0,0,0)",
    });
    padRef.current = pad;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
    };
    resize();
    window.addEventListener("resize", resize);

    const onEnd = () => {
      const p = padRef.current;
      onChange(p && !p.isEmpty() ? p.toDataURL("image/png") : null);
    };
    pad.addEventListener("end", onEnd);

    return () => {
      window.removeEventListener("resize", resize);
      pad.removeEventListener("end", onEnd);
      pad.off();
    };
  }, [onChange]);

  const limpiar = () => {
    padRef.current?.clear();
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none"
      />
      <button
        type="button"
        onClick={limpiar}
        className="text-sm text-gray-600 underline hover:text-gray-900"
      >
        Limpiar firma
      </button>
    </div>
  );
}