import { CasillasPagina } from "@/components/casillas/casillas-pagina";

/**
 * Igual que app/mapa/page.tsx: ocupa el hueco que dejan el riel y la barra superior, sin meterse
 * debajo de ninguno de los dos, y en celular se detiene antes de la barra inferior flotante.
 */
export default function Pagina() {
  return (
    <div className="fixed inset-x-0 top-[var(--alto-barra)] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[5] overflow-hidden border-t border-borde md:bottom-0 md:left-[var(--ancho-riel)]">
      <CasillasPagina />
    </div>
  );
}
