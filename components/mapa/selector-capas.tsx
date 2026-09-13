"use client";

import { cn } from "@/lib/utils";
import { VISTAS_MAPA, type VistaMapa } from "./datos-mapa";

/**
 * Las ocho vistas del mapa, en una cápsula de vidrio flotante. No es un tablist: no hay paneles
 * asociados ni navegación con flechas, así que se marca como un grupo de botones de alternancia
 * (`role="group"` + `aria-pressed` por botón), que es lo que de verdad son. El paso activo se lee
 * como píldora blanca con su propio peso y un puntito naranja; el naranja no vive en el mapa de
 * colores del texto, vive en ese puntito y en la escala del mapa mismo.
 */
export function SelectorCapas({
  vista,
  onCambiar,
  enMovimiento,
  className,
}: {
  vista: VistaMapa;
  onCambiar: (vista: VistaMapa) => void;
  enMovimiento: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Vista del mapa"
      className={cn(
        "vidrio-flotante filo transicion-ui flex max-w-full gap-1 overflow-x-auto rounded-pildora p-1.5",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      {VISTAS_MAPA.map(({ id, etiqueta }) => {
        const activa = id === vista;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={activa}
            onClick={() => onCambiar(id)}
            className={cn(
              "transicion-ui flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pildora px-3.5 text-sm",
              activa
                ? "elevacion-apoyo bg-superficie font-semibold text-tinta"
                : "font-medium text-tinta-suave hover:text-tinta",
            )}
          >
            {etiqueta}
            {activa && (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-naranja" />
            )}
          </button>
        );
      })}
    </div>
  );
}
