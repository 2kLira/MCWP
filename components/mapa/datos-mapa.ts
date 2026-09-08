/**
 * Datos reales de las cinco vistas del mapa.
 *
 * Las cifras salen de `seccionesResumen` y `problematicasPorSeccion` (lib/datos/catalogos.ts),
 * ya recortadas al territorio del usuario actuante por `aplicarAlcance` (lib/permisos.ts). Este
 * módulo no decide quién ve qué: solo convierte lo que la base ya recortó en un paso de 0 a 4 por
 * sección, con cortes por cuantiles sobre los valores presentes en cada vista.
 */

import {
  problematicasPorSeccion,
  seccionesResumen,
  type SeccionResumen,
} from "@/lib/datos/catalogos";
import type { UsuarioActuante } from "@/lib/tipos";

/** Las cinco vistas del mapa, en el orden en que aparecen en el selector. */
export type VistaMapa =
  | "estructura"
  | "personas"
  | "actividad"
  | "problematicas"
  | "recorridos";

export const VISTAS_MAPA: ReadonlyArray<{ id: VistaMapa; etiqueta: string }> = [
  { id: "estructura", etiqueta: "Estructura" },
  { id: "personas", etiqueta: "Personas" },
  { id: "actividad", etiqueta: "Actividad" },
  { id: "problematicas", etiqueta: "Problemáticas" },
  { id: "recorridos", etiqueta: "Recorridos" },
];

/** Un paso de la escala del mapa: 0 neutro, 4 naranja pleno. */
export type PasoMapa = 0 | 1 | 2 | 3 | 4;

/** Lo que trae cada sección para llenar el mapa y la ficha lateral. Índice: clave de sección. */
export type DatoSeccion = {
  clave: string;
  demarcacion: string;
  esSustituta: boolean;
  tieneResponsable: boolean;
  responsable: string | null;
  personas: number;
  quierenParticipar: number;
  reuniones: number;
  activismo: number;
  recorridos: number;
  actividadTotal: number;
  problematicasTotal: number;
  ultimaActividad: string | null;
  proximaActividad: string | null;
};

export type DatosMapa = {
  porClave: Map<string, DatoSeccion>;
};

export const DATOS_MAPA_VACIOS: DatosMapa = { porClave: new Map() };

/** Pide el resumen por sección y las menciones de problemáticas, ya recortados al actuante. */
export async function cargarDatosMapa(
  usuario: UsuarioActuante | null,
): Promise<DatosMapa> {
  const [resumen, problematicas] = await Promise.all([
    seccionesResumen(usuario),
    problematicasPorSeccion(usuario),
  ]);

  const menclonesPorClave = new Map<string, number>();
  for (const fila of problematicas.datos) {
    menclonesPorClave.set(
      fila.clave,
      (menclonesPorClave.get(fila.clave) ?? 0) + fila.menciones,
    );
  }

  const porClave = new Map<string, DatoSeccion>();
  for (const fila of resumen.datos as SeccionResumen[]) {
    porClave.set(fila.clave, {
      clave: fila.clave,
      demarcacion: fila.demarcacion,
      esSustituta: fila.es_sustituta,
      tieneResponsable: fila.responsable_id != null,
      responsable: fila.responsable,
      personas: fila.personas,
      quierenParticipar: fila.quieren_participar,
      reuniones: fila.reuniones,
      activismo: fila.activismo,
      recorridos: fila.recorridos,
      actividadTotal: fila.reuniones + fila.activismo + fila.recorridos,
      problematicasTotal: menclonesPorClave.get(fila.clave) ?? 0,
      ultimaActividad: fila.ultima_actividad,
      proximaActividad: fila.proxima_actividad,
    });
  }
  return { porClave };
}

/* ---------------------------------------------------------------------------
 * Cuantiles: convierten la métrica cruda de cada vista en un paso de 0 a 4.
 * ------------------------------------------------------------------------- */

/** Percentil `p` (0 a 1) de un arreglo ya ordenado, con interpolación lineal. */
function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return 0;
  if (ordenados.length === 1) return ordenados[0];
  const indice = p * (ordenados.length - 1);
  const inferior = Math.floor(indice);
  const superior = Math.ceil(indice);
  if (inferior === superior) return ordenados[inferior];
  return (
    ordenados[inferior] +
    (ordenados[superior] - ordenados[inferior]) * (indice - inferior)
  );
}

/** Los cuatro cortes (20/40/60/80) sobre los valores presentes, de menor a mayor. */
function calcularCortes(valores: readonly number[]): [number, number, number, number] {
  const ordenados = [...valores].sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((p) => percentil(ordenados, p)) as [
    number,
    number,
    number,
    number,
  ];
}

function pasoDeCorte(valor: number, cortes: [number, number, number, number]): PasoMapa {
  if (valor <= cortes[0]) return 0;
  if (valor <= cortes[1]) return 1;
  if (valor <= cortes[2]) return 2;
  if (valor <= cortes[3]) return 3;
  return 4;
}

/** Métrica cruda de una vista para una sección, o null si no hay dato para calcularla. */
function metricaDeVista(vista: VistaMapa, dato: DatoSeccion | undefined): number | null {
  if (!dato) return null;
  switch (vista) {
    case "estructura":
      return null; // se resuelve aparte, es binario, no de cuantiles.
    case "personas":
      return dato.personas;
    case "actividad":
      return dato.actividadTotal;
    case "problematicas":
      return dato.problematicasTotal;
    case "recorridos":
      return dato.recorridos;
  }
}

/**
 * El paso de 0 a 4 de cada sección presente en `datos` para una vista. La de estructura es
 * binaria (0 sin responsable, 4 con responsable); las otras cuatro salen de cuantiles sobre los
 * valores presentes de esa vista.
 */
export function calcularPasosDeVista(
  vista: VistaMapa,
  datos: DatosMapa,
): Map<string, PasoMapa> {
  const pasos = new Map<string, PasoMapa>();

  if (vista === "estructura") {
    for (const [clave, dato] of datos.porClave) {
      pasos.set(clave, dato.tieneResponsable ? 4 : 0);
    }
    return pasos;
  }

  const valores: number[] = [];
  for (const dato of datos.porClave.values()) {
    const valor = metricaDeVista(vista, dato);
    if (valor != null) valores.push(valor);
  }
  const cortes = calcularCortes(valores);

  for (const [clave, dato] of datos.porClave) {
    const valor = metricaDeVista(vista, dato);
    pasos.set(clave, valor == null ? 0 : pasoDeCorte(valor, cortes));
  }
  return pasos;
}
