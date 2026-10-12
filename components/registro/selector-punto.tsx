"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapaGL } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MUNICIPIO } from "@/lib/demarcaciones";
import { seccionPorPunto } from "@/lib/territorio";

/**
 * Camino alterno cuando no hay GPS: el capturista mueve el mapa y la cruz del centro marca el
 * punto. Se resuelve contra los polígonos cacheados, sin red y sin espera.
 */
export function SelectorPunto({
  inicial,
  alConfirmar,
  alCancelar,
}: {
  inicial?: [number, number] | null;
  alConfirmar: (punto: [number, number], clave: string | null) => void;
  alCancelar: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const [centro, setCentro] = useState<[number, number]>(
    inicial ?? [MUNICIPIO.centro[0], MUNICIPIO.centro[1]],
  );

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const oscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const m = new MapaGL({
      container: contenedor.current,
      style: `https://basemaps.cartocdn.com/gl/${oscuro ? "dark-matter" : "positron"}-gl-style/style.json`,
      center: inicial ?? [MUNICIPIO.centro[0], MUNICIPIO.centro[1]],
      zoom: inicial ? 16 : MUNICIPIO.zoomSugerido + 1,
      attributionControl: false,
    });
    m.on("move", () => {
      const c = m.getCenter();
      setCentro([c.lng, c.lat]);
    });
    mapa.current = m;

    return () => {
      m.remove();
      mapa.current = null;
    };
  }, [inicial]);

  const clave = seccionPorPunto(centro[0], centro[1]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fondo">
      <div className="relative flex-1">
        <div ref={contenedor} className="absolute inset-0" />
        {/* La cruz del centro es el punto. No hay que atinarle a un alfiler con el dedo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="size-6 rounded-full border-2 border-tinta bg-transparent" />
          <div className="mx-auto -mt-4 h-4 w-0.5 bg-tinta" />
        </div>
      </div>

      <div className="border-t border-separador bg-superficie p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[47.5rem]">
          <p className="text-sm text-tinta-suave">
            {clave ? (
              <>
                Punto en la sección <span className="cifras font-medium text-tinta">{clave}</span>
              </>
            ) : (
              "El punto está fuera de las secciones del municipio."
            )}
          </p>
          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={alCancelar}
              className="boton min-h-12 flex-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!clave}
              onClick={() => alConfirmar(centro, clave)}
              className="boton-primario min-h-12 flex-1"
            >
              Usar este punto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
