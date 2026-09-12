"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapaLibreMap, GeoJSONSource } from "maplibre-gl";
import { estiloCartoDe, usePreferenciaOscura } from "@/components/mapa/estilo-base";
import { bboxConMargen } from "@/components/mapa/geometria";
import {
  crearFuncionCurva,
  leerColor,
  leerCurva,
  leerDuracionMs,
  leerEscalaMapa,
  prefiereMenosMovimiento,
} from "@/components/mapa/tokens";
import { MUNICIPIO } from "@/lib/demarcaciones";
import { avanceDeCasilla, type CasillaConRepresentantes } from "@/lib/datos/casillas";

const FUENTE_ID = "casillas";
const CAPA_PUNTO = "casillas-punto";
const CAPA_TRAZO = "casillas-trazo";

/** "vacia" -> 0, "parcial" -> 1, "completa" -> 2: nada más para poder usar un match de MapLibre. */
const NUMERO_DE_AVANCE = { vacia: 0, parcial: 1, completa: 2 } as const;

type RasgoCasilla = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { id: number; avance: 0 | 1 | 2 };
};

function coleccionDe(casillas: readonly CasillaConRepresentantes[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: casillas.map((casilla): RasgoCasilla => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [casilla.lng, casilla.lat] },
      properties: { id: casilla.id, avance: NUMERO_DE_AVANCE[avanceDeCasilla(casilla)] },
    })),
  } as unknown as GeoJSON.FeatureCollection;
}

export type MapaCasillasProps = {
  casillas: readonly CasillaConRepresentantes[];
  casillaSeleccionadaId: number | null;
  /** Encuadre a aplicar cuando el filtro de sección deja un subconjunto, o null para no mover la cámara. */
  encuadre: [number, number, number, number] | null;
  onClicCasilla: (id: number, puntoPantalla: { x: number; y: number }) => void;
  onMovimiento: (moviendo: boolean) => void;
};

/**
 * El lienzo de MapLibre de esta pantalla, con el mismo patrón que components/mapa/mapa-lienzo.tsx:
 * una sola instancia en un ref, fuente GeoJSON con promoteId, feature-state para la selección y
 * los tokens del sistema para color y movimiento. Aquí no hay polígonos: cada casilla es un punto,
 * así que la capa es de círculos en vez de relleno.
 */
