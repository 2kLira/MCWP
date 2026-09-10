/**
 * Datos reales de las siete vistas del mapa.
 *
 * Las cifras salen de `seccionesResumen`, `problematicasPorSeccion` y `coloniaResumen`
 * (lib/datos/catalogos.ts), ya recortadas al territorio del usuario actuante por `aplicarAlcance`
 * (lib/permisos.ts). Este módulo no decide quién ve qué: solo convierte lo que la base ya recortó
 * en un paso de 0 a 4 por sección o por colonia, con cortes por cuantiles sobre los valores
 * presentes en cada vista.
 */

import {
  coloniaResumen,
  problematicasPorSeccion,
  seccionesResumen,
  type ColoniaResumen,
  type SeccionResumen,
} from "@/lib/datos/catalogos";
import type { UsuarioActuante } from "@/lib/tipos";

/** Las siete vistas del mapa, en el orden en que aparecen en el selector. */
export type VistaMapa =
  | "estructura"
  | "personas"
  | "promovidos"
  | "actividad"
  | "problematicas"
  | "recorridos"
  | "colonias";

export const VISTAS_MAPA: ReadonlyArray<{ id: VistaMapa; etiqueta: string }> = [
  { id: "estructura", etiqueta: "Estructura" },
  { id: "personas", etiqueta: "Personas" },
  { id: "promovidos", etiqueta: "Promovidos" },
  { id: "actividad", etiqueta: "Actividad" },
  { id: "problematicas", etiqueta: "Problemáticas" },
  { id: "recorridos", etiqueta: "Recorridos" },
  { id: "colonias", etiqueta: "Colonias" },
];

/** True si la vista pinta colonias en lugar de secciones: decide qué geometría pinta el lienzo. */
export function vistaEsDeColonias(vista: VistaMapa): boolean {
  return vista === "colonias";
}

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
  promovidos: number;
  aspirantes: number;
  ultimaActividad: string | null;
  proximaActividad: string | null;
};

/**
 * Lo que trae cada colonia para la vista de colonias. Viene de sumar los renglones de
 * `v_colonia_resumen` de esa colonia, uno por cada demarcación y sección en la que tiene gente.
 */
export type DatoColonia = {
  coloniaId: number;
  nombre: string;
  personas: number;
  promovidos: number;
  quierenParticipar: number;
  /** Las demarcaciones en las que esta colonia tiene gente. Más de una significa colonia partida. */
  demarcaciones: number[];
};

export type DatosMapa = {
  porClave: Map<string, DatoSeccion>;
  porColonia: Map<number, DatoColonia>;
};

export const DATOS_MAPA_VACIOS: DatosMapa = {
  porClave: new Map(),
  porColonia: new Map(),
};

/**
 * Pide el resumen por sección, las menciones de problemáticas y el resumen por colonia, ya
 * recortados al actuante. El resumen de colonia llega partido por demarcación y sección; aquí se
 * suma por colonia porque el mapa pinta una sola geometría por colonia.
 */
export async function cargarDatosMapa(
  usuario: UsuarioActuante | null,
): Promise<DatosMapa> {
  const [resumen, problematicas, colonias] = await Promise.all([
    seccionesResumen(usuario),
    problematicasPorSeccion(usuario),
    coloniaResumen(usuario),
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
      promovidos: fila.promovidos,
      aspirantes: fila.aspirantes_representante,
      ultimaActividad: fila.ultima_actividad,
      proximaActividad: fila.proxima_actividad,
    });
  }

  const porColonia = new Map<number, DatoColonia>();
  for (const fila of colonias.datos as ColoniaResumen[]) {
    const previo = porColonia.get(fila.colonia_id);
    if (!previo) {
      porColonia.set(fila.colonia_id, {
        coloniaId: fila.colonia_id,
        nombre: fila.colonia,
        personas: fila.personas,
        promovidos: fila.promovidos,
        quierenParticipar: fila.quieren_participar,
        demarcaciones: fila.demarcacion_id != null ? [fila.demarcacion_id] : [],
      });
      continue;
    }
    previo.personas += fila.personas;
    previo.promovidos += fila.promovidos;
    previo.quierenParticipar += fila.quieren_participar;
    if (fila.demarcacion_id != null && !previo.demarcaciones.includes(fila.demarcacion_id)) {
      previo.demarcaciones.push(fila.demarcacion_id);
    }
  }

  return { porClave, porColonia };
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
    case "promovidos":
      return dato.promovidos;
    case "actividad":
      return dato.actividadTotal;
    case "problematicas":
      return dato.problematicasTotal;
    case "recorridos":
      return dato.recorridos;
    case "colonias":
      return null; // vista de colonias: no pinta secciones, ver calcularPasosDeColonia.
  }
}

/**
 * El paso de 0 a 4 de cada sección presente en `datos` para una vista. La de estructura es
 * binaria (0 sin responsable, 4 con responsable); las demás salen de cuantiles sobre los valores
 * presentes de esa vista. La vista de colonias no se resuelve aquí: no pinta secciones.
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

/** Paso de 0 a 4 por colonia, con los mismos cuantiles que usan las secciones (sobre personas). */
export function calcularPasosDeColonia(datos: DatosMapa): Map<number, PasoMapa> {
  const pasos = new Map<number, PasoMapa>();

  const valores = [...datos.porColonia.values()].map((dato) => dato.personas);
  const cortes = calcularCortes(valores);

  for (const [coloniaId, dato] of datos.porColonia) {
    pasos.set(coloniaId, pasoDeCorte(dato.personas, cortes));
  }
  return pasos;
}
