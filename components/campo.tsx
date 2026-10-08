/**
 * Etiqueta y campo, la pieza de formulario del sistema.
 *
 * El `<label>` envuelve al control, así que la asociación es implícita y no hace falta
 * htmlFor/id. El control va adentro como children y normalmente lleva la utilidad `.campo`,
 * que ya trae la altura de toque de 48, el radio de control, el borde y el foco del sistema.
 *
 * Vivía duplicado palabra por palabra en components/registro/formulario-registro.tsx y en
 * components/actividades/formulario-actividad.tsx. Se extrajo aquí cuando la pantalla de entrada
 * iba a ser la tercera copia.
 */
export function Campo({
  etiqueta,
  apoyo,
  children,
}: {
  etiqueta: string;
  apoyo?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-tinta-suave">
        {etiqueta}
        {apoyo && <span className="ml-2 text-xs text-tinta-tenue">{apoyo}</span>}
      </span>
      {children}
    </label>
  );
}
