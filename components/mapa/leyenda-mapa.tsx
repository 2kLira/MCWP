"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { grupoDePrioritarias, VISTAS_MAPA, type VistaMapa } from "./datos-mapa";

/** Las cuatro vistas que se pintan con la escala de cinco pasos, por cuantiles. */
const VISTAS_DE_ESCALA = new Set<VistaMapa>(["personas", "promovidos", "actividad", "recorridos"]);

/**
 * Una muestra de color junto a su etiqueta, fiel a como esa sección se pinta en el mapa: relleno
 * naranja pleno para lo hecho, hueco punteado para lo pendiente (misma clase `hueco-punteado` que
 * usa la sección sin responsable) y relleno neutro tenue para lo que no compite.
 */
function Muestra({
  tipo,
  etiqueta,
}: {
  tipo: "lleno" | "hueco" | "atenuado";
  etiqueta: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-tinta">
      <span
        aria-hidden
        className={cn(
          "size-3 shrink-0 rounded-[3px]",
          tipo === "lleno" && "bg-naranja",
          tipo === "hueco" && "hueco-punteado",
          tipo === "atenuado" && "border border-borde bg-mapa-0/50",
        )}
      />
      {etiqueta}
    </div>
  );
}

/**
 * Leyenda de la vista activa, en la esquina inferior izquierda del mapa. Es de las dos únicas
 * superficies con desenfoque de la aplicación, porque aquí sí hay territorio detrás. No choca con
 * el selector de capas (que ya vive en el borde del panel, fuera del mapa), ni con la atribución
 * de CARTO (abajo a la derecha), ni con la ficha de sección.
 *
 * En celular arranca colapsada en una pastilla corta para no taparle mapa a nadie; en escritorio
 * el botón de la pastilla se oculta y el contenido siempre se ve abierto.
 */
export function LeyendaMapa({
  vista,
  enMovimiento,
  className,
}: {
  vista: VistaMapa;
  enMovimiento: boolean;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const idContenido = useId();
  const grupoPrioritario = grupoDePrioritarias(vista);
  const etiquetaVista = VISTAS_MAPA.find((v) => v.id === vista)?.etiqueta ?? "";

  return (
    <div
      className={cn(
        "vidrio-flotante transicion-ui absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden md:bottom-4 md:left-4",
        abierta ? "rounded-tarjeta" : "rounded-pildora",
        "md:rounded-tarjeta",
        enMovimiento && "vidrio-en-movimiento",
        className,
      )}
    >
      {/* Pastilla que abre y cierra la leyenda, solo en celular: en escritorio el contenido ya
          se ve abierto y este botón no hace falta. */}
      <button
        type="button"
        onClick={() => setAbierta((valor) => !valor)}
        aria-expanded={abierta}
        aria-controls={idContenido}
        className="transicion-ui flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3.5 text-sm font-medium text-tinta md:hidden"
      >
        Leyenda
        <ChevronDown
          aria-hidden
          className={cn("transicion-ui size-3.5", abierta && "rotate-180")}
        />
      </button>

      <div
        id={idContenido}
        className={cn(
          "min-w-40 flex-col gap-3 px-3.5 pt-1 pb-3.5 md:min-w-48 md:pt-3.5",
          abierta ? "flex" : "hidden md:flex",
        )}
      >
        <p className="text-sm font-semibold text-tinta">{etiquetaVista}</p>

        {vista === "estructura" && (
          <div className="flex flex-col gap-1.5">
            <Muestra tipo="lleno" etiqueta="Con responsable" />
            <Muestra tipo="hueco" etiqueta="Sin responsable" />
          </div>
        )}

        {grupoPrioritario && (
          <div className="flex flex-col gap-1.5">
            <Muestra tipo="lleno" etiqueta="Recorrida" />
            <Muestra tipo="hueco" etiqueta="Por recorrer" />
            <Muestra tipo="atenuado" etiqueta="No prioritaria" />
          </div>
        )}

        {VISTAS_DE_ESCALA.has(vista) && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-tinta-suave">Menos</span>
              <div className="flex h-3 flex-1 overflow-hidden rounded-control">
                <span className="flex-1 bg-mapa-0" />
                <span className="flex-1 bg-mapa-1" />
                <span className="flex-1 bg-mapa-2" />
                <span className="flex-1 bg-mapa-3" />
                <span className="flex-1 bg-mapa-4" />
              </div>
              <span className="text-xs text-tinta-suave">Más</span>
            </div>
            <p className="text-xs text-tinta-suave">Por cuantiles, no cifras fijas.</p>
          </div>
        )}
      </div>
    </div>
  );
}
