"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MapaLibreMap, Marker } from "maplibre-gl";
import { categoriaReporte } from "@/components/reportes/categorias";
import type { ReporteTerritorio } from "@/lib/datos/reportes-territorio";
import { cn } from "@/lib/utils";

/**
 * Los reportes del territorio sobre el mapa, uno por marcador HTML de MapLibre.
 *
 * Marcadores HTML y no una capa de símbolos por tres razones: el icono es el mismo componente de
 * lucide que se ve en el formulario (una capa de símbolos exigiría rasterizar trece imágenes y
 * volver a registrarlas en cada cambio de tema, porque setStyle las borra); cada marcador es un
 * botón real con foco de teclado y nombre accesible; y el área de toque es de 44 píxeles sin
 * pelearse con el radio del círculo. Para cientos de reportes pendientes alcanza de sobra.
 *
 * El toque se atiende con un escucha nativo en el elemento del marcador y se corta ahí. El
 * elemento cuelga del contenedor del lienzo, así que si el clic siguiera subiendo, MapLibre lo
 * tomaría también como clic sobre la sección de abajo y abriría las dos fichas a la vez. Por eso
 * el botón que se pinta adentro es solo presentación: Enter o espacio sobre él generan un clic
 * nativo que sube a ese mismo escucha.
 */

type Entrada = { marcador: Marker; elemento: HTMLDivElement };

export function MarcadoresReportes({
  mapa,
  reportes,
  visible,
  seleccionadoId,
  onClic,
}: {
  mapa: MapaLibreMap | null;
  reportes: readonly ReporteTerritorio[];
  visible: boolean;
  seleccionadoId: string | null;
  /** `origen` es el centro del pin en coordenadas de pantalla: de ahí crece la ficha. */
  onClic: (id: string, origen: { x: number; y: number }) => void;
}) {
  const entradasRef = useRef(new Map<string, Entrada>());
  // Qué elementos existen ahora mismo, para pintarles adentro con un portal. Es estado y no ref
  // porque crear o quitar un marcador tiene que volver a renderizar los portales.
  const [elementos, setElementos] = useState<{ id: string; elemento: HTMLDivElement }[]>([]);
  const onClicRef = useRef(onClic);
  useEffect(() => {
    onClicRef.current = onClic;
  });

  useEffect(() => {
    if (!mapa) return;
    let vigente = true;
    const entradas = entradasRef.current;

    void import("maplibre-gl").then(({ Marker: ClaseMarcador }) => {
      if (!vigente) return;
      const vivos = new Set(reportes.map((r) => r.id));

      for (const [id, entrada] of entradas) {
        if (!vivos.has(id)) {
          entrada.marcador.remove();
          entradas.delete(id);
        }
      }

      for (const reporte of reportes) {
        const existente = entradas.get(reporte.id);
        if (existente) {
          existente.marcador.setLngLat([reporte.lng, reporte.lat]);
          continue;
        }
        const elemento = document.createElement("div");
        elemento.addEventListener("click", (evento) => {
          evento.stopPropagation();
          const caja = elemento.getBoundingClientRect();
          onClicRef.current(reporte.id, {
            x: caja.left + caja.width / 2,
            y: caja.top + caja.height / 2,
          });
        });
        const marcador = new ClaseMarcador({ element: elemento, anchor: "center" })
          .setLngLat([reporte.lng, reporte.lat])
          .addTo(mapa);
        entradas.set(reporte.id, { marcador, elemento });
      }

      setElementos([...entradas].map(([id, { elemento }]) => ({ id, elemento })));
    });

    return () => {
      vigente = false;
    };
  }, [mapa, reportes]);

  // Al desmontar, o si el mapa se destruye, no quedan marcadores colgados.
  useEffect(() => {
    const entradas = entradasRef.current;
    return () => {
      for (const { marcador } of entradas.values()) marcador.remove();
      entradas.clear();
    };
  }, [mapa]);

  useEffect(() => {
    for (const { elemento } of entradasRef.current.values()) {
      elemento.style.display = visible ? "" : "none";
    }
  }, [visible, elementos]);

  const porId = new Map(reportes.map((r) => [r.id, r]));

  return (
    <>
      {elementos.map(({ id, elemento }) => {
        const reporte = porId.get(id);
        if (!reporte) return null;
        const { etiqueta, Icono } = categoriaReporte(reporte.categoria);
        const elegido = id === seleccionadoId;
        return createPortal(
          <button
            type="button"
            aria-label={`Reporte: ${etiqueta}`}
            aria-pressed={elegido}
            className="grid size-11 cursor-pointer place-items-center rounded-full"
          >
            <span
              className={cn(
                "transicion-ui grid size-8 place-items-center rounded-full border-2 border-fondo bg-tinta text-fondo shadow-md transition-transform",
                elegido && "scale-125 ring-2 ring-naranja ring-offset-1 ring-offset-fondo",
              )}
            >
              <Icono className="size-4" aria-hidden />
            </span>
          </button>,
          elemento,
          id,
        );
      })}
    </>
  );
}
