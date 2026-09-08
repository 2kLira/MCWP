export function Tarjeta({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-tarjeta border border-borde bg-superficie elevacion-apoyo">
      <header className="flex items-center justify-between gap-3 border-b border-borde px-4 py-3">
        <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
        {accion}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
