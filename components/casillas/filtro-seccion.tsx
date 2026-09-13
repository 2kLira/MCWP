"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filtro por clave de sección. La pregunta real detrás de esta pantalla es "cómo voy en mi
 * sección", así que el filtro va suelto sobre el mapa, en vidrio, y recorta a la vez el mapa,
 * las dos barras de avance y el encuadre de la cámara.
 */
export function FiltroSeccion({
  valor,
  onCambiar,
  enMovimiento,
  className,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
  enMovimiento: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "vidrio elevacion-flotante transicion-ui flex min-h-11 items-center gap-2 rounded-tarjeta pl-3.5 pr-1.5",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      <label htmlFor="filtro-seccion-casillas" className="shrink-0 text-sm text-tinta-suave">
        Sección
      </label>
      <input
        id="filtro-seccion-casillas"
        value={valor}
        onChange={(e) => onCambiar(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="0001"
        className="cifras w-16 bg-transparent text-sm text-tinta placeholder:text-tinta-tenue focus:outline-none"
      />
      {valor && (
        <button
          type="button"
          onClick={() => onCambiar("")}
          aria-label="Quitar filtro de sección"
          className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave hover:bg-superficie-hundida hover:text-tinta"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
