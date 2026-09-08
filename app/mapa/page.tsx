import { MapaPagina } from "@/components/mapa/mapa-pagina";

/**
 * El mapa ocupa la pantalla completa, por debajo del riel de navegación y de la barra superior.
 * En escritorio arranca a la derecha del riel para no quedar tapado por él.
 */
export default function Pagina() {
  return (
    <div className="fixed inset-0 z-[5] md:left-24">
      <MapaPagina cromoDesplazado />
    </div>
  );
}
