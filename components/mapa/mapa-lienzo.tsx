"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  DataDrivenPropertyValueSpecification,
  GeoJSONSource,
  Map as MapaLibreMap,
} from "maplibre-gl";
import { useActuante } from "@/components/proveedor-actuante";
import { MUNICIPIO } from "@/lib/demarcaciones";
import { puedeVerSeccion } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { bboxDeRasgo, rasgoPorClave, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import {
  calcularPasosDeColonia,
  calcularPasosDeVista,
  vistaEsDeColonias,
  type DatosMapa,
  type VistaMapa,
} from "./datos-mapa";
import { estiloCartoDe, usePreferenciaOscura } from "./estilo-base";
import {
  GRUPOS_RETRASO,
  PROP_GRUPO_RETRASO,
  bboxConMargen,
  calcularGruposRetraso,
  retrasoDeGrupoMs,
} from "./geometria";
import { calcularAlcanceMapa, idDemarcacionDeNombre } from "./permisos-mapa";
import {
  crearFuncionCurva,
  leerColor,
  leerCurva,
  leerDuracionMs,
  leerEscalaMapa,
  prefiereMenosMovimiento,
} from "./tokens";

const FUENTE_ID = "secciones";
const CAPA_BORDE = "secciones-borde";
const CAPA_SIN_RESPONSABLE = "secciones-sin-responsable";
const PROP_SIN_RESPONSABLE = "sinResponsable";

const FUENTE_COLONIAS_ID = "colonias";
const CAPA_COLONIA_BORDE = "colonias-borde";

function idCapaRelleno(grupo: number): string {
  return `secciones-relleno-${grupo}`;
}

function idsCapasRelleno(): string[] {
  return Array.from({ length: GRUPOS_RETRASO }, (_, i) => idCapaRelleno(i));
}

function idCapaColoniaRelleno(grupo: number): string {
  return `colonias-relleno-${grupo}`;
}

function idsCapasColoniaRelleno(): string[] {
  return Array.from({ length: GRUPOS_RETRASO }, (_, i) => idCapaColoniaRelleno(i));
}

type PropiedadesAumentadas = RasgoSeccion["properties"] & {
  [PROP_GRUPO_RETRASO]: number;
  [PROP_SIN_RESPONSABLE]: boolean;
};
// La geometría de RasgoSeccion no es una unión discriminada (type y coordinates son uniones
// independientes), así que se reutiliza tal cual en vez de forzarla contra GeoJSON.Polygon |
// GeoJSON.MultiPolygon, que sí lo es y no la acepta por asignación estructural.
type RasgoAumentado = {
  type: "Feature";
  geometry: RasgoSeccion["geometry"];
  properties: PropiedadesAumentadas;
};
type ColeccionAumentada = {
  type: "FeatureCollection";
  features: RasgoAumentado[];
};

/**
 * El mismo GeoJSON de lib/territorio.ts, con dos propiedades estáticas de más por rasgo:
 * `grupoRetraso` (con qué demora entra en la transición de color, según su distancia al centro
 * del municipio) y `sinResponsable` (si la base ya dice que esa sección no tiene responsable).
 * Ambas son propiedades del rasgo, no feature-state, porque el filtro de la capa punteada de
 * "sin responsable" no puede leer feature-state.
 */
function aumentarColeccion(
  coleccion: ColeccionSecciones,
  datos: DatosMapa,
): ColeccionAumentada {
  const grupos = calcularGruposRetraso(coleccion);
  return {
    type: "FeatureCollection",
    features: coleccion.features.map((rasgo) => {
      const dato = datos.porClave.get(rasgo.properties.clave);
      return {
        type: "Feature",
        geometry: rasgo.geometry,
        properties: {
          ...rasgo.properties,
          [PROP_GRUPO_RETRASO]: grupos.get(rasgo.properties.clave) ?? 0,
          [PROP_SIN_RESPONSABLE]: dato ? !dato.tieneResponsable : false,
        },
      };
    }),
  };
}

/* ---------------------------------------------------------------------------
 * Colonias: geometría propia, cargada aparte de la de secciones (ver cargarColonias más abajo).
 * La sección sigue siendo la única unidad exacta; esto es solo la capa de referencia pintada.
 * ------------------------------------------------------------------------- */

export type PropiedadesColonia = {
  colonia_id: number;
  nombre: string;
  cp: number | string | null;
  demarcacion_principal: string;
  partida: boolean;
  secciones: string[];
};

export type RasgoColonia = {
  type: "Feature";
  properties: PropiedadesColonia;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

export type ColeccionColonias = {
  type: "FeatureCollection";
  features: RasgoColonia[];
};

type PropiedadesColoniaAumentada = PropiedadesColonia & { [PROP_GRUPO_RETRASO]: number };
type RasgoColoniaAumentado = {
  type: "Feature";
  geometry: RasgoColonia["geometry"];
  properties: PropiedadesColoniaAumentada;
};
type ColeccionColoniaAumentada = {
  type: "FeatureCollection";
  features: RasgoColoniaAumentado[];
};

let coloniasCacheadas: ColeccionColonias | null = null;
let coloniasPromesa: Promise<ColeccionColonias> | null = null;

/**
 * Pide `/datos/colonias.geojson` una sola vez, la primera vez que hace falta (nunca al arrancar
 * el mapa: son 220 KB que no tiene sentido bajar en celular si el actuante nunca elige la vista
 * de colonias). Llamadas concurrentes comparten la misma promesa.
 */
function cargarColonias(): Promise<ColeccionColonias> {
  if (coloniasCacheadas) return Promise.resolve(coloniasCacheadas);
  if (coloniasPromesa) return coloniasPromesa;

  coloniasPromesa = fetch("/datos/colonias.geojson")
    .then((respuesta) => {
      if (!respuesta.ok) {
        throw new Error(
          `No se pudo cargar el mapa de colonias: el servidor respondió ${respuesta.status}.`,
        );
      }
      return respuesta.json() as Promise<ColeccionColonias>;
    })
    .then((datos) => {
      coloniasCacheadas = datos;
      return datos;
    })
    .catch((motivo) => {
      coloniasPromesa = null;
      throw motivo;
    });

  return coloniasPromesa;
}

/**
 * Grupo de retraso por colonia, con el mismo mecanismo que ya reparte las secciones (distancia al
 * centro del municipio). `calcularGruposRetraso` pide un rasgo con `lon`/`lat` en sus propiedades,
 * que las colonias no traen; se arma una colección sintética con el centro del bbox de cada
 * polígono y se recicla la función tal cual, en vez de duplicar la lógica de reparto.
 */
function gruposRetrasoDeColonias(coleccion: ColeccionColonias): Map<number, number> {
  const sintetica = {
    type: "FeatureCollection",
    features: coleccion.features.map((rasgo) => {
      const [oeste, sur, este, norte] = bboxDeRasgo(rasgo as unknown as RasgoSeccion);
      return {
        properties: {
          clave: String(rasgo.properties.colonia_id),
          lon: (oeste + este) / 2,
          lat: (sur + norte) / 2,
        },
      };
    }),
  } as unknown as ColeccionSecciones;

  const porClaveTexto = calcularGruposRetraso(sintetica);
  const resultado = new Map<number, number>();
  for (const rasgo of coleccion.features) {
    resultado.set(
      rasgo.properties.colonia_id,
      porClaveTexto.get(String(rasgo.properties.colonia_id)) ?? 0,
    );
  }
  return resultado;
}

function aumentarColonias(coleccion: ColeccionColonias): ColeccionColoniaAumentada {
  const grupos = gruposRetrasoDeColonias(coleccion);
  return {
    type: "FeatureCollection",
    features: coleccion.features.map((rasgo) => ({
      type: "Feature",
      geometry: rasgo.geometry,
      properties: {
        ...rasgo.properties,
        [PROP_GRUPO_RETRASO]: grupos.get(rasgo.properties.colonia_id) ?? 0,
      },
    })),
  };
}

/**
 * Qué tanto puede ver el actuante de cada colonia. No hay una noción de "colonia" en
 * lib/permisos.ts (el permiso vive por sección), así que una colonia se cuenta como dentro del
 * alcance si al menos una de sus secciones lo está — la misma pregunta que ya resuelve
 * `puedeVerSeccion`, no una regla nueva. Una colonia partida entre demarcaciones puede así quedar
 * resaltada aunque solo una de sus porciones le toque al actuante.
 */
function calcularAlcanceColonias(
  coleccion: ColeccionColonias,
  actuante: UsuarioActuante | null,
): Map<number, boolean> {
  const resultado = new Map<number, boolean>();
  for (const rasgo of coleccion.features) {
    const demarcacionId = idDemarcacionDeNombre(rasgo.properties.demarcacion_principal);
    const dentro = rasgo.properties.secciones.some((clave) =>
      puedeVerSeccion(actuante, clave, demarcacionId),
    );
    resultado.set(rasgo.properties.colonia_id, dentro);
  }
  return resultado;
}

function duracionUi(): number {
  return prefiereMenosMovimiento() ? 0 : leerDuracionMs("--dur-ui", 160);
}

/** Expresión de fill-opacity de secciones cuando el grupo está mostrado, o 0 si está oculto. */
function opacidadRellenoSeccion(
  mostrar: boolean,
): DataDrivenPropertyValueSpecification<number> {
  if (!mostrar) return 0;
  return [
    "case",
    ["boolean", ["feature-state", "hueco"], false],
    0.05,
    ["==", ["coalesce", ["feature-state", "enAlcance"], true], false],
    0.32,
    0.86,
  ];
}

function opacidadBordeSeccion(
  mostrar: boolean,
): DataDrivenPropertyValueSpecification<number> {
  if (!mostrar) return 0;
  return ["case", ["==", ["coalesce", ["feature-state", "enAlcance"], true], false], 0.4, 1];
}

function opacidadRellenoColonia(
  mostrar: boolean,
): DataDrivenPropertyValueSpecification<number> {
  if (!mostrar) return 0;
  return ["case", ["==", ["coalesce", ["feature-state", "enAlcance"], true], false], 0.32, 0.86];
}

function opacidadBordeColonia(
  mostrar: boolean,
): DataDrivenPropertyValueSpecification<number> {
  if (!mostrar) return 0;
  return ["case", ["==", ["coalesce", ["feature-state", "enAlcance"], true], false], 0.4, 1];
}

export type MapaLienzoProps = {
  /** El GeoJSON ya cargado por lib/territorio.ts. El lienzo nunca lo pide él mismo. */
  coleccion: ColeccionSecciones;
  /** El resumen real por sección y por colonia, ya recortado al territorio del actuante. */
  datos: DatosMapa;
  vista: VistaMapa;
  claveSeleccionada: string | null;
  coloniaSeleccionada: number | null;
  onClicSeccion: (rasgo: RasgoSeccion, puntoPantalla: { x: number; y: number }) => void;
  onClicColonia: (rasgo: RasgoColonia, puntoPantalla: { x: number; y: number }) => void;
  onMovimiento: (moviendo: boolean) => void;
};

/**
 * El lienzo de MapLibre. Todo lo que toca `maplibre-gl` vive aquí: la instancia nunca sale al
 * estado de React, se guarda en un ref y se destruye al desmontar. La ficha, la barra y el
 * selector de capas son componentes hermanos, aparte, que se comunican con este por props.
 */
export function MapaLienzo({
  coleccion,
  datos,
  vista,
  claveSeleccionada,
  coloniaSeleccionada,
  onClicSeccion,
  onClicColonia,
  onMovimiento,
}: MapaLienzoProps) {
  const { actuante } = useActuante();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibreMap | null>(null);
  const oscura = usePreferenciaOscura();

  // Refs "espejo" de las props/estado más recientes, para leerlas desde manejadores de eventos
  // de MapLibre que se enganchan una sola vez y no deben quedarse con valores viejos.
  const estadoRef = useRef({ vista, actuante, claveSeleccionada, coloniaSeleccionada, datos });
  const coleccionRef = useRef(coleccion);
  const coleccionColoniasRef = useRef<ColeccionColonias | null>(null);
  const onClicSeccionRef = useRef(onClicSeccion);
  const onClicColoniaRef = useRef(onClicColonia);
  const onMovimientoRef = useRef(onMovimiento);

  // Los espejos se actualizan después de pintar, no durante el render.
  useEffect(() => {
    estadoRef.current = { vista, actuante, claveSeleccionada, coloniaSeleccionada, datos };
    coleccionRef.current = coleccion;
    onClicSeccionRef.current = onClicSeccion;
    onClicColoniaRef.current = onClicColonia;
    onMovimientoRef.current = onMovimiento;
  });
  const claveResaltadaRef = useRef<string | null>(null);
  const coloniaResaltadaRef = useRef<number | null>(null);
  const ocultarSeccionesTimeoutRef = useRef<number | null>(null);
  const ocultarColoniasTimeoutRef = useRef<number | null>(null);

  function limpiarTimeout(ref: React.MutableRefObject<number | null>) {
    if (ref.current != null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }

  /**
   * Muestra u oculta el grupo de capas de secciones con un fundido de opacidad — el mismo patrón
   * que ya usan hueco/enAlcance, no una animación nueva — en vez de un salto de visibilidad. La
   * visibilidad de verdad (layout, para que deje de recibir clics) se apaga recién cuando el
   * fundido termina.
   */
  function mostrarSecciones(mapa: MapaLibreMap, mostrar: boolean, duracionMs: number) {
    limpiarTimeout(ocultarSeccionesTimeoutRef);
    const capas = idsCapasRelleno();
    if (mostrar) {
      for (const id of capas) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "visibility", "visible");
      if (mapa.getLayer(CAPA_BORDE)) mapa.setLayoutProperty(CAPA_BORDE, "visibility", "visible");
    }
    for (const id of capas) {
      if (mapa.getLayer(id)) mapa.setPaintProperty(id, "fill-opacity", opacidadRellenoSeccion(mostrar));
    }
    if (mapa.getLayer(CAPA_BORDE)) {
      mapa.setPaintProperty(CAPA_BORDE, "line-opacity", opacidadBordeSeccion(mostrar));
    }
    if (!mostrar) {
      ocultarSeccionesTimeoutRef.current = window.setTimeout(() => {
        for (const id of capas) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "visibility", "none");
        if (mapa.getLayer(CAPA_BORDE)) mapa.setLayoutProperty(CAPA_BORDE, "visibility", "none");
      }, duracionMs);
    }
  }

  /** El mismo fundido que `mostrarSecciones`, para el grupo de capas de colonias. */
  function mostrarColonias(mapa: MapaLibreMap, mostrar: boolean, duracionMs: number) {
    limpiarTimeout(ocultarColoniasTimeoutRef);
    const capas = idsCapasColoniaRelleno();
    if (mostrar) {
      for (const id of capas) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "visibility", "visible");
      if (mapa.getLayer(CAPA_COLONIA_BORDE)) mapa.setLayoutProperty(CAPA_COLONIA_BORDE, "visibility", "visible");
    }
    for (const id of capas) {
      if (mapa.getLayer(id)) mapa.setPaintProperty(id, "fill-opacity", opacidadRellenoColonia(mostrar));
    }
    if (mapa.getLayer(CAPA_COLONIA_BORDE)) {
      mapa.setPaintProperty(CAPA_COLONIA_BORDE, "line-opacity", opacidadBordeColonia(mostrar));
    }
    if (!mostrar) {
      ocultarColoniasTimeoutRef.current = window.setTimeout(() => {
        for (const id of capas) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "visibility", "none");
        if (mapa.getLayer(CAPA_COLONIA_BORDE)) mapa.setLayoutProperty(CAPA_COLONIA_BORDE, "visibility", "none");
      }, duracionMs);
    }
  }

  /** Aplica valor de vista, alcance territorial, hueco y selección a todas las secciones. */
  function aplicarEstadoCompleto(mapa: MapaLibreMap) {
    const {
      vista: vistaActual,
      actuante: actuanteActual,
      claveSeleccionada: claveActual,
      datos: datosActuales,
    } = estadoRef.current;
    const alcance = calcularAlcanceMapa(coleccionRef.current, actuanteActual);
    const esColonias = vistaEsDeColonias(vistaActual);
    const pasos = esColonias
      ? new Map<string, number>()
      : calcularPasosDeVista(vistaActual, datosActuales);
    const esEstructura = vistaActual === "estructura";
    for (const rasgo of coleccionRef.current.features) {
      const clave = rasgo.properties.clave;
      const dato = datosActuales.porClave.get(clave);
      mapa.setFeatureState(
        { source: FUENTE_ID, id: clave },
        {
          valor: pasos.get(clave) ?? 0,
          enAlcance: alcance.get(clave) ?? true,
          seleccionada: clave === claveActual,
          hueco: esEstructura && dato != null && !dato.tieneResponsable,
        },
      );
    }
    claveResaltadaRef.current = claveActual;
  }

  /** El mismo cálculo que `aplicarEstadoCompleto`, para la fuente de colonias. */
  function aplicarEstadoColonias(mapa: MapaLibreMap) {
    const coleccionColonias = coleccionColoniasRef.current;
    if (!coleccionColonias) return;
    const {
      actuante: actuanteActual,
      datos: datosActuales,
      coloniaSeleccionada: coloniaActual,
    } = estadoRef.current;
    const alcance = calcularAlcanceColonias(coleccionColonias, actuanteActual);
    const pasos = calcularPasosDeColonia(datosActuales);
    for (const rasgo of coleccionColonias.features) {
      const id = rasgo.properties.colonia_id;
      mapa.setFeatureState(
        { source: FUENTE_COLONIAS_ID, id },
        {
          valor: pasos.get(id) ?? 0,
          enAlcance: alcance.get(id) ?? true,
          seleccionada: id === coloniaActual,
        },
      );
    }
    coloniaResaltadaRef.current = coloniaActual;
  }

  /** Agrega la fuente y las capas de secciones sobre un estilo recién cargado. Idempotente. */
  function construirCapas(mapa: MapaLibreMap) {
    if (mapa.getSource(FUENTE_ID)) return;

    mapa.addSource(FUENTE_ID, {
      type: "geojson",
      // La geometría de RasgoSeccion no es una unión discriminada para TypeScript aunque sí lo
      // sea en los datos reales; MapLibre solo necesita GeoJSON válido en tiempo de ejecución.
      data: aumentarColeccion(coleccionRef.current, estadoRef.current.datos) as unknown as GeoJSON.FeatureCollection,
      promoteId: "clave",
    });

    const menosMovimiento = prefiereMenosMovimiento();
    const escala = leerEscalaMapa();
    const colorBorde = leerColor("--borde", "#e4e3e1");
    const colorBordeSeleccion = leerColor("--tinta", "#1c1b19");
    const colorHueco = leerColor("--tinta-tenue", "#94918c");
    const durPanel = menosMovimiento ? 0 : leerDuracionMs("--dur-panel", 240);
    const durUi = menosMovimiento ? 0 : leerDuracionMs("--dur-ui", 160);
    const ventanaRetrasoMs = menosMovimiento ? 0 : 300;

    // Una capa de relleno por grupo de retraso: misma expresión de color en todas, pero cada una
    // con su propio "fill-color-transition.delay" fijo, así el barrido recorre el mapa desde el
    // centro del municipio. La duración sale de --dur-panel, nunca copiada a mano dos veces.
    for (let grupo = 0; grupo < GRUPOS_RETRASO; grupo++) {
      mapa.addLayer({
        id: idCapaRelleno(grupo),
        type: "fill",
        source: FUENTE_ID,
        filter: ["==", ["get", PROP_GRUPO_RETRASO], grupo],
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["feature-state", "valor"], 0],
            0,
            escala[0],
            1,
            escala[1],
            2,
            escala[2],
            3,
            escala[3],
            4,
            escala[4],
          ],
          // Sin responsable, en la vista de estructura: hueca, no roja. No es un error, es
          // trabajo pendiente (spec/sistema-diseno.md). El resto sigue la atenuación por alcance.
          "fill-opacity": opacidadRellenoSeccion(!vistaEsDeColonias(estadoRef.current.vista)),
          "fill-outline-color": "rgba(0,0,0,0)",
          "fill-color-transition": {
            duration: durPanel,
            delay: retrasoDeGrupoMs(grupo, ventanaRetrasoMs),
          },
          "fill-opacity-transition": { duration: durUi, delay: 0 },
        },
      });
    }

    // Borde de sección aparte: así el trazo no se duplica entre polígonos vecinos y la sección
    // elegida puede llevar un trazo más grueso sin tocar el relleno.
    mapa.addLayer({
      id: CAPA_BORDE,
      type: "line",
      source: FUENTE_ID,
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          colorBordeSeleccion,
          colorBorde,
        ],
        "line-width": ["case", ["boolean", ["feature-state", "seleccionada"], false], 2.5, 1],
        "line-opacity": opacidadBordeSeccion(!vistaEsDeColonias(estadoRef.current.vista)),
        "line-color-transition": { duration: durUi, delay: 0 },
        "line-width-transition": { duration: durUi, delay: 0 },
        "line-opacity-transition": { duration: durUi, delay: 0 },
      },
    });

    // Borde punteado, solo visible en la vista de estructura y solo sobre las secciones sin
    // responsable. Filtro estático (propiedad del rasgo, no feature-state: line-dasharray no
    // admite expresiones dependientes de datos); la visibilidad la controla el efecto de vista.
    mapa.addLayer({
      id: CAPA_SIN_RESPONSABLE,
      type: "line",
      source: FUENTE_ID,
      filter: ["==", ["get", PROP_SIN_RESPONSABLE], true],
      layout: { visibility: "none" },
      paint: {
        "line-color": colorHueco,
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    });

    aplicarEstadoCompleto(mapa);
    mapa.setLayoutProperty(
      CAPA_SIN_RESPONSABLE,
      "visibility",
      estadoRef.current.vista === "estructura" ? "visible" : "none",
    );
  }

  /**
   * Agrega la fuente y las capas de colonias. Idempotente y solo tiene efecto una vez que
   * `coleccionColoniasRef` ya trae el GeoJSON (lo carga, la primera vez, el efecto de vista).
   * Arranca en opacidad 0 a propósito: la primera aparición también es un fundido, nunca un
   * salto, y quien la sube es `mostrarColonias` justo después de construir.
   */
  function construirCapasColonias(mapa: MapaLibreMap) {
    const coleccionColonias = coleccionColoniasRef.current;
    if (!coleccionColonias || mapa.getSource(FUENTE_COLONIAS_ID)) return;

    mapa.addSource(FUENTE_COLONIAS_ID, {
      type: "geojson",
      data: aumentarColonias(coleccionColonias) as unknown as GeoJSON.FeatureCollection,
      promoteId: "colonia_id",
    });

    const menosMovimiento = prefiereMenosMovimiento();
    const escala = leerEscalaMapa();
    const colorBorde = leerColor("--borde", "#e4e3e1");
    const colorBordeSeleccion = leerColor("--tinta", "#1c1b19");
    const durPanel = menosMovimiento ? 0 : leerDuracionMs("--dur-panel", 240);
    const durUi = menosMovimiento ? 0 : leerDuracionMs("--dur-ui", 160);
    const ventanaRetrasoMs = menosMovimiento ? 0 : 300;

    for (let grupo = 0; grupo < GRUPOS_RETRASO; grupo++) {
      mapa.addLayer({
        id: idCapaColoniaRelleno(grupo),
        type: "fill",
        source: FUENTE_COLONIAS_ID,
        filter: ["==", ["get", PROP_GRUPO_RETRASO], grupo],
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["feature-state", "valor"], 0],
            0,
            escala[0],
            1,
            escala[1],
            2,
            escala[2],
            3,
            escala[3],
            4,
            escala[4],
          ],
          "fill-opacity": 0,
          "fill-outline-color": "rgba(0,0,0,0)",
          "fill-color-transition": {
            duration: durPanel,
            delay: retrasoDeGrupoMs(grupo, ventanaRetrasoMs),
          },
          "fill-opacity-transition": { duration: durUi, delay: 0 },
        },
      });
    }

    mapa.addLayer({
      id: CAPA_COLONIA_BORDE,
      type: "line",
      source: FUENTE_COLONIAS_ID,
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          colorBordeSeleccion,
          colorBorde,
        ],
        "line-width": ["case", ["boolean", ["feature-state", "seleccionada"], false], 2.5, 1],
        "line-opacity": 0,
        "line-color-transition": { duration: durUi, delay: 0 },
        "line-width-transition": { duration: durUi, delay: 0 },
        "line-opacity-transition": { duration: durUi, delay: 0 },
      },
    });

    aplicarEstadoColonias(mapa);
  }

  // ---------------------------------------------------------------------------
  // Inicialización. Una sola vez. Guarda contra el doble montaje de StrictMode: si el efecto se
  // desmonta antes de que termine la carga dinámica de maplibre-gl, el mapa nunca se llega a
  // crear; si ya se creó, se destruye. Nunca quedan dos instancias vivas.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    let activo = true;
    let mapaCreado: MapaLibreMap | null = null;

    (async () => {
      // maplibre-gl se importa por nombre; el paquete no trae `export default`.
      const { Map: ClaseMapaLibre } = await import("maplibre-gl");
      if (!activo) return;

      const limite = bboxConMargen(MUNICIPIO.bbox);

      const mapa = new ClaseMapaLibre({
        container: contenedor,
        style: estiloCartoDe(oscura),
        center: MUNICIPIO.centro as unknown as [number, number],
        zoom: MUNICIPIO.zoomSugerido,
        maxBounds: limite,
        attributionControl: { compact: true },
      });

      if (!activo) {
        mapa.remove();
        return;
      }
      mapaCreado = mapa;
      mapaRef.current = mapa;

      mapa.on("style.load", () => {
        construirCapas(mapa);
        // El cambio de tema destruye estilo, fuentes y capas; si las colonias ya se habían
        // cargado alguna vez, se reconstruyen también, respetando si la vista activa es o no la
        // de colonias — sin animación, un cambio de tema no es un cambio de capa.
        if (coleccionColoniasRef.current) {
          construirCapasColonias(mapa);
          const mostrar = vistaEsDeColonias(estadoRef.current.vista);
          mostrarColonias(mapa, mostrar, 0);
          mostrarSecciones(mapa, !mostrar, 0);
        }
      });

      const capasSeccion = idsCapasRelleno();
      mapa.on("mouseenter", capasSeccion, () => {
        mapa.getCanvas().style.cursor = "pointer";
      });
      mapa.on("mouseleave", capasSeccion, () => {
        mapa.getCanvas().style.cursor = "";
      });
      mapa.on("click", capasSeccion, (evento) => {
        const clave = evento.features?.[0]?.properties?.clave as string | undefined;
        if (!clave) return;
        const rasgo = rasgoPorClave(clave, coleccionRef.current);
        if (!rasgo) return;
        // e.point es relativo al contenedor del mapa: se traduce a coordenadas de pantalla para
        // que la ficha (position: fixed) pueda crecer exactamente desde ahí.
        const caja = mapa.getContainer().getBoundingClientRect();
        onClicSeccionRef.current(rasgo, {
          x: caja.left + evento.point.x,
          y: caja.top + evento.point.y,
        });
      });

      // Las capas de colonias todavía no existen la primera vez que el mapa arranca (se cargan
      // solo al elegir esa vista): MapLibre filtra sola los ids que no encuentra en el estilo, así
      // que engancharse aquí, de una vez, es seguro y no dispara nada mientras no existan.
      const capasColonia = idsCapasColoniaRelleno();
      mapa.on("mouseenter", capasColonia, () => {
        mapa.getCanvas().style.cursor = "pointer";
      });
      mapa.on("mouseleave", capasColonia, () => {
        mapa.getCanvas().style.cursor = "";
      });
      mapa.on("click", capasColonia, (evento) => {
        // Si dos colonias se traslapan bajo el dedo, features[0] es la de arriba: solo esa se
        // selecciona, nunca las dos.
        const rasgo = evento.features?.[0] as unknown as RasgoColonia | undefined;
        if (!rasgo) return;
        const caja = mapa.getContainer().getBoundingClientRect();
        onClicColoniaRef.current(rasgo, {
          x: caja.left + evento.point.x,
          y: caja.top + evento.point.y,
        });
      });

      const alEmpezarMovimiento = () => onMovimientoRef.current(true);
      const alTerminarMovimiento = () => onMovimientoRef.current(false);
      mapa.on("movestart", alEmpezarMovimiento);
      mapa.on("zoomstart", alEmpezarMovimiento);
      mapa.on("moveend", alTerminarMovimiento);
      mapa.on("zoomend", alTerminarMovimiento);
    })();

    return () => {
      activo = false;
      if (mapaCreado) {
        mapaCreado.remove();
        if (mapaRef.current === mapaCreado) mapaRef.current = null;
      }
    };
    // Solo al montar: el tema del sistema se maneja aparte, con setStyle, para no reconstruir el
    // mapa completo cada vez que cambia. Los datos y el resto del estado se sincronizan con sus
    // propios efectos, más abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Preferencia de tema del sistema: cambia el estilo base de CARTO sin perder la fuente ni las
  // capas propias, que se reconstruyen solas en el próximo "style.load".
  // ---------------------------------------------------------------------------
  const oscuraAnteriorRef = useRef(oscura);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || oscuraAnteriorRef.current === oscura) return;
    oscuraAnteriorRef.current = oscura;
    mapa.setStyle(estiloCartoDe(oscura));
  }, [oscura]);

  // ---------------------------------------------------------------------------
  // Datos reales: cuando cambia el resumen (por ejemplo, al cambiar de actuante y volver a pedir
  // el territorio recortado), se refresca la propiedad estática "sinResponsable" del origen y se
  // vuelve a aplicar todo el estado, tanto de secciones como de colonias si ya están cargadas. Los
  // pasos de la vista actual se recalculan con los cuantiles nuevos.
  // ---------------------------------------------------------------------------
  const datosAnterioresRef = useRef(datos);
  useEffect(() => {
    const mapa = mapaRef.current;
    const fuente = mapa?.getSource(FUENTE_ID);
    if (!mapa || !fuente || datosAnterioresRef.current === datos) return;
    datosAnterioresRef.current = datos;
    (fuente as GeoJSONSource).setData(
      aumentarColeccion(coleccionRef.current, datos) as unknown as GeoJSON.FeatureCollection,
    );
    aplicarEstadoCompleto(mapa);
    if (mapa.getSource(FUENTE_COLONIAS_ID)) aplicarEstadoColonias(mapa);

  }, [datos]);

  // ---------------------------------------------------------------------------
  // Vista activa: MapLibre interpola el color con la transición nativa de la capa, no salta. La
  // capa punteada de "sin responsable" solo se muestra en la vista de estructura. Cambiar hacia o
  // desde la vista de colonias intercambia el grupo de capas visible con un fundido de opacidad,
  // nunca con un salto de visibilidad; las colonias se cargan la primera vez que hacen falta.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_ID)) return;
    const esColonias = vistaEsDeColonias(vista);
    const esEstructura = vista === "estructura";

    if (!esColonias) {
      const pasos = calcularPasosDeVista(vista, datos);
      for (const rasgo of coleccion.features) {
        const clave = rasgo.properties.clave;
        const dato = datos.porClave.get(clave);
        mapa.setFeatureState(
          { source: FUENTE_ID, id: clave },
          {
            valor: pasos.get(clave) ?? 0,
            hueco: esEstructura && dato != null && !dato.tieneResponsable,
          },
        );
      }
    }

    if (mapa.getLayer(CAPA_SIN_RESPONSABLE)) {
      mapa.setLayoutProperty(
        CAPA_SIN_RESPONSABLE,
        "visibility",
        esEstructura ? "visible" : "none",
      );
    }

    const duracion = duracionUi();
    if (esColonias) {
      cargarColonias()
        .then((coleccionColonias) => {
          coleccionColoniasRef.current = coleccionColonias;
          const mapaActual = mapaRef.current;
          // La vista pudo cambiar de nuevo mientras el archivo bajaba: si ya no es colonias, no
          // hay nada que mostrar.
          if (!mapaActual || !vistaEsDeColonias(estadoRef.current.vista)) return;
          if (!mapaActual.getSource(FUENTE_COLONIAS_ID)) {
            construirCapasColonias(mapaActual);
          } else {
            aplicarEstadoColonias(mapaActual);
          }
          mostrarColonias(mapaActual, true, duracionUi());
          mostrarSecciones(mapaActual, false, duracionUi());
        })
        .catch(() => {
          // Sin conexión o archivo caído: se queda en la vista anterior en vez de romper el mapa.
        });
    } else {
      mostrarColonias(mapa, false, duracion);
      mostrarSecciones(mapa, true, duracion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  // ---------------------------------------------------------------------------
  // Rol actuante: qué secciones y colonias caen dentro del territorio propio. Nunca decide aquí
  // quién ve qué, solo traslada lo que ya calculó lib/permisos.ts a las feature-states del mapa.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (mapa.getSource(FUENTE_ID)) {
      const alcance = calcularAlcanceMapa(coleccion, actuante);
      for (const [clave, dentro] of alcance) {
        mapa.setFeatureState({ source: FUENTE_ID, id: clave }, { enAlcance: dentro });
      }
    }
    const coleccionColonias = coleccionColoniasRef.current;
    if (coleccionColonias && mapa.getSource(FUENTE_COLONIAS_ID)) {
      const alcanceColonias = calcularAlcanceColonias(coleccionColonias, actuante);
      for (const [id, dentro] of alcanceColonias) {
        mapa.setFeatureState({ source: FUENTE_COLONIAS_ID, id }, { enAlcance: dentro });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actuante]);

  // ---------------------------------------------------------------------------
  // Sección elegida: resalta su borde y desplaza/ajusta la cámara con la curva y duración del
  // sistema. Nunca salta, y respeta prefers-reduced-motion.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_ID)) return;

    const anterior = claveResaltadaRef.current;
    if (anterior && anterior !== claveSeleccionada) {
      mapa.setFeatureState({ source: FUENTE_ID, id: anterior }, { seleccionada: false });
    }
    if (claveSeleccionada) {
      mapa.setFeatureState({ source: FUENTE_ID, id: claveSeleccionada }, { seleccionada: true });
    }
    claveResaltadaRef.current = claveSeleccionada;

    if (!claveSeleccionada) return;
    const rasgo = rasgoPorClave(claveSeleccionada, coleccion);
    if (!rasgo) return;

    const menosMovimiento = prefiereMenosMovimiento();
    const duracion = menosMovimiento ? 0 : leerDuracionMs("--dur-camara", 600);
    const curva = crearFuncionCurva(leerCurva("--curva"));
    const escritorio = window.matchMedia("(min-width: 768px)").matches;

    mapa.fitBounds(bboxDeRasgo(rasgo), {
      padding: escritorio
        ? { top: 110, right: 440, bottom: 48, left: 48 }
        : { top: 140, right: 24, bottom: Math.round(window.innerHeight * 0.52), left: 24 },
      duration: duracion,
      easing: curva,
      maxZoom: 16,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSeleccionada]);

  // ---------------------------------------------------------------------------
  // Colonia elegida: el mismo mecanismo que la sección elegida, sobre la fuente de colonias.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_COLONIAS_ID)) return;

    const anterior = coloniaResaltadaRef.current;
    if (anterior != null && anterior !== coloniaSeleccionada) {
      mapa.setFeatureState({ source: FUENTE_COLONIAS_ID, id: anterior }, { seleccionada: false });
    }
    if (coloniaSeleccionada != null) {
      mapa.setFeatureState(
        { source: FUENTE_COLONIAS_ID, id: coloniaSeleccionada },
        { seleccionada: true },
      );
    }
    coloniaResaltadaRef.current = coloniaSeleccionada;

    if (coloniaSeleccionada == null) return;
    const rasgo = coleccionColoniasRef.current?.features.find(
      (f) => f.properties.colonia_id === coloniaSeleccionada,
    );
    if (!rasgo) return;

    const menosMovimiento = prefiereMenosMovimiento();
    const duracion = menosMovimiento ? 0 : leerDuracionMs("--dur-camara", 600);
    const curva = crearFuncionCurva(leerCurva("--curva"));
    const escritorio = window.matchMedia("(min-width: 768px)").matches;

    mapa.fitBounds(bboxDeRasgo(rasgo as unknown as RasgoSeccion), {
      padding: escritorio
        ? { top: 110, right: 440, bottom: 48, left: 48 }
        : { top: 140, right: 24, bottom: Math.round(window.innerHeight * 0.52), left: 24 },
      duration: duracion,
      easing: curva,
      maxZoom: 16,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coloniaSeleccionada]);

  return (
    <div
      ref={contenedorRef}
      // El CSS de MapLibre marca .maplibregl-map como position: relative y le gana a la clase
      // absolute de Tailwind, así que el contenedor toma su tamaño del padre en vez de inset-0.
      className="size-full"
      role="application"
      aria-label="Mapa de secciones electorales de Oaxaca de Juárez"
    />
  );
}
