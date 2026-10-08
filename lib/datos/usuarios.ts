import { esAdmin } from "@/lib/puertas-ui";
import type { RolUsuario, UsuarioActuante } from "@/lib/tipos";
import { db, lista, uno, type Resultado } from "@/lib/datos/cliente";

export type Usuario = {
  id: string;
  nombre: string;
  telefono: string | null;
  rol: RolUsuario;
  demarcacion_id: number | null;
  seccion_clave: string | null;
  activo: boolean;
  created_at: string;
};

/** La pantalla de usuarios solo existe para el administrador; el recorte lo decide permisos.ts. */
export function listarUsuarios(
  usuario: UsuarioActuante | null,
): Promise<Resultado<Usuario[]>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({
      datos: [],
      sinEsquema: false,
      aviso: "Solo el administrador ve los usuarios.",
    });
  }
  return lista<Usuario>(db().from("usuarios").select("*").order("rol").order("nombre"));
}

export function cambiarActivo(
  usuario: UsuarioActuante | null,
  id: string,
  activo: boolean,
): Promise<Resultado<Usuario | null>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({ datos: null, sinEsquema: false, aviso: "No tienes permiso." });
  }
  return uno<Usuario>(db().from("usuarios").update({ activo }).eq("id", id).select().single());
}

/**
 * Alta y edición de usuarios.
 *
 * `actualizarUsuario` escribe directo desde el navegador: la política `usuarios_admin_actualiza`
 * la cubre y no hace falta llave secreta.
 *
 * `crearUsuario` y `reponerContrasena` **no pueden** hacer eso. Crear una cuenta de acceso o
 * cambiarle la contraseña a alguien exige la llave secreta, que jamás puede ir al navegador, así
 * que pasan por los handlers de app/api/admin/usuarios, que verifican del lado del servidor que
 * quien llama es admin.
 */

export function actualizarUsuario(
  usuario: UsuarioActuante | null,
  id: string,
  cambios: Partial<Pick<Usuario, "nombre" | "telefono" | "rol" | "demarcacion_id" | "seccion_clave">>,
): Promise<Resultado<Usuario | null>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({ datos: null, sinEsquema: false, aviso: "No tienes permiso." });
  }
  return uno<Usuario>(
    db().from("usuarios").update(cambios).eq("id", id).select().single(),
    "Solo el administrador general edita usuarios.",
  );
}

export type EntradaUsuarioNuevo = {
  nombre: string;
  correo: string;
  telefono?: string | null;
  rol: RolUsuario;
  demarcacionId?: number | null;
  seccionClave?: string | null;
};

/** La contraseña viene en la respuesta y se muestra una sola vez. No se guarda en ningún lado. */
export type AltaHecha = { id: string; correo: string; contrasena: string };

export async function crearUsuario(
  entrada: EntradaUsuarioNuevo,
): Promise<Resultado<AltaHecha | null>> {
  return pedirAlApi<AltaHecha>("/api/admin/usuarios", { method: "POST", cuerpo: entrada });
}

export async function reponerContrasena(
  id: string,
): Promise<Resultado<{ nombre: string; contrasena: string } | null>> {
  return pedirAlApi<{ nombre: string; contrasena: string }>(
    `/api/admin/usuarios/${encodeURIComponent(id)}/contrasena`,
    { method: "PATCH" },
  );
}

/**
 * Puente a los handlers privilegiados, con la misma forma `Resultado` que el resto de la capa de
 * datos, para que las pantallas no tengan que distinguir si algo vino de PostgREST o de un
 * handler. Si la red se cae, degrada con aviso en lugar de lanzar.
 */
async function pedirAlApi<T>(
  ruta: string,
  opciones: { method: string; cuerpo?: unknown },
): Promise<Resultado<T | null>> {
  try {
    const respuesta = await fetch(ruta, {
      method: opciones.method,
      headers: opciones.cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    });
    const cuerpo = (await respuesta.json().catch(() => null)) as
      | (T & { mensaje?: string })
      | null;

    if (!respuesta.ok) {
      return {
        datos: null,
        sinEsquema: false,
        aviso: cuerpo?.mensaje ?? "No se pudo completar la operación.",
      };
    }
    return { datos: (cuerpo as T) ?? null, sinEsquema: false, aviso: null };
  } catch {
    return {
      datos: null,
      sinEsquema: false,
      aviso: "No se pudo contactar al servidor. Revisa tu conexión.",
    };
  }
}
