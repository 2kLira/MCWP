"use client";

import { MapaPagina } from "@/components/mapa/mapa-pagina";
import { PortonAgenda } from "@/components/porton-agenda";
import { useActuante } from "@/components/proveedor-actuante";
import { puedeVerListadosGenerales } from "@/lib/puertas-ui";

/**
 * El mapa ocupa la pantalla completa, por debajo del riel de navegación y de la barra superior.
 * En escritorio arranca a la derecha del riel para no quedar tapado por él.
 *
 * Es cliente porque el rol vive en el cliente, y aquí hace falta para el portón del brigadista:
 * sus capas se alimentan de vistas agregadas que RLS le deja en cero, así que lo que vería es un
 * mapa gris a pantalla completa sin un solo polígono pintado y sin nada que explique por qué.
 * El portón va en el flujo normal de la página, no dentro del contenedor fijo, para que no se
 * monte encima del riel ni se coma el ancho.
 */
export default function Pagina() {
  const { actuante } = useActuante();

  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Mapa" />;
  }

  return (
    <div className="fixed inset-0 z-[5] md:left-24">
      <MapaPagina cromoDesplazado />
    </div>
  );
}
