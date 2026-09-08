"use client";

import { cn } from "@/lib/utils";
import { VISTAS_MAPA, type VistaMapa } from "./datos-mapa";

/**
 * Las cinco vistas del mapa. Flota sobre el mapa, así que va en vidrio. El paso activo se marca
 * en neutros (--tinta sobre --fondo invertidos): el naranja no vive aquí, vive en la escala del
 * mapa mismo.
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
      role="tablist"
      aria-label="Vista del mapa"
      className={cn(
        "vidrio elevacion-flotante transicion-ui flex max-w-full gap-1 overflow-x-auto rounded-tarjeta p-1.5",
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
            role="tab"
            aria-selected={activa}
            onClick={() => onCambiar(id)}
            className={cn(
              "transicion-ui flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-control px-3.5 text-sm font-medium transition-colors",
              activa
                ? "bg-tinta text-fondo"
                : "text-tinta-suave hover:bg-superficie-hundida/60 hover:text-tinta",
            )}
          >
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}
