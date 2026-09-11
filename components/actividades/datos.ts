/**
 * Consultas auxiliares del módulo de actividades que no viven en lib/datos/actividades.ts:
 * usuarios asignables como responsable, brigadistas ya asignados y el nombre del responsable.
 * Mismas reglas de lib/permisos.ts, sin duplicar el filtrado por territorio.
 */

import { aplicarAlcance } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, lista, resultado, uno, type Resultado } from "@/lib/datos/cliente";

export type UsuarioBreve = {
  id: string;
  nombre: string;
  rol: string;
  demarcacion_id: number | null;
  seccion_clave: string | null;
};

/** Quién puede quedar como responsable: los mismos roles que pueden crear actividades. */
export function usuariosAsignables(
  usuario: UsuarioActuante | null,
): Promise<Resultado<UsuarioBreve[]>> {
  let consulta = db()
    .from("usuarios")
    .select("id, nombre, rol, demarcacion_id, seccion_clave")
    .eq("activo", true)
    .in("rol", ["admin", "resp_demarcacion", "resp_seccion"]);
  consulta = aplicarAlcance(consulta, usuario);
  return lista<UsuarioBreve>(consulta.order("nombre"));
}

export function obtenerUsuario(id: string | null): Promise<Resultado<UsuarioBreve | null>> {
  if (!id) return Promise.resolve({ datos: null, sinEsquema: false, aviso: null });
  return uno<UsuarioBreve>(
    db()
      .from("usuarios")
      .select("id, nombre, rol, demarcacion_id, seccion_clave")
      .eq("id", id)
      .maybeSingle(),
  );
}

export type Brigadista = { usuario_id: string; nombre: string };

export async function brigadistasDeActividad(
  actividadId: string,
): Promise<Resultado<Brigadista[]>> {
  const { data, error } = await db()
    .from("actividad_brigadistas")
    .select("usuario_id, usuarios(nombre)")
    .eq("actividad_id", actividadId);

  const filas = (data ?? []) as unknown as {
    usuario_id: string;
    usuarios: { nombre: string } | null;
  }[];

  return resultado(
    filas.map((f) => ({ usuario_id: f.usuario_id, nombre: f.usuarios?.nombre ?? "—" })),
    error,
    [],
  );
}
