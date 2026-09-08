"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { useAlmacenLocal } from "@/lib/almacen-local";
import {
  DESTINOS,
  destinosVisibles,
  estaActivo,
} from "@/components/navegacion/destinos";
import { cn } from "@/lib/utils";

const LLAVE = "barra-lateral-colapsada";

/**
 * Barra lateral de escritorio, colapsable. La navegación cambia de forma, no de tamaño: en
 * celular esta barra no existe, ahí manda la barra inferior.
 */
export function BarraLateral() {
  const ruta = usePathname();
  const { actuante } = useActuante();
  const [guardado, guardar] = useAlmacenLocal(LLAVE, "0");
  const colapsada = guardado === "1";

  function alternar() {
    guardar(colapsada ? "0" : "1");
  }

  const destinos = destinosVisibles(DESTINOS, actuante);

  return (
    <aside
      data-colapsada={colapsada}
      className={cn(
        "transicion-panel sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-borde bg-superficie transition-[width] md:flex",
        colapsada ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-borde px-3",
          colapsada ? "justify-center" : "justify-between",
        )}
      >
        {!colapsada && (
          <span className="truncate px-1 text-sm font-semibold text-tinta">
            Estructura territorial
          </span>
        )}
        <button
          type="button"
          onClick={alternar}
          aria-label={
            colapsada ? "Extender la navegación" : "Colapsar la navegación"
          }
          className="transicion-ui grid size-11 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
        >
          {colapsada ? (
            <PanelLeftOpen className="size-5" aria-hidden />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden />
          )}
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-1">
          {destinos.map(({ href, etiqueta, icono: Icono }) => {
            const activo = estaActivo(href, ruta);
            return (
              <li key={href}>
                <Link
                  href={href}
                  data-destino
                  aria-current={activo ? "page" : undefined}
                  title={colapsada ? etiqueta : undefined}
                  className={cn(
                    "transicion-ui flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors",
                    colapsada && "justify-center px-0",
                    activo
                      ? "bg-superficie-hundida font-medium text-tinta"
                      : "text-tinta-suave hover:bg-superficie-hundida hover:text-tinta",
                  )}
                >
                  <span className="relative flex items-center">
                    {/* El destino activo es uno de los tres lugares donde vive el naranja. */}
                    {activo && (
                      <span
                        aria-hidden
                        className="absolute -left-3 h-5 w-0.5 rounded-pildora bg-naranja"
                      />
                    )}
                    <Icono className="size-5 shrink-0" aria-hidden />
                  </span>
                  {!colapsada && <span className="truncate">{etiqueta}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
