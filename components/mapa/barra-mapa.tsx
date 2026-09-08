"use client";

import { Map as IconoMapa } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId, MUNICIPIO } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";
import { cn } from "@/lib/utils";

/** Barra superior flotante del mapa: municipio y territorio del actuante. Va en vidrio. */
export function BarraMapa({
  enMovimiento,
  className,
}: {
  enMovimiento: boolean;
  className?: string;
}) {
  const { actuante } = useActuante();
  const territorio = etiquetaAlcance(
    actuante,
    demarcacionPorId(actuante.demarcacionId)?.nombre,
  );

  return (
    <div
      className={cn(
        "vidrio elevacion-flotante transicion-ui flex min-h-11 items-center gap-2.5 rounded-tarjeta px-3.5 py-2",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      <IconoMapa className="size-4 shrink-0 text-tinta-suave" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-tinta">{MUNICIPIO.nombre}</p>
        <p className="truncate text-xs text-tinta-suave">{territorio}</p>
      </div>
    </div>
  );
}
