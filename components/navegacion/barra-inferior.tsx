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
 * Barra inferior fija de celular, cinco destinos. Registrar va al centro, en relleno naranja, y es
 * la única acción naranja de esta barra. El texto sobre el naranja es --tinta, nunca blanco.
 */
export function BarraInferior() {
  const ruta = usePathname();
  const { actuante } = useActuante();
  const destinos = destinosVisibles(DESTINOS_CELULAR, actuante);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-tope grid-cols-5">
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
                  className="transicion-ui my-2 flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-tarjeta bg-naranja text-tinta transition-transform active:scale-[0.98]"
                >
                  <Icono className="size-5" aria-hidden />
                  <span className="text-[0.6875rem] font-medium leading-none">
                    {etiqueta}
                  </span>
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
                  "transicion-ui flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  activo ? "text-tinta" : "text-tinta-suave",
                )}
              >
                <Icono className="size-5" aria-hidden />
                <span className="text-[0.6875rem] leading-none">{etiqueta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
