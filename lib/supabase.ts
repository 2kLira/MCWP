import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente único.
 *
 * No hay login, así que no hay sesión que persistir ni token que refrescar: se entra con el
 * conmutador de rol y el filtrado por territorio lo hace lib/permisos.ts en la capa de aplicación.
 * Cuando el proyecto se apruebe, eso se reemplaza por políticas de base de datos.
 *
 * Si faltan las variables de entorno, esto NO lanza: devuelve null y la capa de datos responde
 * vacío con un aviso. Una variable ausente en el despliegue tiene que degradar la aplicación,
 * nunca tumbar la pantalla completa.
 */

let cliente: SupabaseClient | null = null;
let intentado = false;

export function faltaConfiguracion(): boolean {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function clienteSupabase(): SupabaseClient | null {
  if (intentado) return cliente;
  intentado = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  cliente = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
