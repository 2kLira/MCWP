import Link from "next/link";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import type { Actividad } from "@/lib/datos/actividades";
import { horaCorta } from "@/components/agenda/utilidades";
import { Estado } from "@/components/sistema/estado";

/**
 * Un renglón de actividad: nombre, y debajo tipo, sección y hora. Enlaza a su ficha.
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
      className="renglon-activo -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-control px-2 py-2.5 text-left"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta">{actividad.nombre}</span>
        <span className="block truncate text-xs text-tinta-suave">
          {ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo]}
          {actividad.seccion_clave && (
            <>
              {" · "}
              <span className="cifras">Sección {actividad.seccion_clave}</span>
            </>
          )}
          {" · "}
          <span className="cifras">{horaCorta(actividad.hora)}</span>
        </span>
        {conDireccion && actividad.direccion && (
          <span className="block truncate text-xs text-tinta-tenue">{actividad.direccion}</span>
        )}
      </span>
      {/* Solo se marca lo que ya arrancó: lo programado es el caso normal y no necesita sello. */}
      {actividad.estatus === "en_curso" && (
        <Estado vivo className="shrink-0">
          {ETIQUETA_ESTATUS.en_curso}
        </Estado>
      )}
    </Link>
  );
}
