import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase-servidor";

/**
 * Cierre de sesión.
 *
 * Es un Route Handler y no una Server Function porque aquí sí se pueden escribir cookies: Next
 * lo prohíbe durante el render de un Server Component, y borrar las cookies de sesión es
 * precisamente escribirlas. `signOut()` además revoca el refresh token del lado del servidor,
 * que es lo que un borrado de cookies en el navegador no hace.
 *
 * Responde 303 para que el navegador convierta el POST en un GET al redirigir, que es lo que
 * corresponde al envío de un formulario.
 */
export async function POST(peticion: Request) {
  const supabase = await clienteServidor();
  if (supabase) {
    await supabase.auth.signOut();
  }

  const respuesta = NextResponse.redirect(new URL("/entrar", peticion.url), {
    status: 303,
  });
  // Una respuesta que toca cookies de sesión no puede quedar en caché de nadie.
  respuesta.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  return respuesta;
}
