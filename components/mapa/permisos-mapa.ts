/**
 * Traducción entre lo que trae el GeoJSON (nombre de demarcación) y lo que usa la aplicación
 * (id de demarcación), contra el catálogo de lib/demarcaciones.ts.
 *
 * Aquí vivía `calcularAlcanceMapa`, que apagaba las secciones fuera del territorio del usuario.
 * Se borró al entrar RLS: el mapa ya solo recibe las secciones que la base dejó ver, así que
 * apagar algo encima sería recortar dos veces.
 */

import { DEMARCACIONES } from "@/lib/demarcaciones";

const idPorNombreDemarcacion = new Map(
  DEMARCACIONES.map((demarcacion) => [demarcacion.nombre, demarcacion.id]),
);

/** El id de demarcación del catálogo que corresponde al nombre que trae el GeoJSON de secciones. */
export function idDemarcacionDeNombre(nombre: string): number | null {
  return idPorNombreDemarcacion.get(nombre) ?? null;
}

