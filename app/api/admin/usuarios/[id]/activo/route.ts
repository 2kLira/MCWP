import {
  json,
  portonAdmin,
  avisarFaltaConfiguracion,
  MENSAJE_FALLA_SISTEMA_ADMIN,
} from "@/lib/api/porton-admin";
import { clienteAdministrador } from "@/lib/supabase-administrador";

/**
 * Dar de baja o reactivar a alguien.
 *
 * Esto era un `update` directo desde el navegador (`cambiarActivo`), y funcionaba: la política
 * `usuarios_admin_actualiza` lo cubría y `activo = false` cierra el acceso a los datos en el
 * acto, porque todas las políticas cuelgan de `usuarios.activo`. Lo que **no** hacía era cerrar
 * la sesión.
 *
 * Medido en la auditoría del 9 de octubre de 2026: el refresh token de una cuenta desactivada
 * seguía emitiendo tokens de acceso. El daño estaba contenido —RLS le devolvía cero renglones a
 * todo— pero la sesión sobrevivía a su propia baja, y la cookie de `@supabase/ssr` dura 400 días.
 *
 * Por eso la baja pasa a ser una operación de dos lados, y los dos exigen la llave secreta:
 *
 * 1. `usuarios.activo = false`, que es lo que apagan las políticas.
 * 2. **Suspender la cuenta de acceso** con `ban_duration`, que es lo que invalida el refresh.
 *
 * Se usa `ban_duration` y no `admin.signOut`, que sería lo obvio, por una razón concreta:
 * `signOut` recibe **el JWT de esa persona**, que el administrador no tiene ni debe tener.
 * `ban_duration` se aplica por id, hace fallar el refresco con `user_banned` y además impide
 * volver a entrar. El mapa de errores de la pantalla de entrada ya traduce ese código a
 * "Esta cuenta está suspendida", así que la persona ve un motivo y no un fallo genérico.
 *
 * El orden importa: primero la suspensión. Si la segunda mitad fallara, es mejor que quede una
 * cuenta suspendida con la ficha activa (no entra) que una ficha inactiva con sesión viva.
 */

/** Cien años. GoTrue no acepta "para siempre", y la reactivación lo levanta con 'none'. */
const SUSPENSION_INDEFINIDA = "876000h";

export async function PATCH(
  peticion: Request,
  contexto: RouteContext<"/api/admin/usuarios/[id]/activo">,
) {
  const porton = await portonAdmin();
  if (!porton.ok) return json({ mensaje: porton.mensaje }, porton.estado);

  const { id } = await contexto.params;
  if (!id) return json({ mensaje: "Falta el usuario." }, 400);

  let activo: unknown;
  try {
    ({ activo } = (await peticion.json()) as { activo?: unknown });
  } catch {
    return json({ mensaje: "El cuerpo de la petición no es JSON." }, 400);
  }
  if (typeof activo !== "boolean") {
    return json({ mensaje: "Falta decir si la cuenta queda activa." }, 400);
  }

  const admin = clienteAdministrador();
  if (!admin) {
    avisarFaltaConfiguracion("llave secreta", "/api/admin/usuarios/[id]/activo");
    return json({ mensaje: MENSAJE_FALLA_SISTEMA_ADMIN }, 503);
  }

  // El candado del último administrador vive en el trigger `privado.sellar_usuario`, no aquí: así
  // también protege al `update` directo y a la consola de Supabase. Aquí solo se comprueba que la
  // ficha pertenezca a este sistema, para no suspender una cuenta ajena al proyecto.
  const { data: ficha } = await admin
    .from("usuarios")
    .select("nombre")
    .eq("id", id)
    .maybeSingle<{ nombre: string }>();

  if (!ficha) return json({ mensaje: "Ese usuario no existe en el sistema." }, 404);

  const { error: falloAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? "none" : SUSPENSION_INDEFINIDA,
  });

  if (falloAuth) {
    console.error("No se pudo cambiar la suspensión de la cuenta:", falloAuth);
    return json({ mensaje: "No se pudo cerrar la sesión de esa cuenta. No se cambió nada." }, 500);
  }

  const { error: falloFicha } = await admin.from("usuarios").update({ activo }).eq("id", id);

  if (falloFicha) {
    console.error("No se pudo cambiar el estado de la ficha:", falloFicha);
    // El trigger del último administrador rebota por aquí, y su mensaje ya dice qué hacer.
    return json({ mensaje: falloFicha.message }, 409);
  }

  return json({ nombre: ficha.nombre, activo });
}
