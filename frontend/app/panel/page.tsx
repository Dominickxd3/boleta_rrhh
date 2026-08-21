"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCheck,
  FilePlus,
  FileText,
  Mail,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  useActiveTooltipDataPoints,
  useIsTooltipActive,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
  type PieSectorShapeProps,
} from "recharts";
import { apiFetch, getToken, API_URL } from "@/lib/api";
import {
  ActividadReciente,
  EnvioMes,
  PorAreaResultado,
  Resumen,
} from "@/lib/types";
import { fechaLarga, nombreAreaLimpio, nombreMes } from "@/lib/format";

const acortar = (a: string) => (a.length > 30 ? a.slice(0, 30) + "…" : a);

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#b45309",
];

const RADIAN = Math.PI / 180;

const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: PieLabelRenderProps) => {
  if (cx == null || cy == null || innerRadius == null || outerRadius == null) {
    return null;
  }
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const ncx = Number(cx);
  const x = ncx + radius * Math.cos(-(midAngle ?? 0) * RADIAN);
  const ncy = Number(cy);
  const y = ncy + radius * Math.sin(-(midAngle ?? 0) * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor={x > ncx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${((percent ?? 1) * 100).toFixed(0)}%`}
    </text>
  );
};

const PieConFoco = (props: PieSectorShapeProps) => {
  const p = useActiveTooltipDataPoints();
  const isAnyPieActive = useIsTooltipActive();
  const isThisPieActive = isAnyPieActive && props.payload === p?.[0];
  const fillOpacity = isAnyPieActive && !isThisPieActive ? 0.5 : 1;
  return (
    <Sector
      {...props}
      fill={COLORS[props.index % COLORS.length]}
      fillOpacity={fillOpacity}
      style={{ transition: "fill-opacity 0.3s ease" }}
    />
  );
};

export default function Dashboard() {
  const ahora = new Date();
  const [anio, setAnio] = useState(String(ahora.getFullYear()));
  const [mes, setMes] = useState(String(ahora.getMonth() + 1).padStart(2, "0"));
  const [resumen, setResumen] = useState<Resumen>({ total: 0, firmadas: 0, pendientes: 0 });
  const [porArea, setPorArea] = useState<PorAreaResultado>({ total: 0, areas: [] });
  const [firmasMes, setFirmasMes] = useState<EnvioMes[]>([]);
  const [actividad, setActividad] = useState<ActividadReciente[]>([]);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const refrescar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [res, areas, firmas] = await Promise.all([
        apiFetch<Resumen>(`/boletas/resumen?anio=${anio}&mes=${mes}`),
        apiFetch<PorAreaResultado>(`/boletas/por-area?anio=${anio}&mes=${mes}`),
        apiFetch<EnvioMes[]>(`/boletas/firmas-por-mes?anio=${anio}`),
      ]);
      setResumen(res);
      setPorArea(areas);
      setFirmasMes(firmas);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
    try {
      setActividad(
        await apiFetch<ActividadReciente[]>(
          "/boletas/actividad-reciente?limite=12",
        ),
      );
    } catch {
      /* noop */
    }
  }, [anio, mes]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // Actualizar en tiempo real cuando se firma una boleta
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(
      `${API_URL}/realtime/boletas?token=${encodeURIComponent(token)}`,
    );
    const onFirmada = () => refrescar();
    es.addEventListener("boleta.firmada", onFirmada);
    return () => {
      es.removeEventListener("boleta.firmada", onFirmada);
      es.close();
    };
  }, [refrescar]);

  // Actualizar al volver a la pestaña
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refrescar]);

  const firmasArea = useMemo(
    () =>
      porArea.areas
        .map((a) => ({ name: acortar(nombreAreaLimpio(a.area)), value: a.firmadas }))
        .filter((a) => a.value > 0)
        .sort((a, b) => b.value - a.value),
    [porArea],
  );

  const toggleArea = useCallback((name: string) => {
    setOcultas((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }, []);

  const pieData = useMemo(
    () => firmasArea.filter((a) => !ocultas.includes(a.name)),
    [firmasArea, ocultas],
  );

  const colorPorArea = useMemo(() => {
    const m = new Map<string, string>();
    pieData.forEach((d, i) => m.set(d.name, COLORS[i % COLORS.length]));
    return m;
  }, [pieData]);

  const iconosActividad = {
    generacion: { Icon: FilePlus, clase: "bg-slate-100 text-slate-600" },
    firma: { Icon: CheckCheck, clase: "bg-emerald-100 text-emerald-600" },
    correo: { Icon: Mail, clase: "bg-blue-100 text-blue-600" },
  } as const;

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

      {/* KPIs principales */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${cargando ? "opacity-60" : ""}`}>
        <div className="rounded-xl border border-gray-200 bg-white shadow p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <FileText className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total boletas
            </p>
            <p className="text-3xl font-bold text-black">{resumen.total}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <BadgeCheck className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Firmadas
            </p>
            <p className="text-3xl font-bold text-black">{resumen.firmadas}</p>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold">Firmas por mes</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={firmasMes}
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                onClick={(data) => {
                  const idx = data.activeIndex as number | undefined;
                  const target = idx != null ? firmasMes[idx] : undefined;
                  if (target?.mes) setMes(target.mes);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v} firmas`, ""]}
                  cursor={{ fill: "rgba(37, 99, 235, 0.08)" }}
                />
                <Bar
                  dataKey="firmadas"
                  name="Firmas"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                  activeBar={{ fill: "#1e40af" }}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold">Firmas por área</h2>
          {firmasArea.length > 0 ? (
            <>
              <div className="h-60">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={85}
                        labelLine={false}
                        label={renderCustomizedLabel}
                        shape={PieConFoco}
                        onClick={(data) => {
                          const target = data.payload as
                            | { name?: string }
                            | undefined;
                          if (target?.name) toggleArea(target.name);
                        }}
                      >
                        {pieData.map((d, i) => (
                          <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v} firmas`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    Todas las áreas ocultas — clic en la leyenda para mostrarlas
                  </div>
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {firmasArea.map((a) => {
                  const oculta = ocultas.includes(a.name);
                  const color = oculta ? "#d1d5db" : colorPorArea.get(a.name);
                  return (
                    <li key={a.name}>
                      <button
                        type="button"
                        onClick={() => toggleArea(a.name)}
                        className={`flex items-center gap-1.5 text-xs transition-opacity ${
                          oculta
                            ? "text-gray-300"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span className={oculta ? "line-through" : ""}>
                          {a.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-400 py-16 text-center">
              Aún no hay firmas en este periodo
            </p>
          )}
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-semibold mb-3">Actividad reciente</h2>
        <ul className="space-y-3">
          {actividad.map((ev, i) => {
            const { Icon, clase } = iconosActividad[ev.tipo] ?? iconosActividad.generacion;
            return (
              <li key={`${ev.boletaId}-${ev.tipo}-${i}`} className="flex items-start gap-3">
                <div className={`rounded-full p-2 ${clase}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{ev.titulo}</p>
                  <p className="text-xs text-gray-500 truncate">{ev.detalle}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {fechaLarga(ev.fecha)}
                </span>
              </li>
            );
          })}
          {!cargando && actividad.length === 0 && (
            <li className="text-sm text-gray-400">Sin actividad registrada</li>
          )}
        </ul>
      </div>
    </div>
  );
}