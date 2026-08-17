"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, fetchPdfUrl } from "@/lib/api";
import { Boleta, PorAreaResultado, Resumen, Worker } from "@/lib/types";
import { fechaLarga, nombreMes } from "@/lib/format";

export default function Dashboard() {
  const ahora = new Date();
  const [anio, setAnio] = useState(String(ahora.getFullYear()));
  const [mes, setMes] = useState(String(ahora.getMonth() + 1).padStart(2, "0"));
  const [resumen, setResumen] = useState<Resumen>({
    total: 0,
    firmadas: 0,
    pendientes: 0,
  });
  const [porArea, setPorArea] = useState<PorAreaResultado>({ total: 0, areas: [] });
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [nTrabajadores, setNTrabajadores] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [res, areas, lista, trabs] = await Promise.all([
        apiFetch<Resumen>(`/boletas/resumen?anio=${anio}&mes=${mes}`),
        apiFetch<PorAreaResultado>(`/boletas/por-area?anio=${anio}&mes=${mes}`),
        apiFetch<Boleta[]>(`/boletas?anio=${anio}&mes=${mes}`),
        apiFetch<Worker[]>("/trabajadores"),
      ]);
      setResumen(res);
      setPorArea(areas);
      setBoletas(lista);
      setNTrabajadores(trabs.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const pct =
    resumen.total > 0 ? Math.round((resumen.firmadas / resumen.total) * 100) : 0;

  const sinCorreo = porArea.areas.reduce((a, b) => a + b.sinCorreo, 0);

  const copiar = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      alert(`${label} copiado`);
    } catch {
      window.prompt("Copiar manualmente:", texto);
    }
  };

  const verPdf = async (id: number) => {
    try {
      const url = await fetchPdfUrl(`/boletas/${id}/pdf`);
      window.open(url, "_blank");
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const kpis = [
    {
      label: "Trabajadores",
      valor: nTrabajadores,
      color: "text-slate-800",
      fondo: "bg-white",
    },
    {
      label: "Boletas del periodo",
      valor: resumen.total,
      color: "text-slate-800",
      fondo: "bg-white",
    },
    {
      label: "Firmadas",
      valor: resumen.firmadas,
      color: "text-green-800",
      fondo: "bg-green-50 border border-green-200",
    },
    {
      label: "Sin firmar",
      valor: resumen.pendientes,
      color: "text-amber-800",
      fondo: "bg-amber-50 border border-amber-200",
    },
    {
      label: "Sin enviar correo",
      valor: sinCorreo,
      color: "text-red-800",
      fondo: "bg-red-50 border border-red-200",
    },
    {
      label: "% firmado",
      valor: `${pct}%`,
      color: "text-blue-800",
      fondo: "bg-blue-50 border border-blue-200",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inicio</h1>
          <p className="text-gray-500 text-sm">
            Resumen de boletas — {nombreMes(Number(mes))} {anio}
          </p>
        </div>
        <div className="flex gap-2 ml-auto">
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            {[2024, 2025, 2026, 2027, 2028].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m).padStart(2, "0")}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl shadow p-4 ${k.fondo} ${cargando ? "opacity-60" : ""}`}
          >
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {/* Progreso de firma */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Avance de firmas</h2>
          <span className="text-sm text-gray-500">
            {resumen.firmadas} de {resumen.total} boletas
          </span>
        </div>
        <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {cargando ? "…" : `${pct}% firmado`}
        </p>
      </div>

      {/* Firmas por área */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">
          Firmas por área ({porArea.areas.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Área</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-right px-4 py-2">Firmadas</th>
                <th className="text-right px-4 py-2">Pendientes</th>
                <th className="text-right px-4 py-2">Sin correo</th>
                <th className="text-left px-4 py-2">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porArea.areas.map((a) => {
                const p = a.total > 0 ? Math.round((a.firmadas / a.total) * 100) : 0;
                return (
                  <tr key={a.area} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{a.area}</td>
                    <td className="px-4 py-2 text-right">{a.total}</td>
                    <td className="px-4 py-2 text-right text-green-700">
                      {a.firmadas}
                    </td>
                    <td className="px-4 py-2 text-right text-amber-700">
                      {a.pendientes}
                    </td>
                    <td className="px-4 py-2 text-right text-red-700">
                      {a.sinCorreo}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{p}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {porArea.areas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Sin datos para este periodo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Boletas del periodo */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">
          Boletas del mes ({cargando ? "…" : boletas.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Trabajador</th>
                <th className="text-left px-4 py-2">Área</th>
                <th className="text-left px-4 py-2">DNI</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Firmado el</th>
                <th className="text-left px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boletas.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{b.trabajador.nombreCompleto}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {b.trabajador.area || "—"}
                  </td>
                  <td className="px-4 py-2">{b.trabajador.dni}</td>
                  <td className="px-4 py-2">
                    {b.estado === "FIRMADA" ? (
                      <span className="inline-block rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                        Firmada
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{fechaLarga(b.fechaFirmado)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      {b.urlFirma && (
                        <button
                          onClick={() => copiar(b.urlFirma!, "Link de firma")}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Copiar link firma
                        </button>
                      )}
                      {b.estado === "FIRMADA" && (
                        <button
                          onClick={() => verPdf(b.id)}
                          className="text-green-600 hover:underline text-xs"
                        >
                          Ver PDF firmado
                        </button>
                      )}
                      {b.estado === "PENDIENTE" && (
                        <button
                          onClick={() => verPdf(b.id)}
                          className="text-gray-600 hover:underline text-xs"
                        >
                          Vista previa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && boletas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    No hay boletas para este periodo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}