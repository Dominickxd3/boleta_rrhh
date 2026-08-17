"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import Swal from "sweetalert2";
import { apiFetch } from "@/lib/api";
import { SincronizarTrabajadoresResultado, Worker } from "@/lib/types";

interface FormState {
  email: string;
  telefono: string;
  area: string;
  cargo: string;
}

const vacio: FormState = { email: "", telefono: "", area: "", cargo: "" };

export default function TrabajadoresPage() {
  const [lista, setLista] = useState<Worker[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);
  const [totales, setTotales] = useState({ personal: 0, areas: 0 });
  const [form, setForm] = useState<FormState>(vacio);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [progreso, setProgreso] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (busqueda) qs.set("busqueda", busqueda);
      if (soloActivos) qs.set("soloActivos", "true");
      setLista(await apiFetch<Worker[]>(`/trabajadores?${qs.toString()}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [busqueda, soloActivos]);

  const cargarTotales = useCallback(async () => {
    try {
      const activos = await apiFetch<Worker[]>("/trabajadores?soloActivos=true");
      setTotales({
        personal: activos.length,
        areas: new Set(activos.map((w) => w.area).filter(Boolean)).size,
      });
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarTotales();
  }, [cargar, cargarTotales]);

  const sincronizar = async () => {
    setSincronizando(true);
    setError("");
    setProgreso(0);
    const timer = setInterval(() => {
      setProgreso((p) => (p >= 90 ? p : p + Math.random() * 14));
    }, 250);
    try {
      const res = await apiFetch<SincronizarTrabajadoresResultado>(
        "/trabajadores/sincronizar",
        { method: "POST" },
      );
      setProgreso(100);
      await cargar();
      await cargarTotales();
      await Swal.fire({
        icon: "success",
        title: "Sincronización completada",
        html: `<b>${res.trabajadoresErp}</b> trabajadores del ERP<br/>` +
          `<b>${res.nuevos}</b> nuevos · <b>${res.actualizados}</b> actualizados · <b>${res.inactivos}</b> inactivos<br/>` +
          `Ahora <b>${res.totalActivos}</b> activos en total`,
        confirmButtonColor: "#059669",
      });
    } catch (e) {
      setError((e as Error).message);
      Swal.fire({
        icon: "error",
        title: "Error al sincronizar",
        text: (e as Error).message,
        confirmButtonColor: "#dc2626",
      });
    } finally {
      clearInterval(timer);
      setSincronizando(false);
    }
  };

  const areas = useMemo(
    () =>
      Array.from(new Set(lista.map((w) => w.area).filter((a): a is string => !!a))).sort(),
    [lista],
  );

  const visibles = useMemo(
    () =>
      lista.filter((w) => !areaFiltro || w.area === areaFiltro),
    [lista, areaFiltro],
  );

  const set = (campo: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoId) return;
    setError("");
    try {
      const body = {
        email: form.email || undefined,
        telefono: form.telefono || undefined,
        area: form.area || undefined,
        cargo: form.cargo || undefined,
      };
      await apiFetch(`/trabajadores/${editandoId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setForm(vacio);
      setEditandoId(null);
      setMostrarForm(false);
      cargar();
      cargarTotales();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const editar = (w: Worker) => {
    setForm({
      email: w.email || "",
      telefono: w.telefono || "",
      area: w.area || "",
      cargo: w.cargo || "",
    });
    setEditandoId(w.id);
    setMostrarForm(true);
  };

  const eliminar = async (w: Worker) => {
    if (!confirm(`¿Eliminar a ${w.nombreCompleto}?`)) return;
    try {
      await apiFetch(`/trabajadores/${w.id}`, { method: "DELETE" });
      cargar();
      cargarTotales();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const input =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Trabajadores</h1>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? "Sincronizando…" : "Sincronizar con el ERP"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white shadow p-5">
          <p className="text-sm text-gray-500">Total de personal</p>
          <p className="text-3xl font-bold text-emerald-600">{totales.personal}</p>
          <p className="text-xs text-gray-400 mt-1">Trabajadores activos</p>
        </div>
        <div className="rounded-xl bg-white shadow p-5">
          <p className="text-sm text-gray-500">Total de áreas</p>
          <p className="text-3xl font-bold text-blue-600">{totales.areas}</p>
          <p className="text-xs text-gray-400 mt-1">Áreas estimadas</p>
        </div>
      </div>

      {sincronizando && (
        <div className="rounded-lg bg-white shadow p-4 space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Sincronizando trabajadores con el ERP…</span>
            <span>{Math.round(progreso)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progreso}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            Cargando la planilla actual desde DB_GP_Trabajos_TEST…
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={areaFiltro}
          onChange={(e) => setAreaFiltro(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
            className="h-4 w-4"
          />
          Solo activos
        </label>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {mostrarForm && (
        <form
          onSubmit={guardar}
          className="bg-white rounded-xl shadow p-5 space-y-4"
        >
          <h2 className="font-semibold">Editar trabajador</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                value={form.email}
                onChange={set("email")}
                type="email"
                className={input}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Teléfono</label>
              <input value={form.telefono} onChange={set("telefono")} className={input} />
            </div>
            <div>
              <label className="text-sm font-medium">Área</label>
              <input value={form.area} onChange={set("area")} className={input} />
            </div>
            <div>
              <label className="text-sm font-medium">Cargo</label>
              <input value={form.cargo} onChange={set("cargo")} className={input} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarForm(false);
                setEditandoId(null);
                setForm(vacio);
              }}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">DNI</th>
                <th className="text-left px-4 py-2">Nombre completo</th>
                <th className="text-left px-4 py-2">Área</th>
                <th className="text-left px-4 py-2">Cargo</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Teléfono</th>
                <th className="text-left px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((w) => (
                <tr
                  key={w.id}
                  className={w.activo ? "hover:bg-gray-50" : "bg-gray-50 opacity-70 hover:bg-gray-100"}
                >
                  <td className="px-4 py-2">{w.dni}</td>
                  <td className="px-4 py-2">{w.nombreCompleto}</td>
                  <td className="px-4 py-2 text-gray-500">{w.area || "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{w.cargo || "—"}</td>
                  <td className="px-4 py-2">
                    {w.activo ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{w.email || "—"}</td>
                  <td className="px-4 py-2">{w.telefono || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3">
                      <button
                        onClick={() => editar(w)}
                        className="text-blue-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminar(w)}
                        className="text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                    No hay trabajadores que coincidan con el filtro
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