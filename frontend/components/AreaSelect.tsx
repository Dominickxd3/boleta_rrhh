"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  areas: string[];
  className?: string;
};

const ALTURA_OPCION = 36;
const MAX_OPCIONES = 8;

export default function AreaSelect({
  value,
  onChange,
  areas,
  className = "",
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [arriba, setArriba] = useState(false);
  const [maxH, setMaxH] = useState(200);
  const [indice, setIndice] = useState(0);
  const contRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const opciones = ["", ...areas];
  const etiqueta = (v: string) => (v === "" ? "Todas las áreas" : v);

  const medir = () => {
    const btn = contRef.current?.querySelector("button");
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vh = window.innerHeight;
    const debajo = vh - r.bottom;
    const espacioArriba = r.top;
    const maxAlt = ALTURA_OPCION * MAX_OPCIONES;
    const minimo = Math.min(140, maxAlt);

    if (debajo >= minimo) {
      setArriba(false);
      setMaxH(Math.min(debajo - 8, maxAlt));
    } else if (espacioArriba > debajo) {
      setArriba(true);
      setMaxH(Math.min(espacioArriba - 8, maxAlt));
    } else {
      setArriba(false);
      setMaxH(Math.max(debajo - 8, 120));
    }
  };

  const abrir = () => {
    medir();
    setIndice(Math.max(0, opciones.indexOf(value)));
    setAbierto(true);
  };

  useEffect(() => {
    if (!abierto) return;
    const onResize = () => medir();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [abierto]);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (contRef.current && !contRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!abierto || !listaRef.current) return;
    listaRef.current
      .querySelector<HTMLElement>(`[data-idx="${indice}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [indice, abierto]);

  const elegir = (v: string) => {
    onChange(v);
    setAbierto(false);
  };

  const manejarTeclado = (e: React.KeyboardEvent) => {
    if (!abierto) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIndice((i) => Math.min(opciones.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setIndice((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setIndice(0);
        break;
      case "End":
        e.preventDefault();
        setIndice(opciones.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        elegir(opciones[indice]);
        break;
      case "Escape":
        setAbierto(false);
        break;
    }
  };

  return (
    <div ref={contRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={manejarTeclado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls="area-listbox"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="truncate">{etiqueta(value)}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
            abierto ? "rotate-180" : ""
          }`}
        />
      </button>

      {abierto && (
        <div
          ref={listaRef}
          id="area-listbox"
          role="listbox"
          aria-label="Áreas"
          className={`absolute z-30 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
            arriba ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          style={{ maxHeight: maxH }}
        >
          {opciones.map((a, i) => (
            <button
              key={a || "__todas"}
              type="button"
              role="option"
              data-idx={i}
              aria-selected={a === value}
              onClick={() => elegir(a)}
              onMouseEnter={() => setIndice(i)}
              className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                a === value ? "bg-blue-50 font-medium text-blue-700" : ""
              } ${i === indice ? "bg-gray-50" : ""}`}
            >
              {etiqueta(a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}