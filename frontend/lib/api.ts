export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string): void {
  localStorage.setItem("token", token);
}

export function clearToken(): void {
  localStorage.removeItem("token");
}

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol: string;
  avatarUrl?: string;
}

export function setUsuario(usuario: Usuario): void {
  localStorage.setItem("usuario", JSON.stringify(usuario));
}

export function getUsuario(): Usuario | null {
  try {
    const raw = localStorage.getItem("usuario");
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}

export function clearUsuario(): void {
  localStorage.removeItem("usuario");
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