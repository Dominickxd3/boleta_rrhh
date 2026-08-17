"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, API_URL, getToken } from "@/lib/api";
import {
  Boleta,
  DetalleItem,
  ImportarResultado,
  NominaBoletas,
  Periodo,
  PorAreaResultado,
  SincronizarResultado,
  Worker,
} from "@/lib/types";
import { nombreMes } from "@/lib/format";

interface Fila {
  concepto: string;
  monto: string;
}

export default function BoletasPage() {
  const ahora = new Date();
  const [anio, setAnio] = useState(String(ahora.getFullYear()));
  const [mes, setMes] = useState(String(ahora.getMonth() + 1).padStart(2, "0"));
  const [porArea, setPorArea] = useState<PorAreaResultado>({
    total: 0,
    areas: [],
  });
  const [soloSinCorreo, setSoloSinCorreo] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(false);

  const [trabajadores, setTrabajadores] = useState<Worker[]>([]);
  const [trabajadorId, setTrabajadorId] = useState("");
  const [ingresos, setIngresos] = useState<Fila[]>([
    { concepto: "Sueldo básico", monto: "" },
  ]);
  const [descuentos, setDescuentos] = useState<Fila[]>([
    { concepto: "", monto: "" },
  ]);
  const [creada, setCreada] = useState<Boleta | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoSel, setPeriodoSel] = useState("");
  const [preview, setPreview] = useState<NominaBoletas | null>(null);
  const [syncRes, setSyncRes] = useState<SincronizarResultado | null>(null);
  const [importRes, setImportRes] = useState<ImportarResultado | null>(null);
  const [nominaCargando, setNominaCargando] = useState(false);
  const [nominaError, setNominaError] = useState("");

  const cargarPorArea = useCallback(async () => {
    const solo = soloSinCorreo ? "&soloPendientes=1" : "";
    try {
      const data = await apiFetch<PorAreaResultado>(
        `/boletas/por-area?anio=${anio}&mes=${mes}${solo}`,
      );
      setPorArea(data);
    } catch {
      /* noop */
    }
  }, [anio, mes, soloSinCorreo]);

  useEffect(() => {
    cargarPorArea();
  }, [cargarPorArea]);

  useEffect(() => {
    apiFetch<Worker[]>("/trabajadores?soloActivos=true")
      .then(setTrabajadores)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    apiFetch<Periodo[]>("/nomina/periodos")
      .then((ps) => {
        setPeriodos(ps);
        const vigente =
          ps.find((p) => p.st_anulado === "0") ?? (ps[0] as Periodo | undefined);
        if (vigente) setPeriodoSel(`${vigente.rem_anomes}/${vigente.rem_correl}`);
      })
      .catch(() => undefined);
  }, []);

  const sumar = (filas: Fila[]): number =>
    filas.reduce((acc, f) => acc + (Number(f.monto) || 0), 0);

  const neto = sumar(ingresos) - sumar(descuentos);

  const actualizarFila = (
    setFilas: React.Dispatch<React.SetStateAction<Fila[]>>,
    index: number,
    campo: keyof Fila,
    valor: string,
  ) =>
    setFilas((filas) =>
      filas.map((f, i) => (i === index ? { ...f, [campo]: valor } : f)),
    );

  const limpiarDetalle = (filas: Fila[]): DetalleItem[] =>
    filas
      .filter((f) => f.concepto.trim() !== "" && f.monto.trim() !== "")
      .map((f) => ({ concepto: f.concepto.trim(), monto: Number(f.monto) }));

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const body = {
        trabajadorId: Number(trabajadorId),
        periodo: `${anio}${mes}`,
        detalle: {
          ingresos: limpiarDetalle(ingresos),
          descuentos: limpiarDetalle(descuentos),
          netoPagar: neto,
        },
      };
      const res = await apiFetch<Boleta>("/boletas", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreada(res);
      cargarPorArea();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  };

  const partes = () => {
    const [anomes, correl] = periodoSel.split("/");
    return { anomes, correl };
  };

  const sincronizar = async () => {
    const { anomes, correl } = partes();
    if (!anomes) return;
    setNominaError("");
    setNominaCargando(true);
    setSyncRes(null);
    setPreview(null);
    try {
      setSyncRes(
        await apiFetch<SincronizarResultado>("/nomina/sincronizar", {
          method: "POST",
          body: JSON.stringify({ anomes, correl }),
        }),
      );
    } catch (err) {
      setNominaError((err as Error).message);
    } finally {
      setNominaCargando(false);
    }
  };

  const verVistaPrevia = async () => {
    const { anomes, correl } = partes();
    if (!anomes) return;
    setNominaError("");
    setNominaCargando(true);
    setImportRes(null);
    try {
      setPreview(
        await apiFetch<NominaBoletas>(
          `/nomina/boletas?anomes=${anomes}&correl=${correl}`,
        ),
      );
    } catch (err) {
      setNominaError((err as Error).message);
    } finally {
      setNominaCargando(false);
    }
  };

  const importar = async () => {
    const { anomes, correl } = partes();
    if (!anomes) return;
    setNominaError("");
    setNominaCargando(true);
    setImportRes(null);
    try {
      setImportRes(
        await apiFetch<ImportarResultado>("/nomina/importar", {
          method: "POST",
          body: JSON.stringify({ anomes, correl }),
        }),
      );
      cargarPorArea();
    } catch (err) {
      setNominaError((err as Error).message);
    } finally {
      setNominaCargando(false);
    }
  };

  const marcarEnviado = async (b: Boleta) => {
    try {
      await apiFetch(`/boletas/${b.id}/email-enviado`, { method: "PATCH" });
      cargarPorArea();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const enviarCorreo = async (b: Boleta) => {
    const email = b.trabajador.email?.trim();
    if (!email) {
      alert(
        `El trabajador ${b.trabajador.nombreCompleto} no tiene email registrado. Edítalo en Trabajadores o usa "Marcar como enviado".`,
      );
      return;
    }
    if (
      !confirm(
        `¿Enviar el link de firma al correo ${email} de ${b.trabajador.nombreCompleto}?`,
      )
    )
      return;
    try {
      await apiFetch(`/boletas/${b.id}/enviar-correo`, { method: "POST" });
      cargarPorArea();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const copiar = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      alert(`${label} copiado`);
    } catch {
      window.prompt("Copiar manualmente:", texto);
    }
  };

  const exportar = async () => {
    try {
      const token = getToken();
      const params = new URLSearchParams({ anio, mes });
      if (soloSinCorreo) params.set("soloPendientes", "1");
      const res = await fetch(`${API_URL}/boletas/exportar?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudo exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `boletas_${anio}-${mes}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const input =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full";

  const renderFilas = (
    filas: Fila[],
    setFilas: React.Dispatch<React.SetStateAction<Fila[]>>,
  ) => (
    <div className="space-y-2">
      {filas.map((f, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={f.concepto}
            onChange={(e) =>
              actualizarFila(setFilas, i, "concepto", e.target.value)
            }
            placeholder="Concepto"
            className={input}
          />
          <input
            value={f.monto}
            onChange={(e) => actualizarFila(setFilas, i, "monto", e.target.value)}
            type="number"
            step="0.01"
            placeholder="Monto"
            className={`${input} max-w-[140px]`}
          />
          <button
            type="button"
            onClick={() => setFilas((fs) => fs.filter((_, x) => x !== i))}
            disabled={filas.length === 1}
            className="text-red-600 hover:underline text-sm px-2 disabled:opacity-30"
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setFilas((fs) => [...fs, { concepto: "", monto: "" }])}
        className="text-blue-600 hover:underline text-sm"
      >
        + Agregar
      </button>
    </div>
  );

  const areasFiltradas = soloPendientes
    ? porArea.areas.filter((a) => a.pendientes > 0)
    : porArea.areas;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Boletas</h1>
          <p className="text-gray-500 text-sm">
            Envío de links por área — {nombreMes(Number(mes))} {anio}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
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

      {/* ====== Grilla de envío por área ====== */}
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 bg-white border rounded-lg px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={soloSinCorreo}
            onChange={(e) => setSoloSinCorreo(e.target.checked)}
          />
          Solo falta enviar correo
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 bg-white border rounded-lg px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Solo pendientes de firma
        </label>
        <button
          onClick={exportar}
          className="ml-auto rounded-lg border border-green-600 px-4 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
        >
          Exportar Excel
        </button>
      </div>

      {porArea.areas.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-400">
          No hay boletas para este periodo.
        </div>
      ) : (
        areasFiltradas.map((a) => (
          <div key={a.area} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-lg">{a.area}</h2>
              <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                {a.total} boletas
              </span>
              <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5">
                {a.firmadas} firmadas
              </span>
              <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                {a.pendientes} pendientes
              </span>
              {a.sinCorreo > 0 && (
                <span className="text-xs bg-red-100 text-red-800 rounded-full px-2 py-0.5">
                  {a.sinCorreo} sin correo
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {a.boletas.map((b) => (
                <div
                  key={b.id}
                  className={`bg-white rounded-xl shadow p-4 flex flex-col gap-3 ${
                    b.emailEnviado ? "" : "ring-2 ring-red-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        {b.trabajador.nombreCompleto}
                      </p>
                      <p className="text-xs text-gray-500">
                        DNI {b.trabajador.dni}
                        {b.trabajador.email ? ` · ${b.trabajador.email}` : ""}
                      </p>
                    </div>
                    {b.estado === "FIRMADA" ? (
                      <span className="inline-block rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
                        Firmada
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
                        Pendiente
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {b.emailEnviado ? (
                      <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 font-medium">
                        Correo enviado
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-red-100 text-red-800 px-2 py-0.5 font-medium">
                        Falta enviar correo
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-auto">
                    {b.urlFirma && (
                      <button
                        onClick={() => copiar(b.urlFirma!, "Link de firma")}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white font-medium hover:bg-blue-700"
                      >
                        Copiar link
                      </button>
                    )}
                    {!b.emailEnviado && (
                      <>
                        <button
                          onClick={() => enviarCorreo(b)}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white font-medium hover:bg-green-700"
                        >
                          Enviar correo
                        </button>
                        <button
                          onClick={() => marcarEnviado(b)}
                          title="Marcar como enviado sin enviar correo"
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 font-medium hover:bg-gray-50"
                        >
                          Marcar como enviado
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* ====== Importar desde nómina ====== */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Importar desde nómina</h2>
          {syncRes && (
            <span className="text-xs text-green-700 bg-green-50 rounded-full px-2 py-0.5">
              {syncRes.periodo} sincronizado: {syncRes.filas} filas ·{" "}
              {syncRes.trabajadores} trabajadores
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="text-sm font-medium block mb-1">Periodo</label>
            <select
              value={periodoSel}
              onChange={(e) => {
                setPeriodoSel(e.target.value);
                setPreview(null);
                setSyncRes(null);
                setImportRes(null);
              }}
              className={input}
            >
              <option value="">Seleccionar…</option>
              {periodos.map((p) => (
                <option key={p.id_periodo} value={`${p.rem_anomes}/${p.rem_correl}`}>
                  {p.rem_anomes}/{p.rem_correl}{" "}
                  {p.st_anulado === "0" ? "(vigente)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={sincronizar}
            disabled={nominaCargando || !periodoSel}
            className="rounded-lg border border-blue-600 px-4 py-2 text-sm text-blue-700 font-medium hover:bg-blue-50 disabled:opacity-50"
          >
            {nominaCargando ? "Sincronizando…" : "1. Sincronizar del ERP"}
          </button>
          <button
            onClick={verVistaPrevia}
            disabled={nominaCargando || !periodoSel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Vista previa
          </button>
          <button
            onClick={importar}
            disabled={nominaCargando || !periodoSel}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {nominaCargando ? "Importando…" : "2. Importar boletas"}
          </button>
        </div>

        {nominaError && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
            {nominaError}
          </div>
        )}

        {importRes && (
          <div className="rounded-lg bg-green-50 text-green-800 text-sm px-3 py-2">
            Importadas <b>{importRes.boletasGeneradas}</b> boletas de{" "}
            {importRes.trabajadores} trabajadores ({importRes.trabajadoresCreados}{" "}
            nuevos). Omitidas: {importRes.boletasOmitidas}.
          </div>
        )}

        {preview && (
          <div className="max-h-72 overflow-auto border rounded-lg">
            <div className="px-3 py-2 bg-gray-50 text-sm font-medium border-b">
              {preview.periodo} — {preview.total} trabajadores · {preview.empresa}
            </div>
            <table className="w-full text-xs">
              <thead className="bg-white text-gray-500">
                <tr>
                  <th className="text-left px-3 py-1.5">Trabajador</th>
                  <th className="text-left px-3 py-1.5">DNI</th>
                  <th className="text-left px-3 py-1.5">Cargo</th>
                  <th className="text-right px-3 py-1.5">Ingresos</th>
                  <th className="text-right px-3 py-1.5">Descuentos</th>
                  <th className="text-right px-3 py-1.5">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.trabajadores.map((t) => (
                  <tr key={t.idTraba}>
                    <td className="px-3 py-1.5">{t.nombre}</td>
                    <td className="px-3 py-1.5">{t.dni}</td>
                    <td className="px-3 py-1.5">{t.cargo}</td>
                    <td className="px-3 py-1.5 text-right">
                      {t.ingresosTotal.toLocaleString("es-PE", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-right text-red-600">
                      {t.descuentosTotal.toLocaleString("es-PE", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {t.netoPagar.toLocaleString("es-PE", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====== Generación manual ====== */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-semibold mb-3">Generar boleta manual</h2>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <form onSubmit={crear} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Trabajador</label>
              <select
                value={trabajadorId}
                onChange={(e) => setTrabajadorId(e.target.value)}
                required
                className={input}
              >
                <option value="">Seleccionar…</option>
                {trabajadores.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nombreCompleto} — {w.dni}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Año</label>
              <select
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                className={input}
              >
                {[2024, 2025, 2026, 2027, 2028].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Mes</label>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className={input}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m).padStart(2, "0")}>
                    {nombreMes(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">Ingresos</h3>
              {renderFilas(ingresos, setIngresos)}
            </div>
            <div>
              <h3 className="font-medium mb-2">Descuentos</h3>
              {renderFilas(descuentos, setDescuentos)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <p className="font-medium">
              Neto a pagar:{" "}
              <span className="text-xl font-bold text-blue-700">
                S/{" "}
                {neto.toLocaleString("es-PE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
            <button
              type="submit"
              disabled={cargando || !trabajadorId}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? "Generando…" : "Generar boleta"}
            </button>
          </div>
        </form>

        {creada && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-5">
            <h2 className="font-semibold text-green-900 mb-2">
              Boleta generada correctamente
            </h2>
            <p className="text-sm text-green-800">
              {creada.trabajador.nombreCompleto} — periodo {creada.periodo}
            </p>
            {creada.urlFirma && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-green-800">Link de firma:</span>
                <code className="text-xs bg-white rounded px-2 py-1 border border-green-200 break-all">
                  {creada.urlFirma}
                </code>
                <button
                  onClick={() => copiar(creada.urlFirma!, "Link de firma")}
                  className="rounded-lg bg-green-700 px-3 py-1.5 text-xs text-white font-medium hover:bg-green-800"
                >
                  Copiar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}