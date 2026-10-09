"use client";

import Link from "next/link";
import { CapsulaSesion } from "@/components/sesion/capsula-sesion";
import { useActuante } from "@/components/proveedor-actuante";
import {
  DESTINOS_EN_MAS,
  destinosVisibles,
} from "@/components/navegacion/destinos";

/**
 * Pantalla Más, solo para celular: recoge los destinos que no caben en la barra inferior y aloja
 * la cápsula de sesión, que en escritorio vive arriba a la derecha.
 *
 * Al brigadista no le queda ningún destino aquí: su módulo único es la agenda y los demás ya no
 * se le pintan. La pantalla sigue existiendo porque esta es la única puerta de celular a la
 * cápsula de sesión, o sea a cerrar sesión. Lo que se quita es la lista: una tarjeta de vidrio
 * vacía parece un error de carga, así que en su lugar va un renglón que dice por qué y devuelve a
 * la agenda.
 */
export default function Pagina() {
  const { actuante } = useActuante();
  const destinos = destinosVisibles(DESTINOS_EN_MAS, actuante);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl">Más</h1>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-tinta-suave">Tu sesión</h2>
        <CapsulaSesion />
      </div>

      {destinos.length === 0 ? (
        <p className="medida text-sm text-tinta-suave">
          Tu agenda es tu módulo único, así que aquí no hay otros destinos.{" "}
          <Link href="/agenda" data-destino className="text-naranja-texto underline">
            Ir a mi agenda
          </Link>
          .
        </p>
      ) : (
        <nav aria-label="Más destinos">
          <ul className="vidrio filo overflow-hidden rounded-tarjeta">
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
      )}
    </section>
  );
}
