import { cn } from "@/lib/utils";

export type Vista = "hoy" | "semana" | "mes" | "calendario";

const VISTAS: { clave: Vista; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "semana", etiqueta: "Esta semana" },
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "calendario", etiqueta: "Calendario" },
];

/** Selector de las cuatro vistas de la agenda. Estado activo en neutros, nunca en naranja. */
export function SelectorVista({
  vista,
  alCambiar,
}: {
  vista: Vista;
  alCambiar: (v: Vista) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Vista de la agenda"
      className="flex gap-1 overflow-x-auto rounded-control border border-borde bg-superficie-hundida p-1"
    >
      {VISTAS.map((v) => (
        <button
          key={v.clave}
          type="button"
          role="tab"
          aria-selected={vista === v.clave}
          onClick={() => alCambiar(v.clave)}
          className={cn(
            "transicion-ui min-h-9 shrink-0 rounded-control px-3 text-sm font-medium transition-colors",
            vista === v.clave
              ? "bg-superficie text-tinta elevacion-apoyo"
              : "text-tinta-suave hover:text-tinta",
          )}
        >
          {v.etiqueta}
        </button>
      ))}
    </div>
  );
}
