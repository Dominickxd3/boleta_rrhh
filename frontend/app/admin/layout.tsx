"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearToken, clearUsuario, getToken } from "@/lib/api";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      clearToken();
      clearUsuario();
      router.replace("/login");
    }
  }, [router]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-slate-50">
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Boletas RRHH
          </span>
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