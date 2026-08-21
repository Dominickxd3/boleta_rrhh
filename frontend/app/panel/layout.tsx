"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, clearUsuario, getToken } from "@/lib/api";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const INACTIVIDAD_MS = 5 * 60 * 1000;

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [inactividad, setInactividad] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      clearToken();
      clearUsuario();
      router.replace("/login");
    }
  }, [router]);

  // Cierre de sesión automático por inactividad (5 minutos)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const cerrarSesion = () => {
      clearToken();
      clearUsuario();
      setInactividad(true);
      setTimeout(() => router.replace("/login"), 2500);
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(cerrarSesion, INACTIVIDAD_MS);
    };
    const eventos = [
      "pointerdown",
      "pointermove",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ];
    eventos.forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true }),
    );
    reset();
    return () => {
      clearTimeout(timer);
      eventos.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [router]);

  if (inactividad) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
          <div className="mb-3 text-4xl">⏱️</div>
          <h1 className="mb-2 text-xl font-bold text-amber-700">
            Sesión cerrada por inactividad
          </h1>
          <p className="text-gray-600">
            Vuelve a iniciar sesión para continuar.
          </p>
        </div>
      </main>
    );
  }

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
    </SidebarProvider>
  );
}