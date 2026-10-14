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

/**
 * Las columnas de `usuarios` que el navegador puede leer. `telefono` no está: tiene el privilegio
 * de columna cerrado (seguridad.sql, sección 6) y pedirlo, aunque sea con `*`, hace fallar la
 * consulta entera. El administrador lo trae aparte con `telefonos_de_usuarios`.
 */
const COLUMNAS_USUARIO = "id, nombre, rol, demarcacion_id, seccion_clave, activo, created_at";

type UsuarioSinTelefono = Omit<Usuario, "telefono">;

async function telefonosDelEquipo(): Promise<Map<string, string | null>> {
  const { data, error } = await db().rpc("telefonos_de_usuarios");
  if (error) console.warn("No se pudieron leer los teléfonos del equipo:", error);
  return new Map(
    ((data ?? []) as { id: string; telefono: string | null }[]).map((f) => [f.id, f.telefono]),
  );
}

/** La pantalla de usuarios solo existe para el administrador; el recorte lo decide RLS. */
export async function listarUsuarios(
  usuario: UsuarioActuante | null,
): Promise<Resultado<Usuario[]>> {
  if (!esAdmin(usuario)) {
    return { datos: [], sinEsquema: false, aviso: "Solo el administrador ve los usuarios." };
  }
  const [r, telefonos] = await Promise.all([
    lista<UsuarioSinTelefono>(
      db().from("usuarios").select(COLUMNAS_USUARIO).order("rol").order("nombre"),
    ),
    telefonosDelEquipo(),
  ]);
  return { ...r, datos: r.datos.map((u) => ({ ...u, telefono: telefonos.get(u.id) ?? null })) };
}

/** Cuánto capturó cada usuario. Lo cuenta la vista `v_capturas_por_usuario`, no el navegador. */
export type CapturasUsuario = {
  usuario_id: string;
  personas: number;
  personas_hoy: number;
  personas_7_dias: number;
  asistencias: number;
  ultima_captura: string | null;
};

export function capturasPorUsuario(
  usuario: UsuarioActuante | null,
): Promise<Resultado<CapturasUsuario[]>> {
  if (!esAdmin(usuario)) return Promise.resolve({ datos: [], sinEsquema: false, aviso: null });
  return lista<CapturasUsuario>(db().from("v_capturas_por_usuario").select("*"));
}

/**
 * Dar de baja o reactivar.
 *
 * Esto era un `update` directo desde el navegador y pasó a un handler privilegiado por una razón
 * medida en la auditoría: `activo = false` cierra los datos en el acto, pero **no cerraba la
 * sesión**, y el refresh token de una cuenta desactivada seguía emitiendo tokens. Suspender la
 * cuenta de acceso exige la llave secreta, que nunca puede ir al navegador.
 *
 * El motivo del rechazo —por ejemplo el candado del último administrador— llega en el mensaje del
 * handler, así que aquí no se duplica ninguna regla.
 */
export async function cambiarActivo(
  usuario: UsuarioActuante | null,
  id: string,
  activo: boolean,
): Promise<Resultado<{ nombre: string; activo: boolean } | null>> {
  if (!esAdmin(usuario)) {
    return { datos: null, sinEsquema: false, aviso: "No tienes permiso." };
  }
  return pedirAlApi<{ nombre: string; activo: boolean }>(
    `/api/admin/usuarios/${encodeURIComponent(id)}/activo`,
    { method: "PATCH", cuerpo: { activo } },
  );
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

export async function actualizarUsuario(
  usuario: UsuarioActuante | null,
  id: string,
  cambios: Partial<Pick<Usuario, "nombre" | "telefono" | "rol" | "demarcacion_id" | "seccion_clave">>,
): Promise<Resultado<Usuario | null>> {
  if (!esAdmin(usuario)) {
    return { datos: null, sinEsquema: false, aviso: "No tienes permiso." };
  }
  // Se escribe `telefono` pero no se pide de vuelta: escribir una columna no exige poder leerla,
  // pedirla sí. El valor nuevo es el que se acaba de mandar; si no se mandó, se lee aparte.
  const r = await uno<UsuarioSinTelefono>(
    db().from("usuarios").update(cambios).eq("id", id).select(COLUMNAS_USUARIO).single(),
    "Solo el administrador general edita usuarios.",
  );
  if (!r.datos) return { ...r, datos: null };
  const telefono =
    cambios.telefono !== undefined
      ? cambios.telefono
      : ((await telefonosDelEquipo()).get(id) ?? null);
  return { ...r, datos: { ...r.datos, telefono } };
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
