"use client";

import { cn } from "@/lib/utils";
import type { ConteoPrioritarias } from "./datos-mapa";

const formatoCifra = new Intl.NumberFormat("es-MX");

/**
 * El "¿cómo vamos?" de un solo grupo de prioritarias, sin abrir nada. Flota junto a la barra
 * superior del mapa, así que va en vidrio igual que ella. La nota de las secciones sin polígono
 * es discreta y aparte, para que nadie sume mal mirando el mapa.
 */
export function ResumenPrioritarias({
  grupo,
  conteo,
  enMovimiento,
  className,
}: {
  grupo: "A" | "B";
  conteo: ConteoPrioritarias;
  enMovimiento: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "vidrio elevacion-flotante transicion-ui flex flex-col gap-0.5 rounded-tarjeta px-3.5 py-2",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      <p className="text-sm text-tinta-suave">
        {`Prioritarias ${grupo}`}{" "}
        <span className="cifras font-medium text-tinta">
          {formatoCifra.format(conteo.recorridas)} de {formatoCifra.format(conteo.total)}
        </span>{" "}
        recorridas
      </p>

      {conteo.sinGeometria > 0 && (
        <p className="text-xs text-tinta-tenue">
          <span className="cifras">{formatoCifra.format(conteo.sinGeometria)}</span> sin polígono
          publicado: cuentan aquí, no se pintan en el mapa.
        </p>
      )}
    </div>
  );
}
