"use client";

import { cn } from "@/lib/utils";
import type { ConteoPrioritarias } from "./datos-mapa";

const formatoCifra = new Intl.NumberFormat("es-MX");

/**
 * El "¿cómo vamos?" de un solo grupo de prioritarias, sin abrir nada. Flota junto a la barra
 * superior del mapa, así que va en vidrio igual que ella. La nota de las secciones sin límites en
 * el mapa es discreta y aparte, para que nadie sume mal mirando el mapa: esas secciones siguen
 * contando en el total de arriba.
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
        "vidrio-flotante filo transicion-ui flex flex-col gap-0.5 rounded-tarjeta px-3.5 py-2",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      <p className="text-sm">
        <span className="font-semibold text-tinta">{`Prioritarias ${grupo}`}</span>{" "}
        <span className="cifras font-semibold text-tinta">
          {formatoCifra.format(conteo.recorridas)} de {formatoCifra.format(conteo.total)}
        </span>{" "}
        <span className="text-tinta-suave">recorridas</span>
      </p>

      {conteo.sinGeometria > 0 && (
        <p className="text-xs text-tinta-suave">
          <span className="cifras">{formatoCifra.format(conteo.sinGeometria)}</span>{" "}
          {conteo.sinGeometria === 1
            ? "sección aún sin límites disponibles en el mapa"
            : "secciones aún sin límites disponibles en el mapa"}
        </p>
      )}
    </div>
  );
}
