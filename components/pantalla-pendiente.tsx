/**
 * Andamio de una pantalla que todavía no se construye. Existe para que la navegación se pueda
 * recorrer completa desde ahora; se reemplaza fase por fase.
 */
export function PantallaPendiente({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl">{titulo}</h1>
      <p className="medida text-sm text-tinta-suave">{descripcion}</p>
      <div className="hueco-punteado mt-2 grid min-h-48 place-items-center rounded-tarjeta p-6 text-sm">
        Pantalla pendiente de construir.
      </div>
    </section>
  );
}
