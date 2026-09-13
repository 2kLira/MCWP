"use client";

import { cn } from "@/lib/utils";
import type { ConteoPrioritarias } from "./datos-mapa";

const formatoCifra = new Intl.NumberFormat("es-MX");

/**
 * El "¿cómo vamos?" de un solo grupo de prioritarias. Vive junto al selector de capas, en el
 * borde del panel, no flotando sobre el territorio. La nota de las secciones sin polígono es
 * discreta y aparte, redactada para que se entienda sin saber qué es un polígono: nadie debe
 * sumar mal mirando el mapa, y el conteo no cambia por esconderla.
 */
export function ResumenPrioritarias({
  grupo,
  conteo,
  className,
}: {
  grupo: "A" | "B";
  conteo: ConteoPrioritarias;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <p className="text-sm text-tinta-suave">
        {`Prioritarias ${grupo}`}{" "}
        <span className="cifras font-semibold text-tinta">
          {formatoCifra.format(conteo.recorridas)} de {formatoCifra.format(conteo.total)}
        </span>{" "}
        recorridas
      </p>

      {conteo.sinGeometria > 0 && (
        <p className="text-xs text-tinta-suave">
          <span className="cifras">{formatoCifra.format(conteo.sinGeometria)}</span>{" "}
          {conteo.sinGeometria === 1 ? "sección incluida" : "secciones incluidas"} en el total
          {conteo.sinGeometria === 1 ? " aún no tiene" : " aún no tienen"} límites disponibles en el
          mapa.
        </p>
      )}
    </div>
  );
}
