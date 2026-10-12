"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { DESTINOS, destinosVisibles, estaActivo } from "@/components/navegacion/destinos";
import { puedeCrear } from "@/lib/puertas-ui";
import { cn } from "@/lib/utils";

/**
 * Navegación de escritorio: un riel angosto que flota sobre la lámina territorial. No se expande,
 * no empuja el contenido y no lleva rótulos permanentes. Los iconos se agrupan por tarea y el
 * nombre aparece como una etiqueta de vidrio al acercarse.
 *
 * Los rieles que se abren al pasar el cursor son barras laterales disfrazadas: reacomodan la
 * pantalla y obligan a esperar. Aquí el ancho es constante y lo único que se mueve es la etiqueta.
 */

/** Grupos por tarea. El corte visual hace que diez destinos se lean como tres decisiones. */
const GRUPOS = [
  ["/", "/mapa"],
  ["/personas", "/actividades", "/agenda"],
  ["/territorio", "/seguimiento", "/reportes"],
  ["/registrar-representante", "/importar", "/exportar"],
  ["/usuarios"],
];

/** Las acciones de campo van arriba, antes de los grupos, y no se repiten en ellos. */
const ACCIONES = new Set(["/registrar", "/levantar-reporte"]);

export function Dock() {
  const ruta = usePathname();
  const { actuante } = useActuante();
  const visibles = destinosVisibles(DESTINOS, actuante);
  const porRuta = new Map(visibles.map((d) => [d.href as string, d]));

  const grupos = GRUPOS.map((grupo) =>
    grupo.map((href) => porRuta.get(href)).filter((d) => d !== undefined),
  ).filter((grupo) => grupo.length > 0);

  // Red de seguridad: un destino que alguien agregue a DESTINOS sin acordarse de GRUPOS sale al
  // final, en lugar de desaparecer del escritorio sin avisar. Así se perdieron Exportar y
  // Levantar reporte el 11 de octubre de 2026, y antes Carga masiva y Registrar representante.
  const agrupados = new Set(GRUPOS.flat());
  const sueltos = visibles.filter((d) => !agrupados.has(d.href) && !ACCIONES.has(d.href));
  if (sueltos.length > 0) grupos.push(sueltos);

  const levantarReporte = porRuta.get("/levantar-reporte");

  return (
    <nav
      aria-label="Navegación principal"
      // En una pantalla baja el riel completo del administrador no cabe: se desplaza por dentro en
      // lugar de salirse por abajo. Por eso las etiquetas van en un portal (ver Boton): el
      // overflow las recortaría.
      className="tarjeta fixed left-5 top-6 z-40 hidden max-h-[calc(100dvh-3rem)] w-14 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:none] md:flex"
    >
      {puedeCrear(actuante, "persona") && (
        <>
          <Boton
            href="/registrar"
            etiqueta="Registrar persona"
            icono={UserPlus}
            activo={estaActivo("/registrar", ruta)}
            primaria
          />
          {!levantarReporte && <Separador />}
        </>
      )}

      {levantarReporte && (
        <>
          <Boton
            href={levantarReporte.href}
            etiqueta={levantarReporte.etiqueta}
            icono={levantarReporte.icono}
            activo={estaActivo(levantarReporte.href, ruta)}
          />
          <Separador />
        </>
      )}

      {grupos.map((grupo, i) => (
        <div key={i} className="contents">
          {grupo.map((destino) => (
            <Boton
              key={destino.href}
              href={destino.href}
              etiqueta={destino.etiqueta}
              icono={destino.icono}
              activo={estaActivo(destino.href, ruta)}
            />
          ))}
          {i < grupos.length - 1 && <Separador />}
        </div>
      ))}
    </nav>
  );
}

function Separador() {
  return (
    <span
      aria-hidden
      className="my-1 h-px w-6 bg-[var(--vidrio-borde-bajo)]"
    />
  );
}

function Boton({
  href,
  etiqueta,
  icono: Icono,
  activo,
  primaria = false,
}: {
  href: string;
  etiqueta: string;
  icono: React.ComponentType<{ className?: string }>;
  activo: boolean;
  primaria?: boolean;
}) {
  // Dónde pintar la etiqueta, en coordenadas de pantalla; null si no hay que pintarla. Va en un
  // portal a <body> porque el riel tiene desenfoque de fondo (que vuelve relativo a él un
  // position: fixed) y overflow (que la recortaría).
  const [cerca, setCerca] = useState<{ x: number; y: number } | null>(null);
  const mostrar = (evento: React.SyntheticEvent<HTMLElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect();
    setCerca({ x: caja.right + 12, y: caja.top + caja.height / 2 });
  };

  return (
    <div className="relative">
      <Link
        href={href as never}
        data-destino
        aria-current={activo ? "page" : undefined}
        onMouseEnter={mostrar}
        onMouseLeave={() => setCerca(null)}
        onFocus={(evento) => {
          // El foco por teclado puede caer en un botón fuera de vista si el riel se desplaza.
          evento.currentTarget.scrollIntoView({ block: "nearest" });
          mostrar(evento);
        }}
        onBlur={() => setCerca(null)}
        className={cn(
          "transicion-ui grid size-11 place-items-center rounded-[11px] transition-colors",
          primaria
            ? "bg-naranja text-sobre-naranja"
            : activo
              ? "bg-tinta text-fondo"
              : "text-tinta-suave hover:bg-superficie-hundida hover:text-tinta",
        )}
      >
        <Icono className="size-[1.15rem]" />
      </Link>

      {/* El destino activo es una ficha en tinta; el naranja queda en un punto, como señal. */}
      {activo && !primaria && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1.5 size-[5px] rounded-full bg-naranja"
        />
      )}

      {cerca &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: cerca.x, top: cerca.y }}
            className="tarjeta pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium"
          >
            {etiqueta}
          </span>,
          document.body,
        )}
    </div>
  );
}
