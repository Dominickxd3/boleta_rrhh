"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  FileText,
  Home,
  LogOut,
  RefreshCcw,
  Settings,
  Users,
} from "lucide-react";
import {
  clearToken,
  clearUsuario,
  getUsuario,
  type Usuario,
} from "@/lib/api";
import Swal from "sweetalert2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const items = [
  { title: "Inicio", url: "/panel", icon: Home },
  { title: "Trabajadores", url: "/panel/trabajadores", icon: Users },
  { title: "Boletas", url: "/panel/boletas", icon: FileText },
  { title: "Configuración", url: "/panel/configuracion", icon: Settings },
];

const ROLES: Record<string, string> = {
  admin: "Administrador",
  rrhh: "Recursos Humanos",
};

function etiquetaRol(rol: string): string {
  if (ROLES[rol]) return ROLES[rol];
  if (!rol) return "Usuario";
  return rol.charAt(0).toUpperCase() + rol.slice(1);
}

function Avatar({ usuario }: { usuario: { nombre: string; avatarUrl?: string } }) {
  const inicial = (usuario.nombre || "U").trim().charAt(0).toUpperCase();
  if (usuario.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={usuario.avatarUrl}
        alt={usuario.nombre}
        className="size-8 shrink-0 rounded-full object-cover ring-1 ring-sidebar-ring"
      />
    );
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
      {inicial}
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    setUsuario(getUsuario());
  }, []);

  const salir = async () => {
    const conf = await Swal.fire({
      icon: "question",
      title: "Cerrar sesión",
      text: "¿Seguro que deseas cerrar sesión?",
      showCancelButton: true,
      confirmButtonText: "Sí, salir",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!conf.isConfirmed) return;
    clearToken();
    clearUsuario();
    router.replace("/login");
  };

  const cambiarCuenta = async () => {
    const conf = await Swal.fire({
      icon: "question",
      title: "Cambiar cuenta",
      text: "¿Deseas cambiar de cuenta? Se cerrará la sesión actual.",
      showCancelButton: true,
      confirmButtonText: "Sí, cambiar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
    });
    if (!conf.isConfirmed) return;
    clearToken();
    clearUsuario();
    router.replace("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="h-auto flex-col items-center gap-2 py-3 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center"
            >
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo_gp.png"
                  alt="Logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="text-center text-[15px] font-bold leading-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                BoletasGP
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">General</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const activo =
                  pathname === item.url ||
                  (item.url !== "/panel" && pathname.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={activo}
                      tooltip={item.title}
                      className="text-lg"
                    >
                      <item.icon className="size-6" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="h-14 group-data-[collapsible=icon]:h-10"
                  />
                }
              >
                <Avatar
                  usuario={{
                    nombre: usuario?.nombre || "Usuario",
                    avatarUrl: usuario?.avatarUrl,
                  }}
                />
                <div className="flex flex-col gap-0.5 leading-none text-left group-data-[collapsible=icon]:hidden">
                  <span className="max-w-36 truncate text-base font-semibold">
                    {usuario?.nombre || "Usuario"}
                  </span>
                  <span className="max-w-36 truncate text-sm text-muted-foreground">
                    {etiquetaRol(usuario?.rol || "")}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="right"
                sideOffset={4}
                className="w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">
                      {usuario?.nombre || "Usuario"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{usuario?.username || "usuario"} ·{" "}
                      {etiquetaRol(usuario?.rol || "")}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={cambiarCuenta}>
                  <RefreshCcw />
                  Cambiar cuenta
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={salir}>
                  <LogOut />
                  Salir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}