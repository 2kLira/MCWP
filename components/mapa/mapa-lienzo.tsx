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
import { bboxDeRasgo, rasgoPorClave, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import {
  calcularPasosDeVista,
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
 * El mismo GeoJSON de lib/territorio.ts, con tres propiedades estáticas de más por rasgo:
 * `grupoRetraso` (con qué demora entra en la transición de color, según su distancia al centro
 * del municipio), `sinResponsable` (si la base ya dice que esa sección no tiene responsable) y
 * `sinDato` (si la sección no está en el catálogo de 169 y por lo tanto no tiene `dato`: son las
 * seis sustitutas que la cartografía sí trae pero que no se cuentan ni se pintan). Las tres son
 * propiedades del rasgo, no feature-state: el filtro de capa (line-dasharray incluido) no puede
 * leer feature-state.
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
        },
      };
    }),
  };
}

/**
 * Expresión de fill-opacity de secciones: hueca si no tiene responsable (vista de estructura),
 * atenuada si no es del grupo de la vista de prioritarias activa (para que se vea el territorio
 * pero no compita con lo que importa) y, aparte de las dos, rebajada otra vez si además está fuera
 * del alcance del actuante. Las secciones sin `dato` (fuera del catálogo) no llegan aquí: las capas
 * de relleno y borde las excluyen por filtro, ver PROP_SIN_DATO.
 */
function opacidadRellenoSeccion(): DataDrivenPropertyValueSpecification<number> {
  return [
    "case",
    ["boolean", ["feature-state", "hueco"], false],
    0.05,
    [
      "all",
      ["boolean", ["feature-state", "atenuada"], false],
      ["==", ["coalesce", ["feature-state", "enAlcance"], true], false],
    ],
    0.12,
    ["boolean", ["feature-state", "atenuada"], false],
    0.18,
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

  // Los espejos se actualizan después de pintar, no durante el render.
  useEffect(() => {
    estadoRef.current = { vista, actuante, claveSeleccionada, datos };
    coleccionRef.current = coleccion;
    onClicSeccionRef.current = onClicSeccion;
    onMovimientoRef.current = onMovimiento;
  });
  const claveResaltadaRef = useRef<string | null>(null);

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
          atenuada: grupoPrioritario != null && dato?.prioridad !== grupoPrioritario,
        },
      );
    }
    claveResaltadaRef.current = claveActual;
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

    aplicarEstadoCompleto(mapa);
    mapa.setLayoutProperty(
      CAPA_SIN_RESPONSABLE,
      "visibility",
      estadoRef.current.vista === "estructura" ? "visible" : "none",
    );
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
  // Vista activa: MapLibre interpola el color con la transición nativa de la capa, no salta. La
  // capa punteada de "sin responsable" solo se muestra en la vista de estructura.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_ID)) return;
    const esEstructura = vista === "estructura";
    const grupoPrioritario = grupoDePrioritarias(vista);

    const pasos = calcularPasosDeVista(vista, datos);
    for (const rasgo of coleccion.features) {
      const clave = rasgo.properties.clave;
      const dato = datos.porClave.get(clave);
      mapa.setFeatureState(
        { source: FUENTE_ID, id: clave },
        {
          valor: pasos.get(clave) ?? 0,
          hueco: esEstructura && dato != null && !dato.tieneResponsable,
          atenuada: grupoPrioritario != null && dato?.prioridad !== grupoPrioritario,
        },
      );
    }

    if (mapa.getLayer(CAPA_SIN_RESPONSABLE)) {
      mapa.setLayoutProperty(
        CAPA_SIN_RESPONSABLE,
        "visibility",
        esEstructura ? "visible" : "none",
      );
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
