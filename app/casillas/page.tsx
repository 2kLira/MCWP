import { CasillasPagina } from "@/components/casillas/casillas-pagina";

/**
 * Igual que app/mapa/page.tsx: pantalla completa, por debajo del riel de navegación y de la
 * barra superior, que en escritorio arranca a la derecha del riel para no quedar tapado por él.
 */
export default function Pagina() {
  return (
    <div className="fixed inset-0 z-[5] md:left-24">
      <CasillasPagina cromoDesplazado />
    </div>
  );
}
