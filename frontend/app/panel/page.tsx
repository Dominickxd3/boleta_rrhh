"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCheck,
  Clock,
  FilePlus,
  FileText,
  Mail,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, getToken, API_URL } from "@/lib/api";
import {
  ActividadReciente,
  EnvioMes,
  PorAreaResultado,
  Resumen,
} from "@/lib/types";
import { fechaLarga, nombreAreaLimpio, nombreMes } from "@/lib/format";

const acortar = (a: string) => (a.length > 26 ? a.slice(0, 26) + "…" : a);

// Punto del gráfico més (key: YYYY-MM)
interface PuntoGrafico {
  key: string;
  label: string; // "Ene", "Feb"
  labelCompleto: string; // "Agosto 2026"
  firmadas: number;
}

const MES_DISPONIBLE = (anioSel: number, anioHoy: number, mesActual: number) => {
  const total = anioSel === anioHoy ? mesActual + 1 : 12;
  const arr: Array<{ value: string; label: string }> = [
    { value: "todos", label: "Todos" },
  ];
  for (let m = 1; m <= total; m++) {
    arr.push({ value: String(m).padStart(2, "0"), label: nombreMes(m) });
  }
  return arr;
};

export default function Dashboard() {
  const hoy = useMemo(() => new Date(), []);
  const mesActual = hoy.getMonth() + 1; // 1-12
  const anioActual = hoy.getFullYear();

  const aniosDisponibles = useMemo(() => {
    const lista: number[] = [];
    for (let y = anioActual - 3; y <= anioActual + 1; y++) lista.push(y);
    return lista;
  }, [anioActual]);

  const [anio, setAnio] = useState(String(anioActual));
  const [mes, setMes] = useState<string>("todos");

  const [resumen, setResumen] = useState<Resumen>({
    total: 0,
    firmadas: 0,
    pendientes: 0,
  });
  const [porArea, setPorArea] = useState<PorAreaResultado>({ total: 0, areas: [] });
  const [firmasVentana, setFirmasVentana] = useState<PuntoGrafico[]>([]);
  const [actividad, setActividad] = useState<ActividadReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const mesesDisponibles = useMemo(
    () => MES_DISPONIBLE(Number(anio), anioActual, mesActual),
    [anio, anioActual, mesActual],
  );

  // Ventana de 3 meses (puede cruzar años): [m-2, m-1, m] sobre el período seleccionado
  const ventana = useMemo(() => {
    const anioRef = mes === "todos" ? anioActual : Number(anio);
    const mesRef = mes === "todos" ? mesActual : Number(mes);
    const arr: Array<{ anio: number; mes: number }> = [];
    let m = mesRef;
    let a = anioRef;
    for (let i = 0; i < 3; i++) {
      arr.unshift({ anio: a, mes: m });
      m--;
      if (m < 1) {
        m = 12;
        a--;
      }
    }
    return arr;
  }, [anio, mes, anioActual, mesActual]);

  const refrescar = useCallback(async () => {
    setCargando(true);
    setError("");
    const params = `anio=${anio}${mes === "todos" ? "" : `&mes=${mes}`}`;
    try {
      const [res, areas] = await Promise.all([
        apiFetch<Resumen>(`/boletas/resumen?${params}`),
        apiFetch<PorAreaResultado>(`/boletas/por-area?${params}`),
      ]);
      setResumen(res);
      setPorArea(areas);
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

  // Para la ventana: podemos necesitar firmas del año anterior también.
  const cargarGrafico = useCallback(async () => {
    const datos: PuntoGrafico[] = ventana.map((p) => ({
      key: `${p.anio}-${String(p.mes).padStart(2, "0")}`,
      label: nombreMes(p.mes).slice(0, 3),
      labelCompleto: `${nombreMes(p.mes)} ${p.anio}`,
      firmadas: 0,
    }));
    const anios = new Set(ventana.map((p) => p.anio));
    await Promise.all(
      Array.from(anios).map(async (a) => {
        let lista: EnvioMes[] = [];
        try {
          lista = await apiFetch<EnvioMes[]>(`/boletas/firmas-por-mes?anio=${a}`);
        } catch {
          lista = [];
        }
        for (const d of datos) {
          if (d.key.startsWith(`${a}-`)) {
            const hit = lista.find(
              (r) => r.mes === d.key.slice(5),
            );
            if (hit) d.firmadas = hit.firmadas;
          }
        }
      }),
    );
    setFirmasVentana(datos);
  }, [ventana]);

  useEffect(() => {
    // Si el mes fijo no existe para el nuevo año (apagado), vuelve a "Todos".
    const valido = mesesDisponibles.some((m) => m.value === mes);
    if (!valido && mes !== "todos") setMes("todos");
  }, [mesesDisponibles, mes]);

  useEffect(() => {
    refrescar();
    cargarGrafico();
  }, [refrescar, cargarGrafico]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(
      `${API_URL}/realtime/boletas?token=${encodeURIComponent(token)}`,
    );
    const onFirmada = () => {
      refrescar();
      cargarGrafico();
    };
    es.addEventListener("boleta.firmada", onFirmada);
    return () => {
      es.removeEventListener("boleta.firmada", onFirmada);
      es.close();
    };
  }, [refrescar, cargarGrafico]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        refrescar();
        cargarGrafico();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refrescar, cargarGrafico]);

  const top5 = useMemo(
    () =>
      porArea.areas
        .map((a) => ({
          name: acortar(nombreAreaLimpio(a.area)),
          value: Math.max(0, a.total - a.sinCorreo), // boletas con correo enviado
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    [porArea],
  );

  const descripcion =
    mes === "todos"
      ? `Vista anual — ${anio}`
      : `Detalle del período — ${nombreMes(Number(mes))} ${anio}`;

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
          <p className="text-gray-500 text-sm">{descripcion}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            {aniosDisponibles.map((a) => (
              <option key={a} value={String(a)}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            {mesesDisponibles.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
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

      {/* KPIs: Total, Firmadas, Pendientes */}
      <div className={`grid grid-cols-1 gap-4 md:grid-cols-3 ${cargando ? "opacity-60" : ""}`}>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
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
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
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
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3 shrink-0">
            <Clock className="h-6 w-6 text-gray-800" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Pendientes de firma
            </p>
            <p className="text-3xl font-bold text-black">{resumen.pendientes}</p>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Línea: ultimos 3 meses */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold">Firmas por mes</h2>
          <p className="text-xs text-gray-400 mb-2">Últimos 3 meses</p>
          <div className="h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={firmasVentana}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip
                  content={(props) => {
                    const { active, payload } = props as unknown as {
                      active?: boolean;
                      payload?: Array<{ payload: PuntoGrafico }>;
                    };
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow">
                        <p className="text-xs text-gray-500">{p.labelCompleto}</p>
                        <p className="text-sm font-semibold">{p.firmadas} firmas</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="firmadas"
                  stroke="#2563eb"
                  strokeWidth={2}
                  activeDot={{ r: 6, fill: "#1e40af" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 áreas */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold">Top 5 áreas con más boletas</h2>
          <p className="text-xs text-gray-400 mb-2">
            Áreas con mayor cantidad de boletas en el período seleccionado
          </p>
          {top5.length > 0 ? (
            <div className="h-64 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top5}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={(props) => {
                      const { active, payload } = props as unknown as {
                        active?: boolean;
                        payload?: Array<{ payload: { name: string; value: number } }>;
                      };
                      if (!active || !payload?.length) return null;
                      const a = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow">
                          <p className="text-xs text-gray-500">{a.name}</p>
                          <p className="text-sm font-semibold">{a.value} boletas</p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="#2563eb"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    label={{ position: "right", fontSize: 11, fill: "#374151" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 lg:h-72 flex items-center justify-center text-sm text-gray-400">
              Aún no hay boletas en este período
            </div>
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