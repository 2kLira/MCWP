"use client";

import { cn } from "@/lib/utils";
import { VISTAS_MAPA, type VistaMapa } from "./datos-mapa";

/**
 * Las siete vistas del mapa, en una barra compacta que vive en el borde superior del panel y no
 * encima del territorio. No es un tablist: no hay paneles hermanos ni navegación con flechas, son
 * siete botones que repintan el mismo mapa, así que van como grupo de botones con aria-pressed.
 *
 * La selección se lee con fondo naranja suave, texto naranja oscuro y peso 600. El color no es lo
 * único que la comunica: aria-pressed lo dice, y el peso tipográfico lo marca sin color.
 */
export function SelectorCapas({
  vista,
  onCambiar,
  className,
}: {
  vista: VistaMapa;
  onCambiar: (vista: VistaMapa) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Vista del mapa"
      className={cn(
        "-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 py-0.5",
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
              "transicion-ui flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-control border px-3 text-sm transition-colors",
              activa
                ? "border-transparent bg-naranja-suave font-semibold text-naranja-texto"
                : "border-transparent font-medium text-tinta-suave hover:bg-superficie-hundida hover:text-tinta",
            )}
          >
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}
