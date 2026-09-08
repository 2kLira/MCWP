import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/**
 * Cliente único.
 *
 * No hay login, así que no hay sesión que persistir ni token que refrescar: se entra con el
 * conmutador de rol y el filtrado por territorio lo hace lib/permisos.ts en la capa de aplicación.
 * Cuando el proyecto se apruebe, eso se reemplaza por políticas de base de datos.
 *
 * Se crea la primera vez que se pide, no al importar el módulo, para que la compilación no dependa
 * de que las variables de entorno estén presentes.
 */
export function clienteSupabase(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Cópialas de .env.example a .env.local.",
    );
  }

  cliente = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
