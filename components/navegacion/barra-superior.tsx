"use client";

import { usePathname } from "next/navigation";
import { Buscador } from "@/components/buscador";
import { ConmutadorRol } from "@/components/conmutador-rol";
import { cn } from "@/lib/utils";

/**
 * Barra superior de escritorio: buscador y conmutador de rol en cápsula, alineados a la derecha.
 *
 * En el tablero no ocupa alto en el flujo: es una capa `h-0` con `overflow-visible`, así que su
 * contenido desborda hacia abajo sin empujar la página y el título grande de la pantalla —que
 * reserva hueco a la derecha con `md:pr-[34rem]`— queda en el mismo renglón que las cápsulas.
 *
 * En las demás pantallas sí ocupa su alto. Esas tienen encabezado de ancho completo y una capa de
 * alto cero se les montaba encima: el título de Personas alcanzadas y su botón de exportar
 * quedaban debajo del buscador, tapados.
 */
export function BarraSuperior() {
  const ruta = usePathname();
  const flotante = ruta === "/";

  return (
    <div
      className={cn(
        "pointer-events-none sticky top-0 z-30 hidden px-6 pt-5 md:block",
        flotante ? "h-0 overflow-visible" : "pb-3",
      )}
    >
      <div className="mx-auto flex max-w-tope items-center justify-end gap-3">
        <Buscador className="pointer-events-auto w-full max-w-[35rem]" comoCapsula />
        <ConmutadorRol className="pointer-events-auto shrink-0" comoCapsula />
      </div>
    </div>
  );
}
