"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { CapsulaSesion } from "@/components/sesion/capsula-sesion";
import { useActuante } from "@/components/proveedor-actuante";
import { destinosEnMas } from "@/components/navegacion/destinos";

/**
 * Pantalla Más, solo para celular: recoge los destinos que no caben en la barra inferior y aloja
 * la cápsula de sesión, que en escritorio vive arriba a la derecha.
 *
 * Al brigadista no le queda ningún destino aquí: su módulo único es la agenda y los demás ya no
 * se le pintan. La pantalla sigue existiendo porque esta es la única puerta de celular a la
 * cápsula de sesión, o sea a cerrar sesión. Lo que se quita es la lista: una tarjeta de vidrio
 * vacía parece un error de carga, así que en su lugar va una línea que dice por qué y un renglón
 * que devuelve a la agenda.
 */
export default function Pagina() {
  const { actuante } = useActuante();
  const destinos = destinosEnMas(actuante);

  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Más" />

      {/* Sin Caja alrededor: la cápsula ya trae su propia superficie y sería tarjeta dentro de
          tarjeta. */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-tinta">Tu sesión</h2>
        <CapsulaSesion />
      </div>

      {destinos.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="medida text-sm text-tinta-suave">
            Tu agenda es tu módulo único, así que aquí no hay otros destinos.
          </p>
          <div className="tarjeta overflow-hidden">
            <Link
              href="/agenda"
              data-destino
              className="renglon-activo flex min-h-13 items-center gap-3 px-4 py-3 text-sm text-tinta"
            >
              <CalendarDays className="size-[1.125rem] shrink-0 text-tinta-suave" aria-hidden />
              <span className="min-w-0 flex-1">Ir a mi agenda</span>
              <ChevronRight className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
            </Link>
          </div>
        </div>
      ) : (
        <nav aria-label="Más destinos">
          <ul className="tarjeta divide-y divide-separador overflow-hidden">
            {destinos.map(({ href, etiqueta, icono: Icono }) => (
              <li key={href}>
                <Link
                  href={href}
                  data-destino
                  className="renglon-activo flex min-h-13 items-center gap-3 px-4 py-3 text-sm text-tinta"
                >
                  <Icono className="size-[1.125rem] shrink-0 text-tinta-suave" aria-hidden />
                  <span className="min-w-0 flex-1">{etiqueta}</span>
                  <ChevronRight className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
