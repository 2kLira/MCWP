import { MapaPagina } from "@/components/mapa/mapa-pagina";

/**
 * El mapa ocupa todo el hueco que dejan el riel y la barra superior, sin meterse debajo de
 * ninguno de los dos: arranca donde termina la barra y, en celular, se detiene antes de la barra
 * inferior flotante, para que la leyenda y la atribución de CARTO se sigan viendo.
 */
export default function Pagina() {
  return (
    <div className="fixed inset-x-0 top-[var(--alto-barra)] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[5] overflow-hidden border-t border-borde md:bottom-0 md:left-[var(--ancho-riel)]">
      <MapaPagina />
    </div>
  );
}
