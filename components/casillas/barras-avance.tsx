"use client";

import { cn } from "@/lib/utils";
import type { AvanceCasillas } from "@/lib/datos/casillas";

const formatoCifra = new Intl.NumberFormat("es-MX");

function Barra({
  etiqueta,
  cubiertos,
  total,
}: {
  etiqueta: string;
  cubiertos: number;
  total: number;
}) {
  const porcentaje = total > 0 ? Math.round((cubiertos / total) * 100) : 0;
  return (
    <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
      <p className="text-sm text-tinta-suave">
        {etiqueta}{" "}
        <span className="cifras font-medium text-tinta">
          {formatoCifra.format(cubiertos)} de {formatoCifra.format(total)} casillas
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuenow={cubiertos}
        aria-valuemin={0}
        aria-valuemax={total}
        className="h-2 w-full overflow-hidden rounded-pildora bg-superficie-hundida"
      >
        <div
          className="transicion-panel h-full rounded-pildora bg-naranja"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}

/**
 * "¿Cómo vamos?" sin abrir nada: arriba la cifra que de verdad contesta la pregunta —cuántas
 * casillas ya tienen titular y suplente, las dos cosas—, y debajo el detalle por cargo contra el
 * total de casillas que está viendo la pantalla (todo el territorio, o lo que deje el filtro de
 * sección). Una casilla con titular pero sin suplente no cuenta como completa: por eso ese
 * conteo no sale de sumar las dos barras, se calcula aparte. Una sola tarjeta en vidrio; si las
 * dos barras no caben lado a lado se apilan solas, porque cada una ya trae su propio ancho mínimo.
 */
export function BarrasAvance({
  avance,
  completas,
  enMovimiento,
  className,
}: {
  avance: AvanceCasillas;
  completas: number;
  enMovimiento: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "vidrio elevacion-flotante transicion-ui flex w-full flex-col gap-3 rounded-tarjeta px-3.5 py-3",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      <p className="text-sm text-tinta-suave">
        Casillas completas{" "}
        <span className="cifras text-base font-semibold text-tinta">
          {formatoCifra.format(completas)} de {formatoCifra.format(avance.total)}
        </span>
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <Barra etiqueta="Con titular" cubiertos={avance.titularesCubiertos} total={avance.total} />
        <Barra
          etiqueta="Con suplente"
          cubiertos={avance.suplentesCubiertos}
          total={avance.total}
        />
      </div>
    </div>
  );
}
