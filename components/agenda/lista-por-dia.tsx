import type { Actividad } from "@/lib/datos/actividades";
import { agruparPorDia, tituloDia } from "@/components/agenda/utilidades";
import { RenglonActividad } from "@/components/agenda/renglon-actividad";

/** Lista de actividades agrupadas por día, para hoy, esta semana y este mes. */
export function ListaPorDia({
  actividades,
  cargando,
  vacio,
  conDireccion = false,
}: {
  actividades: Actividad[];
  cargando: boolean;
  vacio: string;
  conDireccion?: boolean;
}) {
  if (cargando) {
    return (
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="h-14 animate-pulse rounded-control bg-superficie-hundida" />
        ))}
      </ul>
    );
  }

  const grupos = agruparPorDia(actividades);

  if (grupos.length === 0) {
    return (
      <div className="hueco-punteado grid min-h-32 place-items-center rounded-tarjeta p-6 text-center text-sm">
        {vacio}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map(([fecha, filas]) => (
        <div key={fecha}>
          <p className="mb-1 text-xs font-medium capitalize text-tinta-tenue">
            {tituloDia(fecha)}
          </p>
          <div className="flex flex-col divide-y divide-borde vidrio filo rounded-tarjeta">
            {filas.map((actividad) => (
              <RenglonActividad
                key={actividad.id}
                actividad={actividad}
                conDireccion={conDireccion}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
