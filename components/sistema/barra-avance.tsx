import { cn } from "@/lib/utils";

/**
 * Barra de avance. `valor` va de 0 a 1. Se escala con transform, no con width, para que animarla
 * no recalcule el acomodo.
 */
export function BarraAvance({
  valor,
  descripcion,
  etiquetadaPor,
  className,
}: {
  valor: number;
  /** Lo que lee un lector de pantalla: "64 por ciento de cobertura". */
  descripcion: string;
  /** `id` del texto visible que nombra a la barra, si lo hay. */
  etiquetadaPor?: string;
  className?: string;
}) {
  const acotado = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0));
  return (
    <div
      role="progressbar"
      aria-labelledby={etiquetadaPor}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(acotado * 100)}
      aria-valuetext={descripcion}
      className={cn("h-1 overflow-hidden rounded-pildora bg-superficie-hundida", className)}
    >
      <div
        className="transicion-panel h-full w-full origin-left rounded-pildora bg-naranja transition-transform"
        style={{ transform: `scaleX(${acotado})` }}
      />
    </div>
  );
}
