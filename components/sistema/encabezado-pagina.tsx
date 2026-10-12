import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * El encabezado de toda pantalla: título grande, una línea de apoyo y, en las fichas, el regreso.
 *
 * En escritorio reserva hueco a la derecha porque ahí flotan el buscador y la cuenta
 * (components/navegacion/barra-superior.tsx, una capa sin alto). Por eso las acciones de la
 * pantalla —filtros, "Nueva actividad", exportar— no van aquí: van en el renglón de abajo.
 */
export function EncabezadoPagina({
  titulo,
  apoyo,
  volver,
  className,
}: {
  titulo: React.ReactNode;
  apoyo?: React.ReactNode;
  volver?: { href: string; etiqueta: string };
  className?: string;
}) {
  return (
    <header className={cn("md:min-h-[3.75rem] md:pr-[20rem] lg:pr-[37rem]", className)}>
      {volver && (
        <Link
          href={volver.href as never}
          className="transicion-ui mb-1 inline-flex min-h-7 items-center gap-1.5 text-sm text-tinta-suave transition-colors hover:text-tinta"
        >
          <ArrowLeft className="size-[0.9375rem]" aria-hidden />
          {volver.etiqueta}
        </Link>
      )}
      <h1 className="titulo-pagina text-tinta">{titulo}</h1>
      {apoyo && <p className="mt-1.5 text-sm text-tinta-suave">{apoyo}</p>}
    </header>
  );
}
