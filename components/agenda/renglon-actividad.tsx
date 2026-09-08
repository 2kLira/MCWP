import Link from "next/link";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import type { Actividad } from "@/lib/datos/actividades";
import { horaCorta } from "@/components/agenda/utilidades";

/** Un renglón de actividad: hora, nombre, tipo, subtipo y sección. Enlaza a su ficha. */
export function RenglonActividad({ actividad }: { actividad: Actividad }) {
  return (
    <Link
      href={`/actividades/${actividad.id}`}
      className="transicion-ui flex min-h-11 items-center justify-between gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-superficie-hundida"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{actividad.nombre}</span>
        <span className="block truncate text-xs text-tinta-suave">
          {ETIQUETA_TIPO_ACTIVIDAD[actividad.tipo]}
          {actividad.subtipo && ` · ${actividad.subtipo}`}
          {actividad.seccion_clave && (
            <>
              {" · "}
              <span className="cifras">Sección {actividad.seccion_clave}</span>
            </>
          )}
        </span>
      </span>
      <span className="cifras shrink-0 text-xs text-tinta-tenue">
        {horaCorta(actividad.hora)}
      </span>
    </Link>
  );
}
