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

/**
 * Lo que ve la persona cuando al servidor le falta configuración (la URL de Supabase o la llave
 * secreta en las variables de entorno de Vercel). Antes se le decía tal cual —"Este despliegue no
 * tiene configurada la llave secreta"—, y eso no le sirve a un brigadista en la calle: no sabe qué
 * es ni puede hacer nada. Se le dice a quién avisar, y el detalle técnico va al registro del
 * servidor con `avisarFaltaConfiguracion`, que es donde lo busca quien lo puede arreglar.
 */
export const MENSAJE_FALLA_SISTEMA_FOTOS =
  "No se pudo subir la foto por una falla del sistema. Avisa al administrador.";
export const MENSAJE_FALLA_SISTEMA_ADMIN =
  "No se pudo completar por una falla de configuración del sistema. Avisa a soporte técnico.";

/** Deja en el registro del servidor qué variable de entorno falta. Nunca su valor. */
export function avisarFaltaConfiguracion(que: "url" | "llave secreta", donde: string) {
  const variable = que === "url" ? "NEXT_PUBLIC_SUPABASE_URL" : "SUPABASE_SECRET_KEY";
  console.error(
    `[configuración] ${donde}: falta ${variable} en las variables de entorno de este despliegue. ` +
      "En Vercel: Settings › Environment Variables, y después Redeploy.",
  );
}

export type Porton =
  | { ok: true; adminId: string }
  | { ok: false; estado: number; mensaje: string };

export async function portonAdmin(): Promise<Porton> {
  const supabase = await clienteServidor();
  if (!supabase) {
    avisarFaltaConfiguracion("url", "portón de administración");
    return { ok: false, estado: 503, mensaje: MENSAJE_FALLA_SISTEMA_ADMIN };
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
 * Portón de sesión, para los handlers que **no** son de administración.
 *
 * Mismo primer paso que `portonAdmin` y mismo principio: la identidad sale del token verificado y
 * de la tabla `usuarios`, nunca del cuerpo de la petición. La diferencia es que aquí no se exige
 * rol: basta una cuenta activa, y **quién alcanza qué lo decide después RLS**, que es donde vive
 * esa respuesta. Un handler que recibe fotos no tiene por qué saber de roles.
 */
export type PortonSesion =
  | { ok: true; usuarioId: string; esAdmin: boolean }
  | { ok: false; estado: number; mensaje: string };

export async function portonSesion(): Promise<PortonSesion> {
  const supabase = await clienteServidor();
  if (!supabase) {
    avisarFaltaConfiguracion("url", "portón de sesión");
    return { ok: false, estado: 503, mensaje: MENSAJE_FALLA_SISTEMA_FOTOS };
  }

  const { data } = await supabase.auth.getClaims();
  const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!sub) return { ok: false, estado: 401, mensaje: "Se requiere sesión." };

  const { data: fila } = await supabase
    .from("usuarios")
    .select("rol, activo")
    .eq("id", sub)
    .maybeSingle<{ rol: string; activo: boolean }>();

  if (!fila || !fila.activo) {
    return { ok: false, estado: 403, mensaje: "Tu cuenta no tiene acceso." };
  }

  return { ok: true, usuarioId: sub, esAdmin: fila.rol === "admin" };
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
