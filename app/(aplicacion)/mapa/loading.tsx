/**
 * El mapa ocupa la pantalla completa, así que su esqueleto también: el mismo contenedor fijo que
 * mapa/page.tsx, con la barra de arriba y el selector de capas de abajo en su lugar. El esqueleto
 * genérico de lista se vería como otra pantalla.
 */
export default function Cargando() {
  return (
    <div
      role="status"
      aria-label="Cargando el mapa"
      className="fixed inset-0 z-[5] bg-superficie-hundida md:left-24"
    >
      <div aria-hidden className="esqueleto absolute inset-0 rounded-none" />
      <div aria-hidden className="absolute inset-x-0 top-0 p-3 md:p-4 md:pt-20">
        <div className="tarjeta h-12 w-64" />
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-3 flex justify-center px-3 md:bottom-9">
        <div className="tarjeta h-14 w-full max-w-xl rounded-pildora" />
      </div>
      <span className="sr-only">Cargando el mapa…</span>
    </div>
  );
}
