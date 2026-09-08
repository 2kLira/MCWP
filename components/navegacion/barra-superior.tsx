"use client";

import { Buscador } from "@/components/buscador";
import { ConmutadorRol } from "@/components/conmutador-rol";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";

/** Barra superior de escritorio. El conmutador de rol va arriba a la derecha. */
export function BarraSuperior() {
  const { actuante } = useActuante();
  const territorio = etiquetaAlcance(
    actuante,
    demarcacionPorId(actuante.demarcacionId)?.nombre,
  );

  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-borde bg-superficie px-6 md:flex">
      <div className="min-w-0 flex-1">
        <Buscador className="max-w-md" />
        <p className="sr-only">Oaxaca de Juárez · {territorio}</p>
      </div>
      <ConmutadorRol className="w-72" />
    </header>
  );
}
