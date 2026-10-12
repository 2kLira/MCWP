"use client";

import { Buscador } from "@/components/buscador";
import { useActuante } from "@/components/proveedor-actuante";
import { CapsulaSesion } from "@/components/sesion/capsula-sesion";
import { puedeVerListadosGenerales } from "@/lib/puertas-ui";

/**
 * Barra superior de escritorio: buscador y cuenta, alineados a la derecha.
 *
 * No ocupa alto en el flujo en ninguna pantalla: es una capa `h-0` con `overflow-visible`, así
 * que su contenido desborda hacia abajo sin empujar la página y queda en el mismo renglón que el
 * título. Para que no se monten, cada pantalla arma su encabezado con
 * `components/sistema/encabezado-pagina.tsx`, que reserva ese hueco a la derecha, y pone sus
 * acciones en el renglón de abajo.
 *
 * Ya no es pegajosa: se va con el encabezado al desplazar, en vez de flotar sobre las tablas.
 * Lleva el mismo ancho tope y los mismos márgenes que <main> para que su borde derecho coincida
 * con el del contenido.
 */
export function BarraSuperior() {
  const { actuante } = useActuante();

  // El buscador general no se le pinta a quien solo tiene la agenda. Las tres cosas que resuelve
  // —persona, clave de sección, nombre de colonia o demarcación— desembocan en /personas/[id],
  // /mapa y /territorio, que al brigadista ya no se le muestran: sería un cajón de texto cuyo
  // único destino posible es un portón. La cuenta sí se queda, es como sale.
  const conBuscador = puedeVerListadosGenerales(actuante);

  return (
    <div className="pointer-events-none relative z-30 hidden h-0 md:block">
      <div className="mx-auto flex w-full max-w-tope items-center justify-end gap-3 pl-[6.5rem] pr-7 pt-6">
        {conBuscador && (
          <Buscador className="pointer-events-auto w-56 lg:w-[21rem]" comoCapsula />
        )}
        <CapsulaSesion className="pointer-events-auto shrink-0" comoCapsula />
      </div>
    </div>
  );
}
