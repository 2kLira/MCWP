import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de vidrio con encabezado: icono neutro, título y, a la derecha, una acción opcional.
 * Es la pieza con la que se arma una ficha o una columna de contexto.
 */
export function Caja({
  icono: Icono,
  titulo,
  accion,
  children,
  className,
}: {
  icono?: LucideIcon;
  titulo: React.ReactNode;
  accion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("tarjeta min-w-0 p-[1.125rem]", className)}>
      <header className="mb-3 flex min-h-8 flex-wrap items-center gap-2.5">
        {Icono && <Icono className="size-[1.125rem] shrink-0 text-tinta-suave" aria-hidden />}
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-tinta">{titulo}</h2>
        {accion}
      </header>
      {children}
    </section>
  );
}
