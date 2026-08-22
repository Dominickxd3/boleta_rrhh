"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Link2,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import Swal from "sweetalert2";
import { apiFetch, API_URL, getToken } from "@/lib/api";
import {
  Boleta,
  EnviarMasivoResultado,
  GenerarResultado,
  Periodo,
  PorAreaResultado,
} from "@/lib/types";
import { nombreMes } from "@/lib/format";

const moneda = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface RegistroAuditoria {
  id: number;
  usuario: string | null;
  accion: string;
  entidad: string | null;
  entidadId: number | null;
  detalle: string | null;
  ip: string | null;
  userAgent: string | null;
  fecha: string;
}

const LABEL_ACCION: Record<string, string> = {
  firma_boleta: "Firma de boleta",
  enviar_correo: "Enviar correo",
  envio_masivo: "Envío masivo",
  revertir_firma: "Revertir firma",
  marcar_email_enviado: "Marcar email enviado",
  crear_boleta: "Crear boleta",
  eliminar_boleta: "Eliminar boleta",
  exportar_csv: "Exportar CSV",
  copiar_link: "Copiar link",
};

export default function BoletasPage() {
  const ahora = new Date();
  const [anio, setAnio] = useState(String(ahora.getFullYear()));
  const [mes, setMes] = useState(String(ahora.getMonth() + 1).padStart(2, "0"));
  const [porArea, setPorArea] = useState<PorAreaResultado>({
    total: 0,
    areas: [],
  });
  const [busqueda, setBusqueda] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("");
  const [tab, setTab] = useState<"todos" | "pendientes" | "sinCorreo" | "firmadas">(
    "todos",
  );
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const [vista, setVista] = useState<Boleta | null>(null);
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());

  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  const cargarPorArea = useCallback(async () => {
    try {
      const data = await apiFetch<PorAreaResultado>(
        `/boletas/por-area?anio=${anio}&mes=${mes}`,
      );
      setPorArea(data);
    } catch {
      /* noop */
    }
  }, [anio, mes]);

  useEffect(() => {
    cargarPorArea();
  }, [cargarPorArea]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(
      `${API_URL}/realtime/boletas?token=${encodeURIComponent(token)}`,
    );
    const onFirmada = () => cargarPorArea();
    es.addEventListener("boleta.firmada", onFirmada);
    return () => {
      es.removeEventListener("boleta.firmada", onFirmada);
      es.close();
    };
  }, [cargarPorArea]);

  useEffect(() => {
    apiFetch<Periodo[]>("/nomina/periodos")
      .then(setPeriodos)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, areaFiltro, tab]);

  useEffect(() => {
    if (!vista) {
      setAuditoria([]);
      return;
    }
    apiFetch<RegistroAuditoria[]>(`/boletas/${vista.id}/auditoria`)
      .then(setAuditoria)
      .catch(() => setAuditoria([]));
  }, [vista]);

  const boletas = useMemo(() => porArea.areas.flatMap((a) => a.boletas), [porArea]);

  const kpis = useMemo(
    () => ({
      total: porArea.total,
      firmadas: porArea.areas.reduce((a, b) => a + b.firmadas, 0),
      pendientes: porArea.areas.reduce((a, b) => a + b.pendientes, 0),
      sinCorreo: porArea.areas.reduce((a, b) => a + b.sinCorreo, 0),
    }),
    [porArea],
  );

  const tabs = [
    { id: "todos" as const, label: "Todos", count: kpis.total },
    { id: "pendientes" as const, label: "Pendientes de firma", count: kpis.pendientes },
    { id: "sinCorreo" as const, label: "Falta enviar correo", count: kpis.sinCorreo },
    { id: "firmadas" as const, label: "Firmadas", count: kpis.firmadas },
  ];

  const visibles = useMemo(() => {
    let r = boletas;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      r = r.filter(
        (b) =>
          b.trabajador.nombreCompleto.toLowerCase().includes(q) ||
          b.trabajador.dni.includes(q),
      );
    }
    if (areaFiltro) r = r.filter((b) => b.trabajador.area === areaFiltro);
    if (tab === "pendientes") r = r.filter((b) => b.estado === "PENDIENTE");
    if (tab === "sinCorreo") r = r.filter((b) => !b.emailEnviado);
    if (tab === "firmadas") r = r.filter((b) => b.estado === "FIRMADA");
    return [...r].sort((a, b) =>
      a.trabajador.nombreCompleto.localeCompare(b.trabajador.nombreCompleto),
    );
  }, [boletas, busqueda, areaFiltro, tab]);

  const areas = useMemo(
    () =>
      Array.from(
        new Set(boletas.map((b) => b.trabajador.area).filter((a): a is string => !!a)),
      ).sort(),
    [boletas],
  );

  const pendientesVisibles = useMemo(
    () => visibles.filter((b) => !b.emailEnviado),
    [visibles],
  );

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginados = visibles.slice(
    (pagina - 1) * POR_PAGINA,
    Math.min(pagina * POR_PAGINA, visibles.length),
  );

  const periodoDelMes = useMemo(() => {
    const anomes = `${anio}${mes}`;
    const lista = periodos.filter((p) => p.rem_anomes === anomes);
    return (
      lista.find((p) => p.st_anulado === "0") ??
      lista.find((p) => p.rem_correl === mes) ??
      lista[0]
    );
  }, [periodos, anio, mes]);

  const generar = async () => {
    const anomes = `${anio}${mes}`;
    if (!periodoDelMes) {
      Swal.fire({
        icon: "warning",
        title: "Sin periodo en el ERP",
        text: `No hay periodo ${anomes} en la nómina del ERP.`,
        confirmButtonColor: "#2563eb",
      });
      return;
    }
    setGenerando(true);
    Swal.fire({
      title: "Refrescando boletas…",
      html: `Leyendo la planilla de <b>${anomes}/${periodoDelMes.rem_correl}</b> desde el ERP`,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await apiFetch<GenerarResultado>("/nomina/generar", {
        method: "POST",
        body: JSON.stringify({
          anomes,
          correl: periodoDelMes.rem_correl,
        }),
      });
      Swal.fire({
        icon: "success",
        title: "Boletas actualizadas",
        html: `<b>${res.boletasGeneradas}</b> boletas de ${res.trabajadores} trabajadores<br/>Omitidas (ya existían): <b>${res.boletasOmitidas}</b> · Nuevos trabajadores: ${res.trabajadoresCreados}`,
        confirmButtonColor: "#2563eb",
      });
      cargarPorArea();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error al refrescar",
        text: (err as Error).message,
        confirmButtonColor: "#dc2626",
      });
    } finally {
      setGenerando(false);
    }
  };

  const enviarCorreo = async (b: Boleta) => {
    const email = b.trabajador.email?.trim();
    if (!email) {
      await Swal.fire({
        icon: "warning",
        title: "Sin correo registrado",
        text: `El trabajador ${b.trabajador.nombreCompleto} no tiene email registrado. Edítalo en Trabajadores o usa "Marcar como enviado".`,
      });
      return;
    }
    const conf = await Swal.fire({
      icon: "question",
      title: "Enviar correo",
      text: `¿Enviar el link de firma al correo ${email} de ${b.trabajador.nombreCompleto}?`,
      showCancelButton: true,
      confirmButtonText: "Enviar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
    });
    if (!conf.isConfirmed) return;
    try {
      await apiFetch(`/boletas/${b.id}/enviar-correo`, { method: "POST" });
      await Swal.fire({
        icon: "success",
        title: "Correo enviado",
        text: `El link de firma se envió a ${email}`,
        timer: 2000,
        showConfirmButton: false,
      });
      cargarPorArea();
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: (err as Error).message,
      });
    }
  };

  const revertirFirma = async (b: Boleta) => {
    const conf = await Swal.fire({
      icon: "warning",
      title: "Revertir firma",
      text: `¿Revertir la firma de ${b.trabajador.nombreCompleto}? Se borrará la firma actual, se generará un nuevo enlace y el trabajador deberá firmar de nuevo.`,
      showCancelButton: true,
      confirmButtonText: "Sí, revertir",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!conf.isConfirmed) return;
    try {
      await apiFetch(`/boletas/${b.id}/revertir-firma`, { method: "POST" });
      await Swal.fire({
        icon: "success",
        title: "Firma revertida",
        text: "La boleta quedó pendiente. Reenvía el enlace para que firme de nuevo.",
        timer: 2500,
        showConfirmButton: false,
      });
      cargarPorArea();
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: (err as Error).message,
      });
    }
  };

  const toggleSeleccion = (id: number) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTodos = (marcar: boolean) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      for (const b of visibles) {
        if (b.emailEnviado) continue;
        if (marcar) {
          next.add(b.id);
        } else {
          next.delete(b.id);
        }
      }
      return next;
    });
  };

  const enviarSeleccionadas = async () => {
    const ids = Array.from(seleccionadas);
    const conf = await Swal.fire({
      icon: "question",
      title: "Enviar correos",
      text: `¿Enviar el link de firma a los ${ids.length} trabajadores seleccionados?`,
      showCancelButton: true,
      confirmButtonText: "Enviar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
    });
    if (!conf.isConfirmed) return;
    setEnviando(true);
    Swal.fire({
      title: "Enviando correos…",
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await apiFetch<EnviarMasivoResultado>("/boletas/enviar-masivo", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      Swal.fire({
        icon: "success",
        title: "Correos enviados",
        html: (() => {
          let html = `<b>${res.enviados}</b> enviados · <b>${res.yaEnviados}</b> ya enviados · <b>${res.sinEmail}</b> sin correo registrado · <b>${res.errores}</b> con error`;
          if (res.sinEmailDetalle && res.sinEmailDetalle.length > 0) {
            const lista = res.sinEmailDetalle
              .map((d) => `• ${d.nombre} <span style="color:#6b7280">(${d.area})</span>`)
              .join("<br/>");
            html += `<br/><br/><div style="text-align:left;font-size:13px"><b>Sin correo asignado (${res.sinEmailDetalle.length}):</b><br/>${lista}</div>`;
          }
          return html;
        })(),
        confirmButtonColor: "#2563eb",
      });
      setSeleccionadas(new Set());
      cargarPorArea();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error al enviar",
        text: (err as Error).message,
        confirmButtonColor: "#dc2626",
      });
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async (id: number | null, texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      if (id != null) {
        apiFetch(`/boletas/${id}/copiar-link`, { method: "POST" }).catch(
          () => undefined,
        );
      }
      await Swal.fire({
        icon: "success",
        title: "Copiado",
        text: `${label} copiado`,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      window.prompt("Copiar manualmente:", texto);
    }
  };

  const exportar = async () => {
    try {
      const token = getToken();
      const params = new URLSearchParams({ anio, mes });
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
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: (err as Error).message,
      });
    }
  };

  const accionIcono =
    "rounded-lg bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Boletas</h1>
          <p className="text-gray-500 text-sm">
            {nombreMes(Number(mes))} {anio}
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
          <button
            onClick={generar}
            disabled={generando}
            title="Refrescar boletas del periodo"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${generando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ====== KPIs ====== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white shadow p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <FileText className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total boletas
            </p>
            <p className="text-3xl font-bold text-black">{kpis.total}</p>
          </div>
        </div>
        <div className="rounded-xl bg-white shadow p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <BadgeCheck className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Firmadas
            </p>
            <p className="text-3xl font-bold text-black">{kpis.firmadas}</p>
          </div>
        </div>
      </div>

      {/* ====== Toolbar ====== */}
      <div className="flex flex-wrap items-center gap-3">
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
        <button
          onClick={exportar}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 font-medium hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </button>
      </div>

      {/* ====== Pestañas ====== */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
            <span
              className={`ml-1.5 ${
                tab === t.id ? "text-gray-300" : "text-gray-400"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
        {seleccionadas.size > 0 && (
          <button
            onClick={enviarSeleccionadas}
            disabled={enviando}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Enviar ({seleccionadas.size})
          </button>
        )}
      </div>

      {/* ====== Tabla ====== */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={
                      pendientesVisibles.length > 0 &&
                      pendientesVisibles.every((b) => seleccionadas.has(b.id))
                    }
                    onChange={(e) => toggleTodos(e.target.checked)}
                    className="h-4 w-4"
                  />
                </th>
                <th className="text-left px-4 py-2">DNI</th>
                <th className="text-left px-4 py-2">Trabajador</th>
                <th className="text-left px-4 py-2">Área</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginados.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(b.id)}
                      onChange={() => toggleSeleccion(b.id)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2">{b.trabajador.dni}</td>
                  <td className="px-4 py-2 font-medium">
                    {b.trabajador.nombreCompleto}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {b.trabajador.area || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {b.estado === "FIRMADA" ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Firmada
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVista(b)}
                        title="Ver detalle"
                        className={accionIcono}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {b.urlFirma && (
                        <button
                          onClick={() => copiar(b.id, b.urlFirma!, "Link de firma")}
                          title="Copiar link de firma"
                          className={accionIcono}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                      )}
                      {b.estado === "FIRMADA" && b.urlVer && (
                        <a
                          href={b.urlVer}
                          target="_blank"
                          rel="noreferrer"
                          title="Ver documento firmado"
                          className={accionIcono}
                        >
                          <FileCheck2 className="h-4 w-4" />
                        </a>
                      )}
                      {b.estado === "FIRMADA" && (
                        <button
                          onClick={() => revertirFirma(b)}
                          title="Revertir firma"
                          className={accionIcono}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                      {b.estado !== "FIRMADA" && (
                        <button
                          onClick={() => enviarCorreo(b)}
                          title={
                            b.emailEnviado
                              ? "Reenviar correo"
                              : "Enviar correo"
                          }
                          className={accionIcono}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-gray-400">
                      {porArea.total === 0
                        ? `No hay boletas para ${nombreMes(Number(mes))} ${anio}. Pulsa el botón de refrescar (↻) al lado del mes para generarlas desde la nómina del ERP.`
                        : "No hay boletas que coincidan con los filtros"}
                    </p>
                    {porArea.total === 0 && (
                      <button
                        onClick={generar}
                        disabled={generando}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${generando ? "animate-spin" : ""}`}
                        />
                        Refrescar boletas
                      </button>
                    )}
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

      {/* ====== Modal Ver detalle ====== */}
      {vista && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setVista(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold">Detalle de boleta</h2>
              <button
                onClick={() => setVista(null)}
                title="Cerrar"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{vista.trabajador.nombreCompleto}</p>
                  <p className="text-xs text-gray-500">
                    DNI {vista.trabajador.dni} · Periodo {vista.periodo}
                    {vista.trabajador.area ? ` · ${vista.trabajador.area}` : ""}
                  </p>
                </div>
                {vista.estado === "FIRMADA" ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Firmada
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Pendiente
                  </span>
                )}
              </div>

              {vista.detalle && (
                <>
                  {vista.detalle.ingresos && vista.detalle.ingresos.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                        Ingresos
                      </p>
                      <div className="rounded-lg border divide-y divide-gray-100">
                        {vista.detalle.ingresos.map((c, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-3 py-1.5 text-sm"
                          >
                            <span>{c.concepto}</span>
                            <span>S/ {moneda(c.monto)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {vista.detalle.descuentos &&
                    vista.detalle.descuentos.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                          Descuentos
                        </p>
                        <div className="rounded-lg border divide-y divide-gray-100">
                          {vista.detalle.descuentos.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-3 py-1.5 text-sm"
                            >
                              <span>{c.concepto}</span>
                              <span className="text-red-600">
                                - S/ {moneda(c.monto)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="font-medium">Neto a pagar</span>
                    <span className="text-xl font-bold text-black">
                      S/ {moneda(vista.detalle.netoPagar ?? 0)}
                    </span>
                  </div>
                </>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                  Auditoría de la boleta
                </p>
                {auditoria.length > 0 ? (
                  <div className="max-h-44 overflow-y-auto rounded-lg border divide-y divide-gray-100">
                    {auditoria.map((a) => (
                      <div key={a.id} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {LABEL_ACCION[a.accion] || a.accion}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(a.fecha).toLocaleString("es-PE")}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Usuario: <b>{a.usuario || "—"}</b> · IP:{" "}
                          <b>{a.ip || "—"}</b>
                          {a.userAgent ? (
                            <>
                              {" "}
                              · Dispositivo:{" "}
                              <b>
                                {/Mobi|Android|iPhone|iPad|iPod/i.test(
                                  a.userAgent,
                                )
                                  ? "Celular"
                                  : "Computadora"}
                              </b>
                            </>
                          ) : null}
                          {a.detalle ? ` · ${a.detalle}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    Sin registros de auditoría
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-100 px-5 py-4">
              {vista.urlFirma && (
                <button
                  onClick={() => copiar(vista.id, vista.urlFirma!, "Link de firma")}
                  className="mr-auto inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  <Link2 className="h-4 w-4" />
                  Copiar link
                </button>
              )}
              <button
                onClick={() => setVista(null)}
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