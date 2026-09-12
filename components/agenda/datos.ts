/**
 * Consultas de la agenda.
 *
 * Viven aquí y no en lib/datos/actividades.ts porque el recorte por estatus y la agenda propia
 * del brigadista son preguntas de esta pantalla. Lo que no vive aquí es ninguna regla: quién ve
 * qué estatus y quién ve solo lo suyo se le pregunta a lib/permisos.ts y nada más a él.
 */

import { estatusVisibles, puedeVerListadosGenerales } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import {
  actividadesDeAgenda,
  actividadesDeBrigadista,
  type Actividad,
} from "@/lib/datos/actividades";
import type { Resultado } from "@/lib/datos/cliente";

/**
 * Verdadero cuando la agenda que se está mirando es la del propio usuario y no la del
 * territorio. Hoy eso es el brigadista, pero la pregunta se la hace permisos, no esta pantalla:
 * quien no alcanza los listados generales solo tiene lo suyo.
 */
export function esAgendaPropia(usuario: UsuarioActuante | null): boolean {
  return !!usuario && !puedeVerListadosGenerales(usuario);
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
  // La agenda propia es otra consulta, no un recorte de la del territorio: el brigadista solo
  // alcanza lo suyo y pedir todo para después filtrarlo sería traer de más.
  if (esAgendaPropia(usuario) && usuario) {
    return actividadesDeBrigadista(usuario, usuario.id, { desde, hasta });
  }

  // El recorte de estatus va en la consulta, no sobre filas ya traídas: si se hiciera después,
  // los conteos de hoy y de la semana contarían lo que el usuario no alcanza a ver.
  const base = await actividadesDeAgenda(usuario, desde, hasta, estatusVisibles(usuario));
  const filas = base.datos;

  return { datos: filas, sinEsquema: base.sinEsquema, aviso: base.aviso };
}
