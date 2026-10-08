import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la llave secreta. **Salta Row Level Security por completo.**
 *
 * Existe por una sola razón: `public.usuarios.id` referencia `auth.users(id)`, así que crear un
 * usuario son dos pasos y el primero —crear la cuenta de acceso— solo se puede hacer con la llave
 * secreta. Para todo lo demás se usa el cliente de la petición, que respeta las políticas.
 *
 * Tres candados para que esta llave no llegue al navegador, porque uno solo no basta:
 *
 * 1. `SUPABASE_SECRET_KEY` no empieza con `NEXT_PUBLIC_`, así que el empaquetador de Next no la
 *    incrusta en código de cliente. Por sí solo esto ya evitaría la fuga, pero falla en silencio.
 * 2. El `import "server-only"` de arriba. Si cualquier componente "use client" importa este
 *    archivo, aunque sea por una cadena de tres saltos, **truena el build** con un mensaje claro
 *    en lugar de desplegar algo roto. Enterarse al compilar, no en producción.
 * 3. Verificación mecánica al cerrar cada fase que toque este archivo: buscar la llave dentro de
 *    .next/static tiene que no encontrar nada.
 *
 * Aquí `persistSession: false` sí es lo correcto: no hay sesión de usuario que guardar, es un
 * cliente de servidor que actúa con la llave del proyecto.
 */
export function clienteAdministrador(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) return null;

  return createClient(url, secreta, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
