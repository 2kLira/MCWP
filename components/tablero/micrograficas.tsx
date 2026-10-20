"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Micrográficas de "Cómo vamos": tarjetas de vidrio con una cifra y una gráfica chica debajo.
 *
 * Reglas que vienen del sistema de diseño y de la guía de dataviz:
 *  · Una sola serie naranja por gráfica; todo lo demás en `--grafica-contexto`.
 *  · El naranja de relleno no alcanza 3 a 1 contra la tarjeta clara, así que la marca naranja
 *    siempre lleva su número escrito: el color nunca es lo único que dice algo.
 *  · Texto en tintas, nunca en el color de la serie.
 *  · Marcas delgadas, 2 px de separación, extremos redondeados apoyados en la base.
 *  · Cada gráfica trae su tabla para lector de pantalla.
 *  · Se trazan una vez al montar, con escalonado corto; con movimiento reducido, la regla global
 *    de globals.css las deja quietas.
 *
 * Son HTML y no SVG a propósito: las columnas se acomodan solas al ancho sin deformar los
 * redondeos, y no hace falta otra librería para algo de este tamaño.
 */

function useMontado(): boolean {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return montado;
}

const formato = (n: number) => n.toLocaleString("es-MX");

/* ---------------------------------------------------------------------------
 * Tarjeta
 * ------------------------------------------------------------------------- */

