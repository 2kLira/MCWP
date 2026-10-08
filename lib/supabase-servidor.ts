import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente de servidor, con la llave publicable y la sesión de la petición.
 *
 * **Uno nuevo por petición, siempre.** No se memoiza y no se comparte: la documentación de
 * `@supabase/ssr` es explícita en que reusar uno entre peticiones deja respuestas sin las
 * cabeceras anti-caché que acompañan a la escritura de cookies.
 *
 * `cookies()` es asíncrono en Next 16 —el acceso síncrono se eliminó— así que esta función
 * también lo es.
 *
 * Sirve para leer con los permisos de quien pide, que es justo lo que hace falta en el portón de
 * los handlers privilegiados: el rol se lee de la base bajo la política `usuarios_ve_su_fila`, no
 * de algo que venga en la petición.
 */
export async function clienteServidor(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicable) return null;

  const almacen = await cookies();

  return createServerClient(url, publicable, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(cookiesAEscribir) {
        // Durante el render de un Server Component esto lanza: Next no permite escribir cookies
        // después de que empezó el flujo de la respuesta. Se traga a propósito, porque el
        // refresco de sesión lo hace proxy.ts en cada petición. En un Route Handler sí escribe.
        try {
          for (const { name, value, options } of cookiesAEscribir) {
            almacen.set(name, value, options);
          }
        } catch {
          // Sin ruido: es el caso esperado en páginas y layouts.
        }
      },
    },
  });
}
