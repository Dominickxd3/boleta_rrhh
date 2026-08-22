"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Swal from "sweetalert2";
import { loginRequest, setToken, setUsuario } from "@/lib/api";

const WHATSAPP_SISTEMAS = "51922386045";
const MSG_RECUPERAR =
  "Hola, necesito recuperar mi contraseña del sistema BoletasGP. ¿Me pueden ayudar?";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const aplicar = () => {
      document.title = "Inicio de sesión · BoletasGP";
    };
    aplicar();
    const id1 = setTimeout(aplicar, 100);
    const id2 = setTimeout(aplicar, 500);
    return () => {
      clearTimeout(id1);
      clearTimeout(id2);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await loginRequest(username, password);
      setToken(res.access_token);
      setUsuario(res.usuario);
      await Swal.fire({
        icon: "success",
        title: `¡Bienvenido, ${res.usuario.nombre}!`,
        text: "Iniciando sesión…",
        timer: 1800,
        showConfirmButton: false,
        timerProgressBar: true,
      });
      router.replace("/panel");
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
          BoletasGP
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
            <div className="relative mt-1">
              <input
                type={ver ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"}
                title={ver ? "Ocultar contraseña" : "Ver contraseña"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
              >
                {ver ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a
            href={`https://wa.me/${WHATSAPP_SISTEMAS}?text=${encodeURIComponent(MSG_RECUPERAR)}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </div>
    </main>
  );
}