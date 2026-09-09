"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { clearToken, clearUsuario, getToken } from "@/lib/api";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const INACTIVIDAD_MS = 5 * 60 * 1000;
const AVISO_ANTES_MS = 60 * 1000;

const TITULOS: Record<string, string> = {
  "/panel": "Inicio",
  "/panel/trabajadores": "Trabajadores",
  "/panel/boletas": "Boletas",
  "/panel/configuracion": "Configuración",
};

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [avisoInactividad, setAvisoInactividad] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(60);
  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    const pagina = TITULOS[pathname] || "Panel";
    const aplicar = () => {
      document.title = `${pagina} · BoletasGP`;
    };
    aplicar();
    // Next.js reaplica los metadatos después del render; reafirmamos en ticks posteriores
    const id1 = setTimeout(aplicar, 100);
    const id2 = setTimeout(aplicar, 500);
    return () => {
      clearTimeout(id1);
      clearTimeout(id2);
    };
  }, [pathname]);

  useEffect(() => {
    if (!getToken()) {
      clearToken();
      clearUsuario();
      router.replace("/login");
    }
  }, [router]);

  // Sesión por inactividad (5 minutos): avisa 60s antes y permite continuar.
  useEffect(() => {
    if (!getToken()) return;

    let avisoTimer: ReturnType<typeof setTimeout>;
    let cierreTimer: ReturnType<typeof setTimeout>;
    let contador: ReturnType<typeof setInterval>;

    const forzarCierre = () => {
      clearToken();
      clearUsuario();
      setAvisoInactividad(false);
      router.replace("/login");
    };

    const reset = () => {
      clearTimeout(avisoTimer);
      clearTimeout(cierreTimer);
      clearInterval(contador);
      setAvisoInactividad(false);
      avisoTimer = setTimeout(() => {
        setAvisoInactividad(true);
        const fin = Date.now() + AVISO_ANTES_MS;
        setSegundosRestantes(60);
        contador = setInterval(() => {
          const restante = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
          setSegundosRestantes(restante);
          if (restante <= 0) {
            clearInterval(contador);
            forzarCierre();
          }
        }, 1000);
        cierreTimer = setTimeout(forzarCierre, AVISO_ANTES_MS);
      }, INACTIVIDAD_MS - AVISO_ANTES_MS);
    };

    resetRef.current = reset;
    const eventos = [
      "pointerdown",
      "pointermove",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ];
    eventos.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(avisoTimer);
      clearTimeout(cierreTimer);
      clearInterval(contador);
      eventos.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [router]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-slate-50">
        <header className="sticky top-0 z-10 flex h-12 items-center border-b bg-background px-4">
          <SidebarTrigger />
        </header>
        <div className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
            {children}
          </div>
        </div>
      </SidebarInset>

      {avisoInactividad && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-amber-700">
              Tu sesión está por expirar
            </h2>
            <p className="mb-4 text-gray-600">
              Por inactividad, tu sesión se cerrará en{" "}
              <b>{segundosRestantes}</b> {segundosRestantes === 1 ? "segundo" : "segundos"}.
            </p>
            <button
              onClick={resetRef.current}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Continuar sesión
            </button>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}