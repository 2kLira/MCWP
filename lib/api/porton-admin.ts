import "server-only";

import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase-servidor";

/**
 * Portón de los handlers privilegiados.
 *
 * Tres pasos, y ninguno se puede saltar:
 *
 * 1. Verificar que hay sesión, con `getClaims()`.
 * 2. **Leer el rol de la base, con el cliente de la petición** —no con el de administrador— para
 *    que la lectura la gobierne la política `usuarios_ve_su_fila`. Así el rol sale de la misma
 *    fuente de verdad que `privado.es_admin()` y no hay forma de suplantarlo.
 * 3. Solo entonces se toca el cliente con la llave secreta.
 *
 * Lo que **nunca** se hace: confiar en un rol que venga en el cuerpo de la petición, en una
 * cabecera, o en que "el proxy ya revisó". El proxy solo sabe que la firma del token es válida;
 * no sabe quién es esa persona ni si su cuenta sigue activa.
 */

export type Porton =
  | { ok: true; adminId: string }
  | { ok: false; estado: number; mensaje: string };

export async function portonAdmin(): Promise<Porton> {
  const supabase = await clienteServidor();
  if (!supabase) {
    return {
      ok: false,
      estado: 503,
      mensaje: "Este despliegue no está conectado a la base de datos.",
    };
  }

  const { data } = await supabase.auth.getClaims();
  const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!sub) {
    return { ok: false, estado: 401, mensaje: "Se requiere sesión." };
  }

  const { data: fila } = await supabase
    .from("usuarios")
    .select("rol, activo")
    .eq("id", sub)
    .maybeSingle<{ rol: string; activo: boolean }>();

  if (!fila || fila.rol !== "admin" || !fila.activo) {
    return {
      ok: false,
      estado: 403,
      mensaje: "Solo el administrador general administra usuarios.",
    };
  }

  return { ok: true, adminId: sub };
}

/**
 * Respuesta JSON que ningún intermediario puede guardar. Una respuesta de un handler de
 * administración no tiene nada que hacer en una caché.
 */
export function json(cuerpo: unknown, estado = 200): NextResponse {
  return NextResponse.json(cuerpo, {
    status: estado,
    headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
  });
}

/**
 * Contraseña generada en el servidor. Sin caracteres ambiguos (l, I, 1, O, 0) porque estas
 * contraseñas se dictan y se copian a mano: no hay correo de recuperación.
 */
export function generarContrasena(largo = 16): string {
  const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  let salida = "";
  for (const b of bytes) salida += alfabeto[b % alfabeto.length];
  return salida;
}
