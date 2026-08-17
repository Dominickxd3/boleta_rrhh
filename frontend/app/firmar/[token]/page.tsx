"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import SignatureCanvas from "@/components/SignatureCanvas";
import { Detalle } from "@/lib/types";
import { money, nombreMes } from "@/lib/format";

interface InfoFirma {
  trabajador: string;
  dni: string;
  periodo: string;
  anio: number;
  mes: number;
  estado: string;
  yaFirmada: boolean;
  detalle: Detalle;
}

interface RespuestaFirma {
  mensaje: string;
  urlVer: string;
}

export default function FirmarPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InfoFirma | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaFirma | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setInfo(await apiFetch<InfoFirma>(`/firma/firma/${token}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const firmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firma) {
      setError("Debe dibujar su firma antes de continuar");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const res = await apiFetch<RespuestaFirma>(`/firma/firma/${token}`, {
        method: "POST",
        body: JSON.stringify({ firma }),
      });
      setResultado(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Cargando boleta…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </main>
    );
  }

  if (resultado && info) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-xl font-bold text-green-700 mb-1">
            ¡Boleta firmada correctamente!
          </h1>
          <p className="text-gray-600 mb-4">
            {info.trabajador} — periodo {info.periodo}
          </p>
          <Link
            href={resultado.urlVer}
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
          >
            Ver documento firmado
          </Link>
        </div>
      </main>
    );
  }

  if (info?.yaFirmada) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center">
          <h1 className="text-xl font-bold text-amber-700 mb-2">
            Esta boleta ya fue firmada
          </h1>
          <p className="text-gray-600 mb-4">
            Solo se puede firmar una vez. Si necesita ver su documento, use el
            enlace de consulta enviado por Recursos Humanos.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-blue-700 px-6 py-4">
            <h1 className="text-white font-bold text-lg">Boleta de pago</h1>
            <p className="text-blue-100 text-sm">
              Periodo {info!.periodo} — {nombreMes(info!.mes)} {info!.anio}
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Trabajador</p>
                <p className="font-medium">{info!.trabajador}</p>
              </div>
              <div>
                <p className="text-gray-500">DNI</p>
                <p className="font-medium">{info!.dni}</p>
              </div>
            </div>

            <div>
              <h2 className="font-semibold mb-2">Detalle del pago</h2>
              {info!.detalle.empresa && (
                <p className="text-xs text-gray-500 mb-2">
                  {info!.detalle.empresa}
                  {info!.detalle.ruc ? ` — RUC ${info!.detalle.ruc}` : ""}
                  {info!.detalle.remune
                    ? ` · ${info!.detalle.remune}`
                    : ""}
                </p>
              )}
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {info!.detalle.ingresos.map((i, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5">{i.concepto}</td>
                      <td className="py-1.5 text-right font-medium">
                        {money(i.monto)}
                      </td>
                    </tr>
                  ))}
                  {info!.detalle.descuentos.map((i, idx) => (
                    <tr key={`d${idx}`}>
                      <td className="py-1.5 text-red-600">{i.concepto}</td>
                      <td className="py-1.5 text-right text-red-600">
                        − {money(i.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {info!.detalle.aportes && info!.detalle.aportes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    APORTES DEL EMPLEADOR
                  </p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {info!.detalle.aportes.map((i, idx) => (
                        <tr key={`a${idx}`}>
                          <td className="py-1 text-gray-600">{i.concepto}</td>
                          <td className="py-1 text-right text-gray-600">
                            {money(i.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 bg-gray-100 rounded-lg px-4 py-3 flex justify-between font-bold">
                <span>NETO A PAGAR</span>
                <span className="text-blue-700">
                  {money(info!.detalle.netoPagar)}
                </span>
              </div>
            </div>

            <form onSubmit={firmar} className="space-y-4">
              <div>
                <h2 className="font-semibold mb-2">Firme aquí</h2>
                <SignatureCanvas onChange={setFirma} />
                <p className="text-xs text-gray-400 mt-1">
                  Use el dedo o el mouse para dibujar su firma
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {enviando ? "Firmando…" : "Firmar boleta"}
              </button>
              <p className="text-center text-xs text-gray-400">
                Al firmar acepta que la información mostrada es correcta.
              </p>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}