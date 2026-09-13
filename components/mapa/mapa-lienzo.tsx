"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  DataDrivenPropertyValueSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapaLibreMap,
} from "maplibre-gl";
import { useActuante } from "@/components/proveedor-actuante";
import { MUNICIPIO } from "@/lib/demarcaciones";
import { avanceDeCasilla, type CasillaConRepresentantes } from "@/lib/datos/casillas";
import { bboxDeRasgo, rasgoPorClave, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import {
  calcularPasosDeVista,
  esVistaDeCasillas,
  grupoDePrioritarias,
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
import { calcularAlcanceMapa } from "./permisos-mapa";
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
// Distinto de "hueco" (feature-state de la vista de estructura, sección sin responsable): esta es
// una sección que ni siquiera está en el catálogo de 169 (las seis sustitutas con
// en_catalogo = false). No tiene `dato`, y por eso no se pinta ni responde al clic.
const PROP_SIN_DATO = "sinDato";
// Capa punteada de la vista de prioritarias: sección del grupo activo que todavía no se recorre.
// Mismo mecanismo que CAPA_SIN_RESPONSABLE (line-dasharray no admite feature-state, así que el
// filtro necesita propiedades estáticas del rasgo) pero con sus propias propiedades: no se
// reutilizan PROP_SIN_RESPONSABLE ni el feature-state "hueco" porque significan otra cosa
// (estructura, no prioritarias) y mezclarlos confunde. El grupo A o B depende de la vista activa,
// así que el filtro se recalcula con setFilter cada vez que cambia la vista, ver más abajo.
const CAPA_PRIORITARIA_PENDIENTE = "secciones-prioritaria-pendiente";
const PROP_GRUPO_PRIORIDAD = "grupoPrioridad";
const PROP_PRIORITARIA_RECORRIDA = "prioritariaRecorrida";

// Fuente y capas de los puntos de casilla de la vista "casillas". Nombre distinto al de la fuente
// homónima de components/casillas/mapa-casillas.tsx: ese lienzo vive en su propia instancia de
// MapLibre, sin relación con esta, pero el prefijo deja claro que esta es la variante embebida en
// el mapa principal.
const FUENTE_CASILLAS_ID = "casillas-en-mapa-principal";
const CAPA_CASILLA_TRAZO = "casillas-en-mapa-principal-trazo";
const CAPA_CASILLA_PUNTO = "casillas-en-mapa-principal-punto";

/** "vacia" -> 0, "parcial" -> 1, "completa" -> 2, igual que en mapa-casillas.tsx: nada más para
 *  poder usar un match de MapLibre (line-dasharray y compañía no aceptan strings de dato). */
const NUMERO_DE_AVANCE_CASILLA = { vacia: 0, parcial: 1, completa: 2 } as const;

type RasgoCasillaLienzo = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { id: number; avance: 0 | 1 | 2 };
};

/**
 * El mismo GeoJSON de puntos que arma components/casillas/mapa-casillas.tsx, con la misma forma.
 * No se reutiliza esa función porque no se exporta y ese archivo no se toca; se copia tal cual.
 */
function coleccionDeCasillas(
  casillas: readonly CasillaConRepresentantes[] | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (casillas ?? []).map(
      (casilla): RasgoCasillaLienzo => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [casilla.lng, casilla.lat] },
        properties: { id: casilla.id, avance: NUMERO_DE_AVANCE_CASILLA[avanceDeCasilla(casilla)] },
      }),
    ),
  } as unknown as GeoJSON.FeatureCollection;
}

function idCapaRelleno(grupo: number): string {
  return `secciones-relleno-${grupo}`;
}

function idsCapasRelleno(): string[] {
  return Array.from({ length: GRUPOS_RETRASO }, (_, i) => idCapaRelleno(i));
}