export function TarjetaIndicador({
  icono: Icono,
  titulo,
  cifra,
  unidad,
  apoyo,
  href,
  cargando,
  className,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  /** La cifra que manda en la tarjeta. */
  cifra: string | number;
  /** Junto a la cifra, en gris: "personas", "de 27". */
  unidad?: React.ReactNode;
  /** Una línea debajo de la cifra: la comparación o el dato que la explica. */
  apoyo?: React.ReactNode;
  href?: string;
  cargando: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("tarjeta flex min-w-0 flex-col p-[1.125rem]", className)}>
      <header className="flex min-h-8 items-center gap-2.5">
        <Icono className="size-[1.125rem] shrink-0 text-tinta-suave" aria-hidden />
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-tinta">{titulo}</h3>
        {href && (
          <Link
            href={href as never}
            className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-control px-2 text-[0.78125rem] font-semibold text-naranja-texto underline-offset-4 hover:underline"
          >
            Ver
            <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
          </Link>
        )}
      </header>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {cargando ? (
          <span className="esqueleto h-7 w-16 rounded" />
        ) : (
          <span className="cifras text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-tinta">
            {typeof cifra === "number" ? formato(cifra) : cifra}
          </span>
        )}
        {unidad && !cargando && (
          <span className="cifras text-[0.8125rem] text-tinta-suave">{unidad}</span>
        )}
      </div>
      {apoyo && !cargando && (
        <p className="cifras mt-1 text-[0.78125rem] text-tinta-suave">{apoyo}</p>
      )}

      <div className="mt-4 flex flex-1 flex-col justify-end">
        {cargando ? <div className="esqueleto h-20 rounded-control" /> : children}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Columnas: una por día o por tramo
 * ------------------------------------------------------------------------- */

export type Columna = {
  clave: string;
  /** Lo que se lee abajo de la columna y en el recuadro flotante. */
  etiqueta: string;
  valor: number;
  /** La única columna naranja. Lleva su valor escrito encima. */
  resaltar?: boolean;
};

export function Columnas({
  datos,
  descripcion,
  unidad,
  etiquetas = "todas",
  valores = false,
  alto = "h-20",
}: {
  datos: Columna[];
  /** Resumen para lector de pantalla: "Personas nuevas por día, últimos 14 días". */
  descripcion: string;
  /** Para el recuadro flotante: "personas". */
  unidad: string;
  /** Qué etiquetas se escriben abajo: todas, o solo la primera y la última. */
  etiquetas?: "todas" | "extremos";
  /** Escribe el valor encima de cada columna, no solo el de la resaltada. */
  valores?: boolean;
  alto?: string;
}) {
  const montado = useMontado();
  const [activa, setActiva] = useState<number | null>(null);
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  const n = datos.length;
  const flotante = activa !== null ? datos[activa] : null;

  return (
    <figure className="relative">
      <div
        role="img"
        aria-label={descripcion}
        className={cn("relative flex items-end gap-[2px]", alto)}
        onMouseLeave={() => setActiva(null)}
      >
        {datos.map((d, i) => {
          const proporcion = d.valor / maximo;
          const escribir = valores || d.resaltar;
          return (
            <div
              key={d.clave}
              // El área de toque es la franja completa, no solo la barra: una barra de 2 px no
              // se puede señalar con el dedo.
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={() => setActiva(i)}
              onTouchStart={() => setActiva(i)}
            >
              {escribir && (
                <span
                  aria-hidden
                  className={cn(
                    "cifras mb-1 text-center text-[0.6875rem] leading-none",
                    d.resaltar ? "font-semibold text-tinta" : "text-tinta-suave",
                  )}
                >
                  {formato(d.valor)}
                </span>
              )}
              <div
                className={cn(
                  "w-full origin-bottom rounded-t-[4px] transition-[transform,opacity] duration-700 ease-curva",
                  d.resaltar ? "bg-naranja" : "bg-grafica-contexto",
                  activa !== null && activa !== i && "opacity-60",
                )}
                style={{
                  // La base siempre se ve: un día en cero es un dato, no un hueco.
                  height: `max(2px, ${proporcion * (escribir ? 82 : 100)}%)`,
                  transform: `scaleY(${montado ? 1 : 0})`,
                  transitionDelay: `${Math.min(i * 30, 420)}ms`,
                }}
              />
            </div>
          );
        })}

        {flotante && activa !== null && (
          <div
            aria-hidden
            className="vidrio pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs"
            style={{
              left: `${((activa + 0.5) / n) * 100}%`,
              transform:
                activa === 0 ? "translateX(-12px)" : activa === n - 1 ? "translateX(calc(-100% + 12px))" : "translateX(-50%)",
            }}
          >
            <span className="text-tinta-suave">{flotante.etiqueta}</span>{" "}
            <span className="cifras font-semibold text-tinta">{formato(flotante.valor)}</span>{" "}
            <span className="text-tinta-suave">{unidad}</span>
          </div>
        )}
      </div>

      <div aria-hidden className="mt-1.5 flex gap-[2px] border-t border-separador pt-1.5">
        {etiquetas === "todas" ? (
          datos.map((d) => (
            <span
              key={d.clave}
              className="cifras min-w-0 flex-1 truncate text-center text-[0.6875rem] text-tinta-suave"
            >
              {d.etiqueta}
            </span>
          ))
        ) : (
          <>
            <span className="cifras flex-1 text-[0.6875rem] text-tinta-suave">{datos[0]?.etiqueta}</span>
            <span className="cifras flex-1 text-right text-[0.6875rem] text-tinta-suave">
              {datos[n - 1]?.etiqueta}
            </span>
          </>
        )}
      </div>

      <TablaOculta
        titulo={descripcion}
        filas={datos.map((d) => [d.etiqueta, `${formato(d.valor)} ${unidad}`])}
      />
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * Barras de proporción: renglones con su número escrito
 * ------------------------------------------------------------------------- */

export type BarraProporcion = {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Lo que se escribe a la derecha. Si falta, el valor. */
  texto?: string;
  /** Contra qué se mide esta barra, si no es contra el máximo común. */
  total?: number;
  resaltar?: boolean;
};

export function BarrasProporcion({
  filas,
  maximo,
  descripcion,
}: {
  filas: BarraProporcion[];
  /** Contra qué se mide cada barra. Si falta, contra la más larga. */
  maximo?: number;
  descripcion: string;
}) {
  const montado = useMontado();
  const tope = Math.max(1, maximo ?? Math.max(0, ...filas.map((f) => f.valor)));

  return (
    <figure>
      <ul aria-label={descripcion} className="flex flex-col gap-2.5">
        {filas.map((f, i) => (
          <li key={f.clave}>
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className={cn("min-w-0 truncate", f.resaltar ? "font-medium text-tinta" : "text-tinta-suave")}>
                {f.etiqueta}
              </span>
              <span className={cn("cifras shrink-0", f.resaltar ? "font-semibold text-tinta" : "text-tinta-suave")}>
                {f.texto ?? formato(f.valor)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-pildora bg-superficie-hundida">
              <div
                className={cn(
                  "h-full w-full origin-left rounded-pildora transition-transform duration-700 ease-curva",
                  f.resaltar ? "bg-naranja" : "bg-grafica-contexto",
                )}
                style={{
                  transform: `scaleX(${montado ? Math.min(1, f.valor / Math.max(1, f.total ?? tope)) : 0})`,
                  transitionDelay: `${i * 60}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * Tabla para lector de pantalla
 * ------------------------------------------------------------------------- */

function TablaOculta({ titulo, filas }: { titulo: string; filas: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <tbody>
        {filas.map(([a, b]) => (
          <tr key={a}>
            <th scope="row">{a}</th>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
