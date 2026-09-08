/**
 * Catálogo de demarcaciones con los mismos identificadores que asigna scripts/importar.ts.
 * El orden es el de data/demarcaciones.json y no debe cambiar: los ids de la base dependen de él.
 */

export type DemarcacionCatalogo = {
  id: number;
  nombre: string;
  slug: string;
};

export const DEMARCACIONES: readonly DemarcacionCatalogo[] = [
  { id: 1, nombre: "Cabecera Municipal", slug: "cabecera-municipal" },
  { id: 2, nombre: "Candiani", slug: "candiani" },
  { id: 3, nombre: "Cinco Señores", slug: "cinco-senores" },
  { id: 4, nombre: "Dolores", slug: "dolores" },
  { id: 5, nombre: "Donají", slug: "donaji" },
  { id: 6, nombre: "Guadalupe Victoria", slug: "guadalupe-victoria" },
  { id: 7, nombre: "Montoya", slug: "montoya" },
  { id: 8, nombre: "Pueblo Nuevo", slug: "pueblo-nuevo" },
  { id: 9, nombre: "San Felipe del Agua", slug: "san-felipe-del-agua" },
  { id: 10, nombre: "San Juan Chapultepec", slug: "san-juan-chapultepec" },
  { id: 11, nombre: "San Luis Beltrán", slug: "san-luis-beltran" },
  {
    id: 12,
    nombre: "San Martín Mexicapam de Cárdenas",
    slug: "san-martin-mexicapam-de-cardenas",
  },
  { id: 13, nombre: "Santa Rosa Panzacola", slug: "santa-rosa-panzacola" },
  { id: 14, nombre: "Trinidad de Viguera", slug: "trinidad-de-viguera" },
] as const;

export function demarcacionPorId(id: number | null | undefined) {
  if (id == null) return null;
  return DEMARCACIONES.find((d) => d.id === id) ?? null;
}

/** Encuadre del municipio, tomado del bloque meta de data/demarcaciones.json. */
export const MUNICIPIO = {
  nombre: "Oaxaca de Juárez",
  claveIne: "20-066",
  bbox: [-96.772416, 17.032768, -96.666104, 17.159819] as const,
  centro: [-96.726444, 17.095364] as const,
  zoomSugerido: 12,
} as const;
