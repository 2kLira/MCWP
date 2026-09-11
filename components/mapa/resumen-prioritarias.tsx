"use client";

import { cn } from "@/lib/utils";
import type { ConteoPrioritarias } from "./datos-mapa";

const formatoCifra = new Intl.NumberFormat("es-MX");

/**
 * El "¿cómo vamos?" de las prioritarias, sin abrir nada. Flota junto a la barra superior del mapa,
 * así que va en vidrio igual que ella. A 390px solo entra el total y el avance; el desglose por A
 * y B se reserva para pantallas donde ya cabe sin apretar. La nota de las secciones sin polígono
 * es discreta y aparte, para que nadie sume mal mirando el mapa.
 */
export function ResumenPrioritarias({
  conteo,
  enMovimiento,
  className,
}: {
  conteo: ConteoPrioritarias;
  enMovimiento: boolean;
  className?: string;
}) {
  const total = conteo.totalA + conteo.totalB;
  const recorridas = conteo.recorridasA + conteo.recorridasB;

  return (
    <div
      className={cn(
        "vidrio elevacion-flotante transicion-ui flex flex-col gap-0.5 rounded-tarjeta px-3.5 py-2",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <p className="text-sm text-tinta-suave">
          Prioritarias{" "}
          <span className="cifras font-medium text-tinta">
            {formatoCifra.format(recorridas)} de {formatoCifra.format(total)}
          </span>{" "}
          recorridas
        </p>
        <p className="hidden cifras text-xs text-tinta-suave md:block">
          A: {formatoCifra.format(conteo.recorridasA)}/{formatoCifra.format(conteo.totalA)} · B:{" "}
          {formatoCifra.format(conteo.recorridasB)}/{formatoCifra.format(conteo.totalB)}
        </p>
      </div>

      {conteo.sinGeometria > 0 && (
        <p className="text-xs text-tinta-tenue">
          <span className="cifras">{formatoCifra.format(conteo.sinGeometria)}</span> prioritarias
          sin polígono publicado: cuentan aquí, no se pintan en el mapa.
        </p>
      )}
    </div>
  );
}
