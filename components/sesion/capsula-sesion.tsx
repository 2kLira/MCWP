"use client";

import { LogOut, User } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { ETIQUETA_ROL } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/**
 * Quién entró, y la salida. Ocupa el hueco que dejó el conmutador de rol: arriba a la derecha en
 * escritorio, dentro de Más en celular.
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
