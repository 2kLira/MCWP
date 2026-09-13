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
 * Navegación de escritorio: un riel angosto que ocupa ancho real en el armazón, no una barra
 * flotante encima del contenido. No se expande, no empuja nada al pasar el cursor y no lleva
 * rótulos permanentes: el nombre aparece como etiqueta al acercarse o al llegar con el teclado.
 *
 * El destino activo se lee con fondo naranja suave y el icono en naranja oscuro, más aria-current.
 * No hace falta ningún punto extra: fondo e icono ya lo dicen.
 */

/** Grupos por tarea. El corte visual hace que diez destinos se lean como tres decisiones. */
const GRUPOS = [
  ["/", "/mapa"],
  ["/personas", "/actividades", "/agenda"],
  ["/territorio", "/seguimiento", "/reportes"],
  ["/casillas", "/importar", "/usuarios"],
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
      className="hidden w-[var(--ancho-riel)] shrink-0 md:block"
    >
      <div className="sticky top-0 flex h-dvh flex-col items-center gap-1 overflow-y-auto border-r border-borde bg-[var(--vidrio-solido)] px-3 py-4">
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
      </div>
    </nav>
  );
}

function Separador() {
  return <span aria-hidden className="my-1.5 h-px w-7 shrink-0 bg-separador" />;
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
    <div className="relative shrink-0">
      <Link
        href={href as never}
        data-destino
        aria-label={etiqueta}
        aria-current={activo ? "page" : undefined}
        onMouseEnter={() => setCerca(true)}
        onMouseLeave={() => setCerca(false)}
        onFocus={() => setCerca(true)}
        onBlur={() => setCerca(false)}
        className={cn(
          "transicion-ui grid size-11 place-items-center rounded-control transition-colors",
          primaria
            ? "bg-naranja text-tinta hover:bg-naranja-fuerte"
            : activo
              ? "bg-naranja-suave text-naranja-texto"
              : "text-tinta-suave hover:bg-superficie-hundida hover:text-tinta",
        )}
      >
        <Icono className="size-5" />
      </Link>

      {cerca && (
        <span
          role="tooltip"
          className="vidrio pointer-events-none absolute left-[calc(100%+0.625rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium"
        >
          {etiqueta}
        </span>
      )}
    </div>
  );
}
