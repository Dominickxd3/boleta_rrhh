"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginRequest, setToken, setUsuario } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await loginRequest(username, password);
      setToken(res.access_token);
      setUsuario(res.usuario);
      router.replace("/admin");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8">
        <div className="flex justify-center mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo_gp.png"
            alt="Logo"
            className="h-16 w-auto object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-900">
          Boletas RRHH
        </h1>
        <p className="text-sm text-gray-500 text-center mt-1 mb-6">
          Portal de Recursos Humanos
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Usuario
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}