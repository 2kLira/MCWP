"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, User } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";
import { ETIQUETA_ROL, type UsuarioActuante } from "@/lib/tipos";
import { cn } from "@/lib/utils";

function territorioDe(usuario: UsuarioActuante) {
  return etiquetaAlcance(usuario, demarcacionPorId(usuario.demarcacionId)?.nombre);
}

/**
 * Conmutador de rol. Arriba a la derecha en escritorio, dentro de Más en celular.
 * Al cambiar, todo el sistema se recorta en vivo, así que el cambio tiene que ser inmediato y
 * notorio: por eso el territorio vigente se lee siempre, sin abrir el menú.
 */
export function ConmutadorRol({
  className,
  comoCapsula = false,
}: {
  className?: string;
  comoCapsula?: boolean;
}) {
  const { actuante, disponibles, cambiarActuante } = useActuante();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alTocarFuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("keydown", alEscapar);
    return () => {
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("keydown", alEscapar);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "transicion-ui flex items-center gap-3 text-left transition-colors",
          comoCapsula
            ? "capsula filo w-fit max-w-[17rem] rounded-pildora px-2 pr-3"
            : "w-full rounded-control border border-borde bg-superficie px-3 py-2 hover:bg-superficie-hundida",
        )}
        style={comoCapsula ? { minHeight: 44 } : undefined}
      >
        {comoCapsula ? (
          <>
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-superficie-hundida"
              aria-hidden
            >
              <User className="size-4 text-tinta-suave" />
            </span>
            <span className="truncate text-sm font-medium text-tinta">
              {ETIQUETA_ROL[actuante.rol]}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-tinta">
              {ETIQUETA_ROL[actuante.rol]}
            </span>
            <span className="block truncate text-xs text-tinta-suave">
              {territorioDe(actuante)}
            </span>
          </span>
        )}
        <ChevronDown
          className={cn(
            "transicion-ui size-4 shrink-0 text-tinta-tenue transition-transform",
            comoCapsula && "ml-auto",
            abierto && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {abierto && (
        <ul
          role="listbox"
          aria-label="Cambiar de rol"
          className="vidrio filo absolute right-0 z-50 mt-2 w-full min-w-72 overflow-hidden rounded-tarjeta py-1"
        >
          {disponibles.map((usuario) => {
            const elegido = usuario.id === actuante.id;
            return (
              <li key={usuario.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={elegido}
                  onClick={() => {
                    cambiarActuante(usuario.id);
                    setAbierto(false);
                  }}
                  className={cn(
                    "transicion-ui flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                    elegido ? "bg-naranja-suave" : "hover:bg-superficie-hundida",
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0 text-naranja-texto",
                      !elegido && "invisible",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-tinta">
                      {ETIQUETA_ROL[usuario.rol]}
                    </span>
                    <span className="block text-xs text-tinta-suave">
                      {usuario.nombre} · {territorioDe(usuario)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
