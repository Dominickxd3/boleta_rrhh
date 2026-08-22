"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Eye, Pencil, RefreshCw, Users, X } from "lucide-react";
import Swal from "sweetalert2";
import { apiFetch } from "@/lib/api";
import AreaSelect from "@/components/AreaSelect";
import { SincronizarTrabajadoresResultado, Worker } from "@/lib/types";

interface FormState {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  email: string;
  telefono: string;
  area: string;
  cargo: string;
}

const vacio: FormState = {
  dni: "",
  nombres: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  email: "",
  telefono: "",
  area: "",
  cargo: "",
};

export default function TrabajadoresPage() {
  const [lista, setLista] = useState<Worker[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("");
  const [totales, setTotales] = useState({ personal: 0, areas: 0 });
  const [form, setForm] = useState<FormState>(vacio);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [visto, setVisto] = useState<Worker | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (busqueda) qs.set("busqueda", busqueda);
      qs.set("soloActivos", "true");
      setLista(await apiFetch<Worker[]>(`/trabajadores?${qs.toString()}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [busqueda]);

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

  useEffect(() => {
    setPagina(1);
  }, [busqueda, areaFiltro]);

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
    () => lista.filter((w) => !areaFiltro || w.area === areaFiltro),
    [lista, areaFiltro],
  );

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginados = visibles.slice(
    (pagina - 1) * POR_PAGINA,
    Math.min(pagina * POR_PAGINA, visibles.length),
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

  const cancelarEdicion = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setForm(vacio);
  };

  const editar = (w: Worker) => {
    setForm({
      dni: w.dni,
      nombres: w.nombres,
      apellidoPaterno: w.apellidoPaterno,
      apellidoMaterno: w.apellidoMaterno,
      email: w.email || "",
      telefono: w.telefono || "",
      area: w.area || "",
      cargo: w.cargo || "",
    });
    setEditandoId(w.id);
    setMostrarForm(true);
  };

  const input =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  const soloLectura =
    "mt-1 w-full rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700";

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

      {mostrarForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={cancelarEdicion}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold">Editar trabajador</h2>
              <button
                onClick={cancelarEdicion}
                title="Cerrar"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={guardar} className="p-5 space-y-3">
              <p className="text-xs text-gray-400">
                Solo el correo y teléfono se pueden modificar; el resto viene del ERP.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">DNI</label>
                  <div className={soloLectura}>{form.dni}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Nombres</label>
                  <div className={soloLectura}>{form.nombres}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Apellido paterno</label>
                  <div className={soloLectura}>{form.apellidoPaterno}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Apellido materno</label>
                  <div className={soloLectura}>{form.apellidoMaterno}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Área</label>
                  <div className={soloLectura}>{form.area || "—"}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Cargo</label>
                  <div className={soloLectura}>{form.cargo || "—"}</div>
                </div>
                <div>
                  <label className="text-xs font-medium">Email</label>
                  <input
                    value={form.email}
                    onChange={set("email")}
                    type="email"
                    className={input}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Teléfono</label>
                  <input value={form.telefono} onChange={set("telefono")} className={input} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white shadow p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <Users className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total de personal
            </p>
            <p className="text-3xl font-bold text-black">{totales.personal}</p>
            <p className="text-xs text-gray-500 mt-1">Trabajadores activos</p>
          </div>
        </div>
        <div className="rounded-xl bg-white shadow p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <Building2 className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total de áreas
            </p>
            <p className="text-3xl font-bold text-black">{totales.areas}</p>
            <p className="text-xs text-gray-500 mt-1">Áreas estimadas</p>
          </div>
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
          className="w-full sm:max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <AreaSelect
          value={areaFiltro}
          onChange={setAreaFiltro}
          areas={areas}
          className="w-full sm:max-w-xs"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-3 md:hidden">
        {paginados.map((w) => (
          <div key={w.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutral-900">
                  {w.nombreCompleto}
                </p>
                <p className="text-xs text-gray-500">DNI {w.dni}</p>
                {w.area && <p className="mt-0.5 truncate text-xs text-gray-500">{w.area}</p>}
                {w.cargo && (
                  <p className="truncate text-xs text-gray-500">{w.cargo}</p>
                )}
              </div>
              {w.activo ? (
                <span className="inline-flex shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Activo
                </span>
              ) : (
                <span className="inline-flex shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                  Inactivo
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="min-w-0 text-xs text-gray-500">
                {w.email ? (
                  <p className="truncate">{w.email}</p>
                ) : (
                  <p className="text-gray-400">Sin email</p>
                )}
                <p>{w.telefono || "—"}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setVisto(w)}
                  title="Ver datos"
                  className="rounded-lg bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => editar(w)}
                  title="Editar"
                  className="rounded-lg bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {visibles.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-gray-400">
            No hay trabajadores que coincidan con el filtro
          </p>
        )}
        {visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-sm text-gray-500">
              Página {pagina} de {totalPaginas}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====== Tabla (escritorio) ====== */}
      <div className="hidden bg-white rounded-xl shadow overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">DNI</th>
                <th className="text-left px-4 py-2">Nombre completo</th>
                <th className="hidden md:table-cell text-left px-4 py-2">Área</th>
                <th className="hidden md:table-cell text-left px-4 py-2">Cargo</th>
                <th className="hidden lg:table-cell text-left px-4 py-2">Email</th>
                <th className="hidden lg:table-cell text-left px-4 py-2">Teléfono</th>
                <th className="text-left px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginados.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{w.dni}</td>
                  <td className="px-4 py-2">{w.nombreCompleto}</td>
                  <td className="hidden md:table-cell px-4 py-2 text-gray-500">{w.area || "—"}</td>
                  <td className="hidden md:table-cell px-4 py-2 text-gray-500">{w.cargo || "—"}</td>
                  <td className="hidden lg:table-cell px-4 py-2">{w.email || "—"}</td>
                  <td className="hidden lg:table-cell px-4 py-2">{w.telefono || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVisto(w)}
                        title="Ver datos"
                        className="rounded-lg bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => editar(w)}
                        title="Editar"
                        className="rounded-lg bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    No hay trabajadores que coincidan con el filtro
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
            <p className="text-sm text-gray-500">
              Mostrando {paginados.length > 0 ? (pagina - 1) * POR_PAGINA + 1 : 0}–
              {Math.min(pagina * POR_PAGINA, visibles.length)} de {visibles.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-500">
                Página {pagina} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {visto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setVisto(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold">Datos del trabajador</h2>
              <button
                onClick={() => setVisto(null)}
                title="Cerrar"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">{visto.nombreCompleto}</p>
                {visto.activo ? (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Activo
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    Inactivo
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">DNI</label>
                  <p className="text-sm">{visto.dni}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Apellido paterno</label>
                  <p className="text-sm">{visto.apellidoPaterno || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Apellido materno</label>
                  <p className="text-sm">{visto.apellidoMaterno || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Nombres</label>
                  <p className="text-sm">{visto.nombres}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Área</label>
                  <p className="text-sm">{visto.area || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Cargo</label>
                  <p className="text-sm">{visto.cargo || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Email</label>
                  <p className="text-sm">{visto.email || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Teléfono</label>
                  <p className="text-sm">{visto.telefono || "—"}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setVisto(null)}
                className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}