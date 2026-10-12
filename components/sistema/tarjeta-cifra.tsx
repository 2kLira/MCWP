import Link from "next/link";
import { ArrowUp, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Una cifra del tablero: ficha de icono naranja, rótulo, el número y, si aplica, una línea de
 * apoyo junto al número y una nota naranja debajo (lo que se movió esta semana).
 *
 * Con `href` toda la tarjeta es el enlace y lleva una flecha suelta, sin círculo. Sin `href` es
 * un dato y no pinta flecha: una flecha que no lleva a ningún lado miente.
 */
export function TarjetaCifra({
  icono: Icono,
  etiqueta,
  valor,
  apoyo,
  nota,
  pie,
  href,
  cargando = false,
  className,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: number | string | null | undefined;
  /** Junto al número, en gris: "en 169 secciones". */
  apoyo?: React.ReactNode;
  /** Debajo, en naranja y con flecha hacia arriba: "146 nuevas esta semana". */
  nota?: React.ReactNode;
  /** Debajo, en gris: "en lista nominal". */
  pie?: React.ReactNode;
  href?: string;
  cargando?: boolean;
  className?: string;
}) {
  const numero =
    cargando || valor == null ? "—" : typeof valor === "number" ? valor.toLocaleString("es-MX") : valor;

  const contenido = (
    <>
      <span className="ficha-icono row-span-2 self-start">
        <Icono className="size-[1.125rem]" aria-hidden />
      </span>
      <span className="col-start-2 col-end-4 text-[0.78125rem] font-medium leading-snug text-tinta-suave">
        {etiqueta}
      </span>
      <span className="col-start-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="cifras text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-tinta">
          {numero}
        </span>
        {apoyo && !cargando && (
          <span className="cifras whitespace-nowrap text-[0.78125rem] text-tinta-suave">{apoyo}</span>
        )}
      </span>
      {href && (
        <ChevronRight
          className="col-start-3 row-start-2 size-4 self-end text-naranja-texto"
          strokeWidth={2}
          aria-hidden
        />
      )}
      {nota && !cargando && (
        <span className="cifras col-start-2 col-end-4 inline-flex items-center gap-1 text-[0.78125rem] font-semibold text-naranja-texto">
          <ArrowUp className="size-[0.8125rem]" strokeWidth={2.25} aria-hidden />
          {nota}
        </span>
      )}
      {pie && <span className="col-start-2 col-end-4 text-[0.78125rem] text-tinta-suave">{pie}</span>}
    </>
  );

  const clases = cn(
    "tarjeta grid grid-cols-[auto_minmax(0,1fr)_auto] content-start gap-x-3.5 gap-y-1 px-4 pb-3.5 pt-4 text-left",
    className,
  );

  if (href) {
    return (
      <Link
        href={href as never}
        className={cn(clases, "transicion-ui transition-transform active:scale-[0.985]")}
      >
        {contenido}
      </Link>
    );
  }
  return <div className={clases}>{contenido}</div>;
}
