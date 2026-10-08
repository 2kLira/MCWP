/**
 * Consultas auxiliares del módulo de actividades que no viven en lib/datos/actividades.ts:
 * usuarios asignables como responsable, brigadistas ya asignados y el nombre del responsable.
 * Aquí no se filtra por territorio: eso lo hace RLS. Lo único que se consulta a lib/puertas-ui.ts
 * es qué roles pueden encabezar una actividad, que es cosmética del selector.
 */

import { puedeEncabezarActividad } from "@/lib/puertas-ui";
import type { RolUsuario } from "@/lib/tipos";
import { db, lista, resultado, uno, type Resultado } from "@/lib/datos/cliente";

export type UsuarioBreve = {
  id: string;
  nombre: string;
  rol: string;
  demarcacion_id: number | null;
  seccion_clave: string | null;
};

/**
 * Quién puede quedar como responsable de una actividad: cualquier usuario activo que pase
 * puedeEncabezarActividad, sin importar su territorio. Una actividad de la sección 0524 la puede
 * encabezar alguien de otra sección o de otra demarcación —pasa todo el tiempo en campo— así que
 * a propósito no se recorta con aplicarAlcance: el territorio de quien está dando de alta la
 * actividad no limita a quién puede nombrar responsable.
 */
export async function usuariosAsignables(): Promise<Resultado<UsuarioBreve[]>> {
  const r = await lista<UsuarioBreve>(
    db()
      .from("usuarios")
      .select("id, nombre, rol, demarcacion_id, seccion_clave")
      .eq("activo", true)
      .order("nombre"),
  );

  const asignables = r.datos.filter((u) =>
    puedeEncabezarActividad({
      id: u.id,
      nombre: u.nombre,
      rol: u.rol as RolUsuario,
      demarcacionId: u.demarcacion_id,
      seccionClave: u.seccion_clave,
      activo: true,
    }),
  );

  return { ...r, datos: asignables };
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

/**
 * Quién puede ser invitado a capturar en una actividad.
 *
 * NO sirve `usuariosAsignables()`: esa filtra por `puedeEncabezarActividad`, que **excluye
 * justamente a los brigadistas**. Es el conjunto exactamente contrario al que hace falta aquí.
 *
 * Se piden los brigadistas activos y se quitan los que ya están invitados, para que el selector
 * no ofrezca a alguien que ya está en la lista.
 */
export async function brigadistasInvitables(
  yaInvitados: readonly string[] = [],
): Promise<Resultado<UsuarioBreve[]>> {
  const r = await lista<UsuarioBreve>(
    db()
      .from("usuarios")
      .select("id, nombre, rol, demarcacion_id, seccion_clave")
      .eq("activo", true)
      .eq("rol", "brigadista")
      .order("nombre"),
  );
  const fuera = new Set(yaInvitados);
  return { ...r, datos: r.datos.filter((u) => !fuera.has(u.id)) };
}
