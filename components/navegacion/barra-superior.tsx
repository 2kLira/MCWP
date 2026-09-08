"use client";

import { Buscador } from "@/components/buscador";
import { ConmutadorRol } from "@/components/conmutador-rol";

/**
 * Barra superior de escritorio: dos piezas de vidrio que flotan sobre la lámina, separadas entre
 * sí. No es una franja pegada al borde con un fondo sólido.
 */
export function BarraSuperior() {
  return (
    <div className="pointer-events-none sticky top-0 z-30 hidden px-6 pt-4 md:block">
      <div className="mx-auto flex max-w-tope items-center gap-3">
        <Buscador className="pointer-events-auto w-full max-w-md" conVidrio />
        <ConmutadorRol className="pointer-events-auto ml-auto w-72" conVidrio />
      </div>
    </div>
  );
}
