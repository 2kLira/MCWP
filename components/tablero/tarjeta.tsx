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
    <section className="tarjeta">
      <header className="flex min-h-12 items-center justify-between gap-3 px-[1.125rem] pt-3">
        <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
        {accion}
      </header>
      <div className="px-[1.125rem] pb-[1.125rem] pt-2">{children}</div>
    </section>
  );
}
