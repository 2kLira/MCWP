"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { DESTINOS, destinosVisibles, estaActivo } from "@/components/navegacion/destinos";
import { puedeCrear } from "@/lib/permisos";
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
  ["/usuarios"],
];

export function Dock() {
  const ruta = usePathname();
  const { actuante } = useActuante();
  const visibles = destinosVisibles(DESTINOS, actuante);
  const porRuta = new Map(visibles.map((d) => [d.href as string, d]));

  const grupos = GRUPOS.map((grupo) =>
    grupo.map((href) => porRuta.get(href)).filter((d) => d !== undefined),
  ).filter((grupo) => grupo.length > 0);

  return (
    <nav
      aria-label="Navegación principal"
      className="dock fixed left-5 top-1/2 z-40 hidden w-14 -translate-y-1/2 flex-col items-center gap-1 rounded-hoja p-1.5 md:flex"
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
  const [cerca, setCerca] = useState(false);

  return (
    <div className="relative">
      <Link
        href={href as never}
        data-destino
        aria-current={activo ? "page" : undefined}
        onMouseEnter={() => setCerca(true)}
        onMouseLeave={() => setCerca(false)}
        onFocus={() => setCerca(true)}
        onBlur={() => setCerca(false)}
        className={cn(
          "transicion-ui grid size-11 place-items-center rounded-control transition-colors",
          primaria
            ? "bg-naranja text-tinta"
            : activo
              ? "text-naranja-texto"
              : "text-tinta-suave hover:text-tinta",
        )}
      >
        <Icono className="size-[1.15rem]" />
      </Link>

      {/* El destino activo se marca con un punto, no con un bloque de color. */}
      {activo && !primaria && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-1 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-naranja"
        />
      )}

      {cerca && (
        <span
          role="tooltip"
          className="vidrio filo pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium"
        >
          {etiqueta}
        </span>
      )}
    </div>
  );
}