type PropiedadesAumentadas = RasgoSeccion["properties"] & {
  [PROP_GRUPO_RETRASO]: number;
  [PROP_SIN_RESPONSABLE]: boolean;
  [PROP_SIN_DATO]: boolean;
  [PROP_GRUPO_PRIORIDAD]: "A" | "B" | "";
  [PROP_PRIORITARIA_RECORRIDA]: boolean;
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
 * El mismo GeoJSON de lib/territorio.ts, con cinco propiedades estáticas de más por rasgo:
 * `grupoRetraso` (con qué demora entra en la transición de color, según su distancia al centro
 * del municipio), `sinResponsable` (si la base ya dice que esa sección no tiene responsable),
 * `sinDato` (si la sección no está en el catálogo de 169 y por lo tanto no tiene `dato`: son las
 * seis sustitutas que la cartografía sí trae pero que no se cuentan ni se pintan), `grupoPrioridad`
 * (su prioridad "A", "B" o "" si no es prioritaria) y `prioritariaRecorrida` (si ya se recorrió).
 * Todas son propiedades del rasgo, no feature-state: el filtro de capa (line-dasharray incluido)
 * no puede leer feature-state.
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
          [PROP_SIN_DATO]: dato == null,
          [PROP_GRUPO_PRIORIDAD]: dato?.prioridad ?? "",
          [PROP_PRIORITARIA_RECORRIDA]: dato?.recorrida ?? false,
        },
      };
    }),
  };
}

/**
 * Filtro de CAPA_PRIORITARIA_PENDIENTE: secciones del grupo de prioridad activo que todavía no se
 * recorren. `grupo` es null cuando la vista activa no es de prioritarias; "__ninguna__" no
 * coincide con ningún valor real de PROP_GRUPO_PRIORIDAD ("A", "B" o ""), así que el filtro no
 * deja pasar nada y la capa queda vacía sin depender de su visibilidad.
 */
function filtroPrioritariaPendiente(grupo: "A" | "B" | null): FilterSpecification {
  return [
    "all",
    ["==", ["get", PROP_GRUPO_PRIORIDAD], grupo ?? "__ninguna__"],
    ["==", ["get", PROP_PRIORITARIA_RECORRIDA], false],
  ];
}

/**
 * Expresión de fill-opacity de secciones: hueca si no tiene responsable (vista de estructura) o si
 * es una prioritaria del grupo activo que todavía no se recorre (vistas de prioritarias, feature-
 * state "prioritariaPendiente"); atenuada si no es del grupo de la vista de prioritarias activa, o
 * si la vista activa es la de casillas —ahí todas quedan atenuadas parejo, sin excepción, para que
 * el territorio siga visible sin competir con los puntos (ver esVistaDeCasillas)—; y, aparte de las
 * tres, rebajada otra vez si además está fuera del alcance del actuante. Las secciones sin `dato`
 * (fuera del catálogo) no llegan aquí: las capas de relleno y borde las excluyen por filtro, ver
 * PROP_SIN_DATO.
 */
function opacidadRellenoSeccion(): DataDrivenPropertyValueSpecification<number> {
  return [
    "case",
    ["boolean", ["feature-state", "hueco"], false],
    0.05,
    // Prioritaria del grupo activo, sin recorrer: relleno tenue y borde punteado. Tiene que
    // pesar MÁS que una sección que no es de este grupo, o el mapa de A acaba destacando las de B.
    ["boolean", ["feature-state", "prioritariaPendiente"], false],
    0.14,
    [
      "all",
      ["boolean", ["feature-state", "atenuada"], false],
      ["==", ["coalesce", ["feature-state", "enAlcance"], true], false],
    ],
    0.03,
    // No es del grupo de esta vista: se ve el territorio y nada más. Muy por debajo de lo anterior.
    ["boolean", ["feature-state", "atenuada"], false],
    0.06,
    ["==", ["coalesce", ["feature-state", "enAlcance"], true], false],
    0.32,
    0.86,
  ];
}

function opacidadBordeSeccion(): DataDrivenPropertyValueSpecification<number> {
  return ["case", ["==", ["coalesce", ["feature-state", "enAlcance"], true], false], 0.4, 1];
}

