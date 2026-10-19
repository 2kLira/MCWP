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
      <ul className="tarjeta flex flex-col gap-2 p-[1.125rem]">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="h-12 esqueleto rounded-control" />
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
    <div className="tarjeta flex flex-col gap-3.5 p-[1.125rem]">
      {grupos.map(([fecha, filas]) => (
        <section key={fecha}>
          <h2 className="mb-0.5 text-[0.78125rem] font-semibold text-tinta-suave first-letter:uppercase">
            {tituloDia(fecha)}
          </h2>
          <div className="flex flex-col divide-y divide-separador">
            {filas.map((actividad) => (
              <RenglonActividad
                key={actividad.id}
                actividad={actividad}
                conDireccion={conDireccion}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
