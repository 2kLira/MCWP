"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Mientras carga el GeoJSON de secciones: un esqueleto que se disuelve en el mapa, nunca un
 * indicador giratorio. `listo` dispara el desvanecimiento; el componente se desmonta solo cuando
 * la transición de opacidad realmente termina.
 */
export function EsqueletoMapa({ listo }: { listo: boolean }) {
  const [desmontado, setDesmontado] = useState(false);
  const nodoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listo) return;
    const nodo = nodoRef.current;
    if (!nodo) {
      setDesmontado(true);
      return;
    }
    function alTerminarTransicion(evento: TransitionEvent) {
      if (evento.propertyName === "opacity") setDesmontado(true);
    }
    nodo.addEventListener("transitionend", alTerminarTransicion);
    // Salvavidas por si el navegador no dispara transitionend (reduced motion, pestaña oculta).
    const respaldo = window.setTimeout(() => setDesmontado(true), 500);
    return () => {
      nodo.removeEventListener("transitionend", alTerminarTransicion);
      window.clearTimeout(respaldo);
    };
  }, [listo]);

  if (desmontado) return null;

  return (
    <div
      ref={nodoRef}
      aria-hidden
      className={cn(
        "transicion-panel pointer-events-none absolute inset-0 z-20 bg-fondo",
        listo ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-tarjeta bg-superficie-hundida"
              style={{ animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
