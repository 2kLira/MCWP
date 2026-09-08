/**
 * Cálculos geométricos del mapa: el grupo de retraso de cada sección (para que el cambio de capa
 * recorra el mapa desde el centro) y el margen holgado sobre el bbox del municipio para el
 * paneo. Nada de esto toca lib/territorio.ts: solo consume su tipo `ColeccionSecciones`.
 */

import type { ColeccionSecciones } from "@/lib/territorio";
import { MUNICIPIO } from "@/lib/demarcaciones";

/** Cuántos grupos de retraso hay. Cada uno dispara su propia capa con su propio delay fijo. */
export const GRUPOS_RETRASO = 12;

/** Nombre de la propiedad que se agrega a cada rasgo con su grupo de retraso, 0 a GRUPOS_RETRASO-1. */
export const PROP_GRUPO_RETRASO = "grupoRetraso" as const;

function distancia(lonA: number, latA: number, lonB: number, latB: number): number {
  const dx = lonA - lonB;
  const dy = latA - latB;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Un grupo de 0 a GRUPOS_RETRASO-1 por clave de sección, a partir de su distancia al centro del
 * municipio: las secciones más cercanas caen en el grupo 0, las más lejanas en el último. Cada
 * grupo se pinta con una capa que tiene su propio retraso de transición, así el cambio de color
 * recorre el mapa desde el centro hacia afuera en vez de saltar todo junto.
 */
export function calcularGruposRetraso(coleccion: ColeccionSecciones): Map<string, number> {
  const [centroLon, centroLat] = MUNICIPIO.centro;
  const distancias = coleccion.features.map((rasgo) => ({
    clave: rasgo.properties.clave,
    distancia: distancia(rasgo.properties.lon, rasgo.properties.lat, centroLon, centroLat),
  }));
  const distanciaMaxima = Math.max(...distancias.map((d) => d.distancia), 0.000001);

  const grupos = new Map<string, number>();
  for (const { clave, distancia: d } of distancias) {
    const proporcion = d / distanciaMaxima; // 0 en el centro, 1 en el borde
    const grupo = Math.min(GRUPOS_RETRASO - 1, Math.floor(proporcion * GRUPOS_RETRASO));
    grupos.set(clave, grupo);
  }
  return grupos;
}

/** Milisegundos de retraso de un grupo, repartidos en una ventana de `ventanaMs`. */
export function retrasoDeGrupoMs(grupo: number, ventanaMs: number): number {
  if (GRUPOS_RETRASO <= 1) return 0;
  return Math.round((ventanaMs * grupo) / (GRUPOS_RETRASO - 1));
}

type Bbox = readonly [number, number, number, number]; // oeste, sur, este, norte

/** El bbox del municipio, con un margen holgado alrededor, para limitar el paneo. */
export function bboxConMargen(bbox: Bbox, proporcion = 0.35): [number, number, number, number] {
  const [oeste, sur, este, norte] = bbox;
  const anchoMargen = (este - oeste) * proporcion;
  const altoMargen = (norte - sur) * proporcion;
  return [oeste - anchoMargen, sur - altoMargen, este + anchoMargen, norte + altoMargen];
}
