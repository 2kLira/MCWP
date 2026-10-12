"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { ETIQUETA_ROL } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/**
 * Quién entró, y la salida. Arriba a la derecha en escritorio (`comoCapsula`: un menú de cuenta
 * con las iniciales) y dentro de Más en celular (la caja con el botón a la vista).
 *
 * Ya no hay nada que conmutar —el rol sale de la sesión— así que esto solo informa. El territorio
 * no se muestra: con RLS, el alcance del brigadista son las actividades a las que lo inviten, no
 * un territorio, y repetir aquí la etiqueta vieja mentiría.
 *
 * La salida es un formulario que postea a /salir en lugar de un botón con JavaScript: así
 * funciona sin JS, el servidor revoca el refresh token —cosa que borrar cookies en el navegador
 * no hace— y la redirección recarga la página con la sesión ya cerrada.
 */
export function CapsulaSesion({
  className,
  comoCapsula = false,
}: {
  className?: string;
  comoCapsula?: boolean;
}) {
  const { actuante } = useActuante();

  if (comoCapsula) {
    return (
      <MenuCuenta
        nombre={actuante.nombre}
        rol={ETIQUETA_ROL[actuante.rol]}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        comoCapsula
          ? "capsula filo w-fit max-w-[19rem] rounded-pildora px-2 pr-1"
          : "rounded-control border border-borde bg-superficie px-3 py-2",
        className,
      )}
      style={comoCapsula ? { minHeight: 44 } : undefined}
    >
      <User className="size-4 shrink-0 text-tinta-suave" aria-hidden />

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm text-tinta">{actuante.nombre}</p>
        <p className="truncate text-xs text-tinta-tenue">{ETIQUETA_ROL[actuante.rol]}</p>
      </div>

      <form action="/salir" method="post" className="shrink-0">
        <button
          type="submit"
          title="Cerrar sesión"
          className={cn(
            "transicion-ui flex items-center gap-2 text-tinta-suave transition-colors hover:text-tinta",
            comoCapsula
              ? "rounded-pildora px-3"
              : "rounded-control border border-borde px-3 text-sm",
          )}
          style={{ minHeight: 44 }}
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          <span className={comoCapsula ? "sr-only" : undefined}>Cerrar sesión</span>
        </button>
      </form>
    </div>
  );
}

/**
 * El menú de cuenta de la barra superior. Es un <details> y no un desplegable con estado para
 * conservar lo que hace valiosa a la salida: sigue funcionando sin JavaScript. El efecto solo
 * agrega la cortesía de cerrarlo al tocar fuera o con Escape.
 */
function MenuCuenta({
  nombre,
  rol,
  className,
}: {
  nombre: string;
  rol: string;
  className?: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function alTocarFuera(evento: MouseEvent) {
      const nodo = menu.current;
      if (nodo?.open && !nodo.contains(evento.target as Node)) nodo.open = false;
    }
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape" && menu.current) menu.current.open = false;
    }
    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, []);

  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <details ref={menu} className={cn("group relative", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-pildora py-1 pl-1 pr-2.5 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full border border-borde bg-superficie-hundida text-xs font-semibold text-tinta"
        >
          {iniciales}
        </span>
        <span className="hidden min-w-0 max-w-[11rem] leading-tight lg:block">
          <span className="block truncate text-sm font-semibold text-tinta">{nombre}</span>
          <span className="block truncate text-xs text-tinta-suave">{rol}</span>
        </span>
        <span className="sr-only lg:hidden">{nombre}</span>
        <ChevronDown
          className="size-4 shrink-0 text-tinta-tenue transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div
        className="tarjeta absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 p-1.5"
        style={{ background: "var(--superficie)" }}
      >
        <p className="px-2.5 pb-1.5 pt-2 text-xs leading-snug text-tinta-suave">
          <span className="block truncate text-sm font-semibold text-tinta">{nombre}</span>
          {rol}
        </p>
        <form action="/salir" method="post">
          <button
            type="submit"
            className="transicion-ui flex w-full items-center gap-2.5 rounded-control px-2.5 text-left text-sm text-tinta transition-colors hover:bg-superficie-hundida"
          >
            <LogOut className="size-4 shrink-0 text-tinta-suave" aria-hidden />
            Cerrar sesión
          </button>
        </form>
      </div>
    </details>
  );
}
