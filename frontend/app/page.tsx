"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? "/admin" : "/login");
  }, [router]);

  return (
    <main className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">Cargando…</p>
    </main>
  );
}