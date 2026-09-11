/**
 * Datos reales de las seis vistas del mapa.
 *
 * Las cifras salen de `seccionesResumen` (lib/datos/catalogos.ts), ya recortadas al territorio del
 * usuario actuante por `aplicarAlcance` (lib/permisos.ts). Este módulo no decide quién ve qué, solo
 * convierte lo que la base ya recortó en un paso de 0 a 4 por sección. Cinco vistas usan cortes por
 * cuantiles sobre los valores presentes; la de prioritarias no, ver `calcularPasosPrioritarias`.
 */

import { seccionesResumen, type SeccionResumen } from "@/lib/datos/catalogos";
import type { ColeccionSecciones } from "@/lib/territorio";
import type { UsuarioActuante } from "@/lib/tipos";

/** Las seis vistas del mapa, en el orden en que aparecen en el selector. */
export type VistaMapa =
  | "estructura"
  | "personas"
  | "promovidos"
  | "actividad"
  | "recorridos"
  | "prioritarias";

export const VISTAS_MAPA: ReadonlyArray<{ id: VistaMapa; etiqueta: string }> = [
  { id: "estructura", etiqueta: "Estructura" },
  { id: "personas", etiqueta: "Personas alcanzadas" },
  { id: "promovidos", etiqueta: "Promovidos" },
  { id: "actividad", etiqueta: "Actividad" },
  { id: "recorridos", etiqueta: "Recorridos" },
  { id: "prioritarias", etiqueta: "Prioritarias" },
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
  promovidos: number;
  aspirantes: number;
  ultimaActividad: string | null;
  proximaActividad: string | null;
  /** "A", "B" o null si la sección no es prioritaria. */
  prioridad: "A" | "B" | null;
  /** Ya tiene al menos un recorrido en estatus realizada. */
  recorrida: boolean;
  listaNominal: number | null;
  metaVotos: number | null;
  casillas: number;
};

export type DatosMapa = {
  porClave: Map<string, DatoSeccion>;
};

export const DATOS_MAPA_VACIOS: DatosMapa = {
  porClave: new Map(),
};

/** Pide el resumen por sección, ya recortado al actuante. */
export async function cargarDatosMapa(
  usuario: UsuarioActuante | null,
): Promise<DatosMapa> {
  const resumen = await seccionesResumen(usuario);

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
      promovidos: fila.promovidos,
      aspirantes: fila.aspirantes_representante,
      ultimaActividad: fila.ultima_actividad,
      proximaActividad: fila.proxima_actividad,
      prioridad: fila.prioridad,
      recorrida: fila.recorrida,
      listaNominal: fila.lista_nominal,
      metaVotos: fila.meta_votos,
      casillas: fila.casillas,
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
    case "promovidos":
      return dato.promovidos;
    case "actividad":
      return dato.actividadTotal;
    case "recorridos":
      return dato.recorridos;
    case "prioritarias":
      return null; // no es de cuantiles, ver calcularPasosPrioritarias.
  }
}

/**
 * Los tres estados fijos de la vista de prioritarias, no cuantiles: prioritaria ya recorrida
 * (paso 4, naranja pleno, es lo hecho), prioritaria sin recorrer (paso 2, naranja intermedio, es
 * lo que falta) y no prioritaria (paso 0, para que el territorio se vea pero no compita).
 */
function calcularPasosPrioritarias(datos: DatosMapa): Map<string, PasoMapa> {
  const pasos = new Map<string, PasoMapa>();
  for (const [clave, dato] of datos.porClave) {
    pasos.set(clave, dato.prioridad == null ? 0 : dato.recorrida ? 4 : 2);
  }
  return pasos;
}

/**
 * El paso de 0 a 4 de cada sección presente en `datos` para una vista. La de estructura es
 * binaria (0 sin responsable, 4 con responsable); la de prioritarias son tres estados fijos, ver
 * `calcularPasosPrioritarias`; las demás salen de cuantiles sobre los valores presentes de esa
 * vista.
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

  if (vista === "prioritarias") {
    return calcularPasosPrioritarias(datos);
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

/* ---------------------------------------------------------------------------
 * Conteo de prioritarias: lo que responde "¿cómo vamos?" en la barra del mapa.
 * ------------------------------------------------------------------------- */

/** Cuántas prioritarias A y B hay, cuántas de cada una ya se recorrieron, y cuántas prioritarias
 *  no tienen polígono publicado y por lo tanto no aparecen pintadas en el mapa. */
export type ConteoPrioritarias = {
  totalA: number;
  recorridasA: number;
  totalB: number;
  recorridasB: number;
  /** Prioritarias (A o B) sin geometría en `secciones.geojson`: cuentan aquí, no en el lienzo. */
  sinGeometria: number;
};

/**
 * Recorre `datos` (ya recortado al territorio del actuante) y separa por prioridad, sin volver a
 * tocar el filtro territorial: eso ya lo hizo `seccionesResumen`. `coleccion` es el único lugar de
 * donde se sabe qué claves tienen geometría publicada; una prioritaria ausente ahí es de las seis
 * que no se pueden pintar.
 */
export function calcularConteoPrioritarias(
  datos: DatosMapa,
  coleccion: ColeccionSecciones,
): ConteoPrioritarias {
  const clavesConPoligono = new Set(coleccion.features.map((rasgo) => rasgo.properties.clave));

  const conteo: ConteoPrioritarias = {
    totalA: 0,
    recorridasA: 0,
    totalB: 0,
    recorridasB: 0,
    sinGeometria: 0,
  };

  for (const dato of datos.porClave.values()) {
    if (dato.prioridad == null) continue;
    if (dato.prioridad === "A") {
      conteo.totalA++;
      if (dato.recorrida) conteo.recorridasA++;
    } else {
      conteo.totalB++;
      if (dato.recorrida) conteo.recorridasB++;
    }
    if (!clavesConPoligono.has(dato.clave)) conteo.sinGeometria++;
  }

  return conteo;
}