export type MapaLienzoProps = {
  /** El GeoJSON ya cargado por lib/territorio.ts. El lienzo nunca lo pide él mismo. */
  coleccion: ColeccionSecciones;
  /** El resumen real por sección, ya recortado al territorio del actuante. */
  datos: DatosMapa;
  vista: VistaMapa;
  claveSeleccionada: string | null;
  onClicSeccion: (rasgo: RasgoSeccion, puntoPantalla: { x: number; y: number }) => void;
  onMovimiento: (moviendo: boolean) => void;
  /** Las casillas del territorio del actuante, o null mientras no se han pedido todavía: la vista
   *  de casillas las carga perezosa (lib/datos/casillas.ts), no al arrancar el mapa. */
  casillas: readonly CasillaConRepresentantes[] | null;
  casillaSeleccionadaId: number | null;
  onClicCasilla: (id: number, puntoPantalla: { x: number; y: number }) => void;
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
  onClicSeccion,
  onMovimiento,
  casillas,
  casillaSeleccionadaId,
  onClicCasilla,
}: MapaLienzoProps) {
  const { actuante } = useActuante();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibreMap | null>(null);
  const oscura = usePreferenciaOscura();

  // Refs "espejo" de las props/estado más recientes, para leerlas desde manejadores de eventos
  // de MapLibre que se enganchan una sola vez y no deben quedarse con valores viejos.
  const estadoRef = useRef({ vista, actuante, claveSeleccionada, datos });
  const coleccionRef = useRef(coleccion);
  const onClicSeccionRef = useRef(onClicSeccion);
  const onMovimientoRef = useRef(onMovimiento);
  const casillasRef = useRef(casillas);
  const casillaSeleccionadaIdRef = useRef(casillaSeleccionadaId);
  const onClicCasillaRef = useRef(onClicCasilla);

  // Los espejos se actualizan después de pintar, no durante el render.
  useEffect(() => {
    estadoRef.current = { vista, actuante, claveSeleccionada, datos };
    coleccionRef.current = coleccion;
    onClicSeccionRef.current = onClicSeccion;
    onMovimientoRef.current = onMovimiento;
    casillasRef.current = casillas;
    casillaSeleccionadaIdRef.current = casillaSeleccionadaId;
    onClicCasillaRef.current = onClicCasilla;
  });
  const claveResaltadaRef = useRef<string | null>(null);
  const casillaResaltadaRef = useRef<number | null>(null);

  /** Aplica valor de vista, alcance territorial, hueco y selección a todas las secciones. */
  function aplicarEstadoCompleto(mapa: MapaLibreMap) {
    const {
      vista: vistaActual,
      actuante: actuanteActual,
      claveSeleccionada: claveActual,
      datos: datosActuales,
    } = estadoRef.current;
    const alcance = calcularAlcanceMapa(coleccionRef.current, actuanteActual);
    const pasos = calcularPasosDeVista(vistaActual, datosActuales);
    const esEstructura = vistaActual === "estructura";
    const grupoPrioritario = grupoDePrioritarias(vistaActual);
    const esCasillas = esVistaDeCasillas(vistaActual);
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
          atenuada: esCasillas || (grupoPrioritario != null && dato?.prioridad !== grupoPrioritario),
          prioritariaPendiente:
            grupoPrioritario != null && dato != null && dato.prioridad === grupoPrioritario && !dato.recorrida,
        },
      );
    }
    claveResaltadaRef.current = claveActual;
  }

  /** Resalta el punto de casilla elegido, igual que aplicarSeleccion en mapa-casillas.tsx. */
  function aplicarSeleccionCasilla(mapa: MapaLibreMap, id: number | null) {
    const anterior = casillaResaltadaRef.current;
    if (anterior != null && anterior !== id) {
      mapa.setFeatureState({ source: FUENTE_CASILLAS_ID, id: anterior }, { seleccionada: false });
    }
    if (id != null) {
      mapa.setFeatureState({ source: FUENTE_CASILLAS_ID, id }, { seleccionada: true });
    }
    casillaResaltadaRef.current = id;
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
    // El punteado de una prioritaria por recorrer va en el naranja tipográfico, no en el gris de
    // "sin responsable": pertenece a la misma historia que lo ya recorrido, y así el mapa cuenta
    // una sola cosa. El gris se queda para la vista de estructura, que sí habla de otra cosa.
    const colorPrioritariaPendiente = leerColor("--naranja-tipografico", "#b35700");
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
        // Además del grupo de retraso, deja fuera a las secciones sin `dato`: no están en el
        // catálogo de 169 (las seis sustitutas con en_catalogo = false) y no se pintan ni
        // responden al clic. La geometría se queda cargada en la fuente, solo no se renderiza.
        filter: [
          "all",
          ["==", ["get", PROP_GRUPO_RETRASO], grupo],
          ["!=", ["get", PROP_SIN_DATO], true],
        ],
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
          "fill-opacity": opacidadRellenoSeccion(),
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
    // elegida puede llevar un trazo más grueso sin tocar el relleno. Mismo filtro de PROP_SIN_DATO
    // que el relleno: una sección sin dato tampoco lleva borde.
    mapa.addLayer({
      id: CAPA_BORDE,
      type: "line",
      source: FUENTE_ID,
      filter: ["!=", ["get", PROP_SIN_DATO], true],
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          colorBordeSeleccion,
          colorBorde,
        ],
        "line-width": ["case", ["boolean", ["feature-state", "seleccionada"], false], 2.5, 1],
        "line-opacity": opacidadBordeSeccion(),
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

    // Borde punteado de la vista de prioritarias: mismo trazo que el de arriba, mismo mecanismo
    // (filtro estático porque line-dasharray no admite feature-state), pero sobre sus propias
    // propiedades y su propia capa. El filtro depende del grupo A o B de la vista activa, así que
    // se recalcula con setFilter cada vez que la vista cambia.
    const grupoInicial = grupoDePrioritarias(estadoRef.current.vista);
    mapa.addLayer({
      id: CAPA_PRIORITARIA_PENDIENTE,
      type: "line",
      source: FUENTE_ID,
      filter: filtroPrioritariaPendiente(grupoInicial),
      layout: { visibility: "none" },
      paint: {
        "line-color": colorPrioritariaPendiente,
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });

    // Fuente y capas de los puntos de casilla. No se reutiliza components/casillas/mapa-casillas.tsx:
    // ese componente monta su propia instancia de MapLibre en su propio contenedor, y aquí hace
    // falta un único mapa que alterne entre polígonos de sección y puntos de casilla según la
    // vista activa. Sincronizar cámara y ciclo de vida entre dos mapas independientes es más
    // frágil que copiar sus expresiones de capa, así que se copian tal cual (mismos radios, mismos
    // colores, mismas transiciones). `colorHueco` y `colorBordeSeleccion` son los mismos tokens
    // ("--tinta-tenue" y "--tinta") que usa ese componente para su trazo y su selección.
    mapa.addSource(FUENTE_CASILLAS_ID, {
      type: "geojson",
      data: coleccionDeCasillas(casillasRef.current),
      promoteId: "id",
    });

    // Halo de selección, debajo del punto: igual que CAPA_TRAZO en mapa-casillas.tsx.
    mapa.addLayer({
      id: CAPA_CASILLA_TRAZO,
      type: "circle",
      source: FUENTE_CASILLAS_ID,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "seleccionada"], false], 11, 0],
        "circle-color": colorBordeSeleccion,
        "circle-opacity": 0.18,
        "circle-radius-transition": { duration: durUi, delay: 0 },
      },
    });

    // El punto de casilla: aro hueco si no tiene a nadie, lleno chico si tiene solo titular o
    // suplente, lleno pleno si tiene los dos. Misma expresión que CAPA_PUNTO en mapa-casillas.tsx.
    mapa.addLayer({
      id: CAPA_CASILLA_PUNTO,
      type: "circle",
      source: FUENTE_CASILLAS_ID,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          ["match", ["get", "avance"], 1, 2.5, 4],
          15,
          ["match", ["get", "avance"], 1, 4.3, 7],
          18,
          ["match", ["get", "avance"], 1, 5.6, 9],
        ],
        "circle-color": [
          "match",
          ["get", "avance"],
          0,
          escala[0],
          1,
          escala[2],
          2,
          escala[4],
          escala[0],
        ],
        "circle-opacity": ["match", ["get", "avance"], 0, 0, 1],
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          2.5,
          ["==", ["get", "avance"], 0],
          2,
          1.25,
        ],
        "circle-stroke-color": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          colorBordeSeleccion,
          colorHueco,
        ],
        "circle-radius-transition": { duration: durUi, delay: 0 },
        "circle-opacity-transition": { duration: durUi, delay: 0 },
        "circle-color-transition": { duration: durUi, delay: 0 },
        "circle-stroke-width-transition": { duration: durUi, delay: 0 },
      },
    });

    aplicarSeleccionCasilla(mapa, casillaSeleccionadaIdRef.current);

    aplicarEstadoCompleto(mapa);
    mapa.setLayoutProperty(
      CAPA_SIN_RESPONSABLE,
      "visibility",
      estadoRef.current.vista === "estructura" ? "visible" : "none",
    );
    mapa.setLayoutProperty(
      CAPA_PRIORITARIA_PENDIENTE,
      "visibility",
      grupoInicial ? "visible" : "none",
    );
    const esCasillasInicial = esVistaDeCasillas(estadoRef.current.vista);
    mapa.setLayoutProperty(CAPA_CASILLA_TRAZO, "visibility", esCasillasInicial ? "visible" : "none");
    mapa.setLayoutProperty(CAPA_CASILLA_PUNTO, "visibility", esCasillasInicial ? "visible" : "none");
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
      const { Map: ClaseMapaLibre, NavigationControl } = await import("maplibre-gl");
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

      // Botones de zoom, sin brújula: el aspecto de vidrio lo pone globals.css sobre
      // .maplibregl-ctrl-group. La atribución (compact, ver arriba) se queda en la misma esquina.
      mapa.addControl(new NavigationControl({ showCompass: false, showZoom: true }), "bottom-right");

      mapa.on("style.load", () => {
        construirCapas(mapa);
      });

      const capasSeccion = idsCapasRelleno();
      // En la vista de casillas las secciones quedan de fondo, atenuadas: no responden al clic ni
      // cambian el cursor, para que lo único "tocable" del mapa sean los puntos de casilla.
      mapa.on("mouseenter", capasSeccion, () => {
        if (esVistaDeCasillas(estadoRef.current.vista)) return;
        mapa.getCanvas().style.cursor = "pointer";
      });
      mapa.on("mouseleave", capasSeccion, () => {
        mapa.getCanvas().style.cursor = "";
      });
      mapa.on("click", capasSeccion, (evento) => {
        if (esVistaDeCasillas(estadoRef.current.vista)) return;
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

      // Los puntos de casilla: mismo patrón que mapa-casillas.tsx. Como sus capas solo son
      // visibles en la vista de casillas (ver construirCapas y el efecto de vista más abajo), no
      // hace falta repetir aquí la comprobación de vista: una capa oculta no dispara eventos.
      mapa.on("mouseenter", [CAPA_CASILLA_PUNTO], () => {
        mapa.getCanvas().style.cursor = "pointer";
      });
      mapa.on("mouseleave", [CAPA_CASILLA_PUNTO], () => {
        mapa.getCanvas().style.cursor = "";
      });
      mapa.on("click", [CAPA_CASILLA_PUNTO], (evento) => {
        const id = evento.features?.[0]?.properties?.id as number | undefined;
        if (id == null) return;
        const caja = mapa.getContainer().getBoundingClientRect();
        onClicCasillaRef.current(id, {
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
  // vuelve a aplicar todo el estado. Los pasos de la vista actual se recalculan con los cuantiles
  // nuevos.
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
  }, [datos]);

  // ---------------------------------------------------------------------------
  // Vista activa: MapLibre interpola el color con la transición nativa de la capa, no salta. Las
  // capas punteadas de "sin responsable" y de prioritaria pendiente solo se muestran en su vista
  // correspondiente; la segunda además cambia de filtro porque el grupo A o B depende de la vista.
  // La vista de casillas apaga esas dos y prende la suya: sus puntos, no los polígonos de sección.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_ID)) return;
    const esEstructura = vista === "estructura";
    const grupoPrioritario = grupoDePrioritarias(vista);
    const esCasillas = esVistaDeCasillas(vista);

    const pasos = calcularPasosDeVista(vista, datos);
    for (const rasgo of coleccion.features) {
      const clave = rasgo.properties.clave;
      const dato = datos.porClave.get(clave);
      mapa.setFeatureState(
        { source: FUENTE_ID, id: clave },
        {
          valor: pasos.get(clave) ?? 0,
          hueco: esEstructura && dato != null && !dato.tieneResponsable,
          atenuada: esCasillas || (grupoPrioritario != null && dato?.prioridad !== grupoPrioritario),
          prioritariaPendiente:
            grupoPrioritario != null && dato != null && dato.prioridad === grupoPrioritario && !dato.recorrida,
        },
      );
    }

    if (mapa.getLayer(CAPA_PRIORITARIA_PENDIENTE)) {
      mapa.setFilter(CAPA_PRIORITARIA_PENDIENTE, filtroPrioritariaPendiente(grupoPrioritario));
      mapa.setLayoutProperty(
        CAPA_PRIORITARIA_PENDIENTE,
        "visibility",
        grupoPrioritario ? "visible" : "none",
      );
    }

    if (mapa.getLayer(CAPA_SIN_RESPONSABLE)) {
      mapa.setLayoutProperty(
        CAPA_SIN_RESPONSABLE,
        "visibility",
        esEstructura ? "visible" : "none",
      );
    }

    if (mapa.getLayer(CAPA_CASILLA_PUNTO)) {
      mapa.setLayoutProperty(CAPA_CASILLA_PUNTO, "visibility", esCasillas ? "visible" : "none");
    }
    if (mapa.getLayer(CAPA_CASILLA_TRAZO)) {
      mapa.setLayoutProperty(CAPA_CASILLA_TRAZO, "visibility", esCasillas ? "visible" : "none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  // ---------------------------------------------------------------------------
  // Rol actuante: qué secciones caen dentro del territorio propio. Nunca decide aquí quién ve
  // qué, solo traslada lo que ya calculó lib/permisos.ts a las feature-states del mapa.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_ID)) return;
    const alcance = calcularAlcanceMapa(coleccion, actuante);
    for (const [clave, dentro] of alcance) {
      mapa.setFeatureState({ source: FUENTE_ID, id: clave }, { enAlcance: dentro });
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
  // Casillas: se refresca la fuente completa cuando cambia la lista (primera carga perezosa al
  // entrar a la vista, cambio de actuante, o avance nuevo tras guardar un representante). Mismo
  // patrón que el efecto de "Datos reales" de arriba, pero sobre la fuente de puntos.
  // ---------------------------------------------------------------------------
  const casillasAnterioresRef = useRef(casillas);
  useEffect(() => {
    const mapa = mapaRef.current;
    const fuente = mapa?.getSource(FUENTE_CASILLAS_ID);
    if (!mapa || !fuente || casillasAnterioresRef.current === casillas) return;
    casillasAnterioresRef.current = casillas;
    (fuente as GeoJSONSource).setData(coleccionDeCasillas(casillas));
  }, [casillas]);

  // ---------------------------------------------------------------------------
  // Casilla elegida: resalta su punto. A diferencia de una sección, no mueve la cámara (tampoco lo
  // hacía mapa-casillas.tsx al seleccionar: ahí la cámara solo se movía con el filtro de sección).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_CASILLAS_ID)) return;
    aplicarSeleccionCasilla(mapa, casillaSeleccionadaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casillaSeleccionadaId]);

  return (
    <div
      ref={contenedorRef}
      // El CSS de MapLibre marca .maplibregl-map como position: relative y le gana a la clase
      // absolute de Tailwind, así que el contenedor toma su tamaño del padre en vez de inset-0.
      className="size-full"
      role="application"
      aria-label={
        esVistaDeCasillas(vista)
          ? "Mapa de casillas de Oaxaca de Juárez"
          : "Mapa de secciones electorales de Oaxaca de Juárez"
      }
    />
  );
}
