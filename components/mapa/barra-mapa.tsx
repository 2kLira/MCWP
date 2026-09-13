"use client";

import { Map as IconoMapa } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId, MUNICIPIO } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";
import { cn } from "@/lib/utils";

/** Contexto territorial del mapa. Va en el borde del panel, junto al selector de capas. */
export function BarraMapa({ className }: { className?: string }) {
  const { actuante } = useActuante();
  const territorio = etiquetaAlcance(
    actuante,
    demarcacionPorId(actuante.demarcacionId)?.nombre,
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <IconoMapa className="size-4 shrink-0 text-tinta-suave" aria-hidden />
      <p className="min-w-0 truncate text-sm text-tinta">
        <span className="font-medium">{MUNICIPIO.nombre}</span>
        <span className="text-tinta-suave"> · {territorio}</span>
      </p>
    </div>
  );
}
