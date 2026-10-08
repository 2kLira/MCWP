import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de navegador.
 *
 * Hay login, así que la sesión viaja en cookies y el cliente le pone el `Authorization: Bearer`
 * a cada petición de PostgREST por dentro. Eso es lo que hace que los módulos de lib/datos no
 * tengan que pedir ni pasar el token: todos quedan autenticados sin tocarlos.
 *
 * Dos cosas que NO se configuran aquí, a propósito:
 *
 * - `persistSession` y `autoRefreshToken` ya no se apagan. `@supabase/ssr` sustituye el storage
 *   por cookies e ignora `auth.storage`, y apagar el refresco haría que el token expirara a la
 *   hora: a media jornada de campo todas las consultas empezarían a devolver PGRST301.
 * - `cookies`. En el navegador la librería cae sola a `document.cookie`, y su propia
 *   documentación dice que en la mayoría de los casos no hay que configurarlo.
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
  // createBrowserClient lee y escribe document.cookie, así que lanzaría si se llamara durante un
  // render de servidor. Se devuelve null sin memoizar —si se memoizara, el primer render en
  // servidor dejaría el cliente en null para siempre— y la degradación de lib/datos/cliente.ts
  // lo absorbe. Para leer datos en el servidor va lib/supabase-servidor.ts.
  if (typeof document === "undefined") return null;

  if (intentado) return cliente;
  intentado = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicable) return null;

  cliente = createBrowserClient(url, publicable);
  return cliente;
}
