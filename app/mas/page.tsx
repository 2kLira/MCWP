"use client";

import Link from "next/link";
import { ConmutadorRol } from "@/components/conmutador-rol";
import { useActuante } from "@/components/proveedor-actuante";
import {
  DESTINOS_EN_MAS,
  destinosVisibles,
} from "@/components/navegacion/destinos";

/**
 * Pantalla Más, solo para celular: recoge los destinos que no caben en la barra inferior y aloja
 * el conmutador de rol, que en escritorio vive arriba a la derecha.
 */
export default function Pagina() {
  const { actuante } = useActuante();
  const destinos = destinosVisibles(DESTINOS_EN_MAS, actuante);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl">Más</h1>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-tinta-suave">
          Rol con el que estás entrando
        </h2>
        <ConmutadorRol />
      </div>

      <nav aria-label="Más destinos">
        <ul className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
          {destinos.map(({ href, etiqueta, icono: Icono }, i) => (
            <li key={href}>
              <Link
                href={href}
                data-destino
                className={`transicion-ui flex items-center gap-3 px-4 py-3 text-sm text-tinta transition-colors hover:bg-superficie-hundida ${
                  i > 0 ? "border-t border-borde" : ""
                }`}
              >
                <Icono className="size-5 shrink-0 text-tinta-suave" aria-hidden />
                {etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
