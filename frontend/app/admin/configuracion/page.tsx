"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Save, Trash2, UploadCloud } from "lucide-react";
import { apiFetch, API_URL } from "@/lib/api";

export default function ConfiguracionPage() {
  const [imagen, setImagen] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/settings/representante-firma`, {
        cache: "no-store",
      });
      if (res.ok) {
        const blob = await res.blob();
        setImagen(URL.createObjectURL(blob));
      } else {
        setImagen(null);
      }
    } catch {
      setImagen(null);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const onArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = () => setSeleccion(reader.result as string);
    reader.readAsDataURL(file);
  };

  const guardar = async () => {
    if (!seleccion) return;
    setGuardando(true);
    setMsg("");
    setError("");
    try {
      await apiFetch("/settings/representante-firma", {
        method: "POST",
        body: JSON.stringify({ imagen: seleccion }),
      });
      setImagen(seleccion);
      setMsg("Firma del representante guardada correctamente");
      if (inputRef.current) inputRef.current.value = "";
      setSeleccion(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    setMsg("");
    setError("");
    try {
      await apiFetch("/settings/representante-firma", { method: "DELETE" });
      setImagen(null);
      setSeleccion(null);
      setMsg("Firma eliminada");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const prev = seleccion || imagen;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Firma del representante legal que aparece en la boleta
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Imagen actual</h2>
          {prev ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={prev}
              alt="Firma del representante legal"
              className="mx-auto max-h-48 rounded-lg border border-neutral-200 bg-white object-contain"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-400">
              No hay firma cargada
            </div>
          )}
          {prev && (
            <button
              type="button"
              onClick={eliminar}
              disabled={guardando}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="size-4" /> Eliminar
            </button>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Subir nueva firma</h2>
          <label
            htmlFor="firma-rep"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center hover:bg-neutral-50"
          >
            <UploadCloud className="size-8 text-neutral-400" />
            <span className="text-sm font-medium">
              Seleccionar imagen (PNG)
            </span>
            <span className="text-xs text-neutral-400">
              La firma debe estar en formato PNG
            </span>
          </label>
          <input
            ref={inputRef}
            id="firma-rep"
            type="file"
            accept="image/png"
            onChange={onArchivo}
            className="hidden"
          />
          {seleccion && (
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Save className="size-4" />
              {guardando ? "Guardando…" : "Guardar firma"}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ImagePlus className="size-4" /> Recomendación
        </h2>
        <p className="text-sm text-muted-foreground">
          La firma del representante legal se mostrará en la boleta en el área
          &quot;REPRESENTANTE LEGAL&quot;, tanto en el PDF como en la vista móvil.
          Se recomienda una imagen PNG con fondo transparente.
        </p>
      </div>
    </div>
  );
}