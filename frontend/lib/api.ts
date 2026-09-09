export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

// La sesión vive en sessionStorage: se limpia al cerrar la pestaña/navegador.
// Se usa localStorage solo como respaldo de migración para usuarios ya logueados.
function storage(): Storage | null {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

function fallbackStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function migrarDesdeLocalStorage(): void {
  const s = storage();
  const fb = fallbackStorage();
  if (!s || !fb) return;
  if (!s.getItem("token") && fb.getItem("token")) {
    const token = fb.getItem("token");
    const usuario = fb.getItem("usuario");
    if (token) s.setItem("token", token);
    if (usuario) s.setItem("usuario", usuario);
    fb.removeItem("token");
    fb.removeItem("usuario");
  }
}

export function getToken(): string | null {
  migrarDesdeLocalStorage();
  return storage()?.getItem("token") ?? null;
}

export function setToken(token: string): void {
  storage()?.setItem("token", token);
}

export function clearToken(): void {
  storage()?.removeItem("token");
  fallbackStorage()?.removeItem("token");
}

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol: string;
  avatarUrl?: string;
}

export function setUsuario(usuario: Usuario): void {
  storage()?.setItem("usuario", JSON.stringify(usuario));
}

export function getUsuario(): Usuario | null {
  migrarDesdeLocalStorage();
  try {
    const raw = storage()?.getItem("usuario");
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}

export function clearUsuario(): void {
  storage()?.removeItem("usuario");
  fallbackStorage()?.removeItem("usuario");
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<{ access_token: string; usuario: Usuario }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = "Error al iniciar sesión";
    try {
      const j = await res.json();
      msg = j.message || msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      window.location.href = "/login";
    }
    throw new Error("Sesión expirada");
  }

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const j = await res.json();
      msg = Array.isArray(j.message) ? j.message.join(", ") : j.message || msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }

  return res.json();
}

export async function fetchPdfUrl(path: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("No se pudo obtener el PDF");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}