/**
 * Consultas de la agenda.
 *
 * Viven aquí y no en lib/datos/actividades.ts porque el recorte por estatus y la agenda propia
 * del brigadista son preguntas de esta pantalla. Lo que no vive aquí es ninguna regla: quién ve
 * qué estatus y quién ve solo lo suyo se le pregunta a lib/permisos.ts y nada más a él.
 */

import { estatusVisibles, puedeVerListadosGenerales } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { actividadesDeAgenda, type Actividad } from "@/lib/datos/actividades";
import { db, resultado, type Resultado } from "@/lib/datos/cliente";

/**
 * Verdadero cuando la agenda que se está mirando es la del propio usuario y no la del
 * territorio. Hoy eso es el brigadista, pero la pregunta se la hace permisos, no esta pantalla:
 * quien no alcanza los listados generales solo tiene lo suyo.
 */
export function esAgendaPropia(usuario: UsuarioActuante | null): boolean {
  return !!usuario && !puedeVerListadosGenerales(usuario);
}

/** Ids de las actividades donde este usuario está asignado como brigadista. */
async function idsAsignadasA(usuarioId: string): Promise<Resultado<Set<string>>> {
  const { data, error } = await db()
    .from("actividad_brigadistas")
    .select("actividad_id")
    .eq("usuario_id", usuarioId);

  const filas = (data ?? []) as unknown as { actividad_id: string }[];
  return resultado(
    new Set(filas.map((f) => f.actividad_id)),
    error,
    new Set<string>(),
  );
}

/**
 * Las actividades del rango que este usuario sí alcanza a ver. Es la única entrada de datos de
 * la agenda: las tres listas y los puntos del calendario salen de aquí, para que nada cuente
 * actividades que al abrirlas no están.
 */
export async function actividadesDeAgendaVisibles(
  usuario: UsuarioActuante | null,
  desde: string,
  hasta: string,
): Promise<Resultado<Actividad[]>> {
  const base = await actividadesDeAgenda(usuario, desde, hasta);

  // Provisional. actividadesDeAgenda no acepta filtro de estatus y ese archivo no se toca en
  // esta fase, así que el recorte se hace aquí, pegado a la consulta y antes de que nadie
  // cuente nada. Cuando lib/datos/actividades.ts reciba `estatus?: readonly EstatusActividad[]`,
  // esta línea se borra y el filtro se va a la base como .in("estatus", estatusVisibles(usuario)).
  const visibles = estatusVisibles(usuario);
  let filas = base.datos.filter((a) => visibles.includes(a.estatus));

  if (esAgendaPropia(usuario) && usuario) {
    // Provisional también: no hay consulta que traiga las actividades de un brigadista, así que
    // se piden sus asignaciones y se cruzan. El recorte territorial ya lo aplicó la consulta de
    // arriba; esto solo deja las suyas.
    const asignadas = await idsAsignadasA(usuario.id);
    if (asignadas.sinEsquema || asignadas.aviso) {
      return { datos: [], sinEsquema: asignadas.sinEsquema, aviso: asignadas.aviso };
    }
    filas = filas.filter((a) => asignadas.datos.has(a.id));
  }

  return { datos: filas, sinEsquema: base.sinEsquema, aviso: base.aviso };
}