export function MapaCasillas({
  casillas,
  casillaSeleccionadaId,
  encuadre,
  onClicCasilla,
  onMovimiento,
}: MapaCasillasProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibreMap | null>(null);
  const oscura = usePreferenciaOscura();

  const casillasRef = useRef(casillas);
  const onClicCasillaRef = useRef(onClicCasilla);
  const onMovimientoRef = useRef(onMovimiento);
  useEffect(() => {
    casillasRef.current = casillas;
    onClicCasillaRef.current = onClicCasilla;
    onMovimientoRef.current = onMovimiento;
  });

  const seleccionadaRef = useRef<number | null>(null);

  function aplicarSeleccion(mapa: MapaLibreMap, id: number | null) {
    const anterior = seleccionadaRef.current;
    if (anterior != null && anterior !== id) {
      mapa.setFeatureState({ source: FUENTE_ID, id: anterior }, { seleccionada: false });
    }
    if (id != null) {
      mapa.setFeatureState({ source: FUENTE_ID, id }, { seleccionada: true });
    }
    seleccionadaRef.current = id;
  }

  function construirCapas(mapa: MapaLibreMap) {
    if (mapa.getSource(FUENTE_ID)) return;

    mapa.addSource(FUENTE_ID, {
      type: "geojson",
      data: coleccionDe(casillasRef.current),
      promoteId: "id",
    });

    const escala = leerEscalaMapa();
    // El trazo por defecto no puede ser --superficie: una casilla "vacía" ya pinta con el paso
    // más claro de la escala (casi blanco) y un aro igual de claro la volvería invisible sobre
    // el mapa base claro. --tinta-tenue sí contrasta contra cualquier paso de la escala.
    const colorTrazo = leerColor("--tinta-tenue", "#94918c");
    const colorSeleccion = leerColor("--tinta", "#1c1b19");
    const durUi = prefiereMenosMovimiento() ? 0 : leerDuracionMs("--dur-ui", 160);

    // Halo de selección, debajo del punto: un círculo más grande que solo se nota cuando la
    // casilla elegida lo enciende por feature-state.
    mapa.addLayer({
      id: CAPA_TRAZO,
      type: "circle",
      source: FUENTE_ID,
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "seleccionada"], false], 11, 0],
        "circle-color": colorSeleccion,
        "circle-opacity": 0.18,
        "circle-radius-transition": { duration: durUi, delay: 0 },
      },
    });

    mapa.addLayer({
      id: CAPA_PUNTO,
      type: "circle",
      source: FUENTE_ID,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 7, 18, 9],
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
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          2.5,
          1.25,
        ],
        "circle-stroke-color": [
          "case",
          ["boolean", ["feature-state", "seleccionada"], false],
          colorSeleccion,
          colorTrazo,
        ],
        "circle-color-transition": { duration: durUi, delay: 0 },
        "circle-stroke-width-transition": { duration: durUi, delay: 0 },
      },
    });

    aplicarSeleccion(mapa, seleccionadaRef.current);
  }

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    let activo = true;
    let mapaCreado: MapaLibreMap | null = null;

    (async () => {
      const { Map: ClaseMapaLibre } = await import("maplibre-gl");
      if (!activo) return;

      const mapa = new ClaseMapaLibre({
        container: contenedor,
        style: estiloCartoDe(oscura),
        center: MUNICIPIO.centro as unknown as [number, number],
        zoom: MUNICIPIO.zoomSugerido,
        maxBounds: bboxConMargen(MUNICIPIO.bbox),
        attributionControl: { compact: true },
      });

      if (!activo) {
        mapa.remove();
        return;
      }
      mapaCreado = mapa;
      mapaRef.current = mapa;

      mapa.on("style.load", () => construirCapas(mapa));

      mapa.on("mouseenter", [CAPA_PUNTO], () => {
        mapa.getCanvas().style.cursor = "pointer";
      });
      mapa.on("mouseleave", [CAPA_PUNTO], () => {
        mapa.getCanvas().style.cursor = "";
      });
      mapa.on("click", [CAPA_PUNTO], (evento) => {
        const id = evento.features?.[0]?.properties?.id as number | undefined;
        if (id == null) return;
        const caja = mapa.getContainer().getBoundingClientRect();
        onClicCasillaRef.current(id, {
          x: caja.left + evento.point.x,
          y: caja.top + evento.point.y,
        });
      });

      const alEmpezar = () => onMovimientoRef.current(true);
      const alTerminar = () => onMovimientoRef.current(false);
      mapa.on("movestart", alEmpezar);
      mapa.on("zoomstart", alEmpezar);
      mapa.on("moveend", alTerminar);
      mapa.on("zoomend", alTerminar);
    })();

    return () => {
      activo = false;
      if (mapaCreado) {
        mapaCreado.remove();
        if (mapaRef.current === mapaCreado) mapaRef.current = null;
      }
    };
    // Solo al montar, igual que mapa-lienzo.tsx: el tema y los datos se sincronizan aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const oscuraAnteriorRef = useRef(oscura);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || oscuraAnteriorRef.current === oscura) return;
    oscuraAnteriorRef.current = oscura;
    mapa.setStyle(estiloCartoDe(oscura));
  }, [oscura]);

  // Datos: se refresca la fuente completa cada vez que cambia la lista (filtro de sección o
  // avance nuevo tras guardar un representante).
  const casillasAnterioresRef = useRef(casillas);
  useEffect(() => {
    const mapa = mapaRef.current;
    const fuente = mapa?.getSource(FUENTE_ID);
    if (!mapa || !fuente || casillasAnterioresRef.current === casillas) return;
    casillasAnterioresRef.current = casillas;
    (fuente as GeoJSONSource).setData(coleccionDe(casillas));
  }, [casillas]);

  // Selección: resalta el punto elegido.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource(FUENTE_ID)) return;
    aplicarSeleccion(mapa, casillaSeleccionadaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casillaSeleccionadaId]);

  // Encuadre: lo dispara el filtro de sección de la pantalla, con la misma curva y duración de
  // cámara que el resto del sistema. Al quitar el filtro, la cámara regresa sola al municipio
  // completo en vez de quedarse encajada donde estaba.
  const encuadreAnteriorRef = useRef<typeof encuadre>(null);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const teniaEncuadre = encuadreAnteriorRef.current != null;
    encuadreAnteriorRef.current = encuadre;
    if (!encuadre && !teniaEncuadre) return;

    const menosMovimiento = prefiereMenosMovimiento();
    mapa.fitBounds(encuadre ?? bboxConMargen(MUNICIPIO.bbox), {
      padding: 64,
      duration: menosMovimiento ? 0 : leerDuracionMs("--dur-camara", 600),
      easing: crearFuncionCurva(leerCurva("--curva")),
      maxZoom: encuadre ? 17 : MUNICIPIO.zoomSugerido,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadre]);

  return (
    <div
      ref={contenedorRef}
      className="size-full"
      role="application"
      aria-label="Mapa de casillas de Oaxaca de Juárez"
    />
  );
}
