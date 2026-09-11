/**
 * Puente entre el mapa y lib/permisos.ts. No hay lógica de permisos aquí, solo la traducción
 * entre lo que trae el GeoJSON (nombre de demarcación) y lo que pide lib/permisos.ts (id de
 * demarcación), usando el catálogo de lib/demarcaciones.ts. Toda decisión de "quién ve qué" sale
 * de `puedeVerSeccion`, nunca se reescribe aquí.
 */

import { DEMARCACIONES } from "@/lib/demarcaciones";
import { puedeVerSeccion } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import type { ColeccionSecciones } from "@/lib/territorio";

const idPorNombreDemarcacion = new Map(
  DEMARCACIONES.map((demarcacion) => [demarcacion.nombre, demarcacion.id]),
);

/** El id de demarcación del catálogo que corresponde al nombre que trae el GeoJSON de secciones. */
export function idDemarcacionDeNombre(nombre: string): number | null {
  return idPorNombreDemarcacion.get(nombre) ?? null;
}

/**
 * Una clave de sección por si el usuario actuante puede verla resaltada. Un administrador ve
 * todo; un responsable de demarcación ve resaltada su demarcación; uno de sección o un
 * brigadista de sección, solo su sección.
 */
export function calcularAlcanceMapa(
  coleccion: ColeccionSecciones,
  actuante: UsuarioActuante | null,
): Map<string, boolean> {
  const resultado = new Map<string, boolean>();
  for (const rasgo of coleccion.features) {
    const demarcacionId = idDemarcacionDeNombre(rasgo.properties.demarcacion);
    resultado.set(
      rasgo.properties.clave,
      puedeVerSeccion(actuante, rasgo.properties.clave, demarcacionId),
    );
  }
  return resultado;
}
