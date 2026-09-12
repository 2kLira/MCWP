import Link from "next/link";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import type { Actividad } from "@/lib/datos/actividades";
import { horaCorta } from "@/components/agenda/utilidades";

/**
 * Un renglón de actividad: hora, nombre, tipo y sección. Enlaza a su ficha.
 *
 * En la agenda propia del brigadista el renglón carga además la dirección, porque esa agenda se
 * abre de pie en la calle y lo que se necesita ahí es a dónde ir.
 */
export function RenglonActividad({
  actividad,
  conDireccion = false,
}: {
  actividad: Actividad;
  conDireccion?: boolean;
}) {
  return (
    <Link
      href={`/actividades/${actividad.id}`}
      className="transicion-ui flex min-h-11 items-center justify-between gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-superficie-hundida"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{actividad.nombre}</span>
        <span className="block truncate text-xs text-tinta-suave">
          {ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo]}
          {actividad.seccion_clave && (
            <>
              {" · "}
              <span className="cifras">Sección {actividad.seccion_clave}</span>
            </>
          )}
        </span>
        {conDireccion && actividad.direccion && (
          <span className="block truncate text-xs text-tinta-tenue">{actividad.direccion}</span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="cifras text-xs text-tinta-tenue">{horaCorta(actividad.hora)}</span>
        {/* Solo se marca lo que ya arrancó: lo programado es el caso normal y no necesita sello. */}
        {actividad.estatus === "en_curso" && (
          <span className="pildora">{ETIQUETA_ESTATUS.en_curso}</span>
        )}
      </span>
    </Link>
  );
}
