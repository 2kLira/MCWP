"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActuante } from "@/components/proveedor-actuante";
import {
  DESTINOS_CELULAR,
  destinosVisibles,
  estaActivo,
} from "@/components/navegacion/destinos";
import { cn } from "@/lib/utils";

/**
 * Celular: una píldora de vidrio que flota sobre la lámina, separada del borde. Cinco destinos,
 * con Registrar al centro en relleno naranja, la única acción naranja de la barra. El texto
 * sobre el naranja es --tinta, nunca blanco.
 *
 * No siempre son cinco: al brigadista, cuyo módulo único es la agenda, le quedan tres. Las
 * columnas se cuentan a partir de los destinos que de verdad se pintan, porque una rejilla fija
 * de cinco con tres hijos los apiña a la izquierda y deja media píldora vacía.
 *
 * Las clases de columna son literales, no interpoladas: Tailwind lee el código fuente para
 * decidir qué CSS genera, y un `grid-cols-${n}` armado en tiempo de ejecución no existiría en la
 * hoja de estilos.
 */
const COLUMNAS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function BarraInferior() {
  const ruta = usePathname();
  const { actuante } = useActuante();
  const destinos = destinosVisibles(DESTINOS_CELULAR, actuante);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden"
    >
      <ul
        className={cn(
          "dock grid items-center rounded-hoja p-1.5",
          COLUMNAS[destinos.length] ?? "grid-cols-5",
        )}
      >
        {destinos.map(({ href, etiqueta, icono: Icono }) => {
          const activo = estaActivo(href, ruta);
          const esRegistrar = href === "/registrar";

          if (esRegistrar) {
            return (
              <li key={href} className="grid place-items-center">
                <Link
                  href={href}
                  data-destino
                  aria-current={activo ? "page" : undefined}
                  className="transicion-ui flex h-12 w-full flex-col items-center justify-center gap-1 rounded-control bg-naranja text-sobre-naranja transition-transform active:scale-[0.97]"
                >
                  <Icono className="size-5" aria-hidden />
                  <span className="text-[0.625rem] font-medium leading-none">{etiqueta}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={href}>
              <Link
                href={href}
                data-destino
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "transicion-ui relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-control px-1 transition-colors",
                  activo ? "text-tinta" : "text-tinta-suave",
                )}
              >
                {activo && (
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-control bg-[oklch(0.78_0.16_55_/_0.16)]"
                  />
                )}
                <Icono className="size-5" aria-hidden />
                <span className="text-[0.625rem] leading-none">{etiqueta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
