export type Vista = "hoy" | "semana" | "mes" | "calendario";

const VISTAS: { clave: Vista; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "semana", etiqueta: "Esta semana" },
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "calendario", etiqueta: "Calendario" },
];

/**
 * Selector de las cuatro vistas de la agenda. Estado activo en neutros, nunca en naranja: lo pinta
 * la utilidad `segmento` a partir de `aria-selected`.
 */
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
      className="segmento max-w-full overflow-x-auto"
    >
      {VISTAS.map((v) => (
        <button
          key={v.clave}
          type="button"
          role="tab"
          aria-selected={vista === v.clave}
          onClick={() => alCambiar(v.clave)}
          // Más alto en celular: la agenda se cambia de vista con el pulgar y de pie.
          className="shrink-0 max-sm:min-h-11"
        >
          {v.etiqueta}
        </button>
      ))}
    </div>
  );
}
