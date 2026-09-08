"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { Plus } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { puedeCrear } from "@/lib/permisos";
import { useConsulta } from "@/lib/usar-consulta";
import { actividadesDeAgenda, type Actividad } from "@/lib/datos/actividades";
import { aISO, hoyISO } from "@/components/agenda/utilidades";
import { SelectorVista, type Vista } from "@/components/agenda/selector-vista";
import { ListaPorDia } from "@/components/agenda/lista-por-dia";
import { CalendarioMensual, rangoDeCalendario } from "@/components/agenda/calendario-mensual";
import { RenglonActividad } from "@/components/agenda/renglon-actividad";

const SIN_ACTIVIDADES: Record<Vista, string> = {
  hoy: "Sin actividades hoy.",
  semana: "Sin actividades esta semana.",
  mes: "Sin actividades este mes.",
  calendario: "Sin actividades este mes.",
};

export default function Agenda() {
  const { actuante } = useActuante();
  const [vista, setVista] = useState<Vista>("hoy");
  const [mesCalendario, setMesCalendario] = useState(() => startOfMonth(new Date()));
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const rango = useMemo(() => {
    if (vista === "hoy") {
      const dia = hoyISO();
      return { desde: dia, hasta: dia };
    }
    if (vista === "semana") {
      return {
        desde: aISO(startOfWeek(new Date(), { weekStartsOn: 1 })),
        hasta: aISO(endOfWeek(new Date(), { weekStartsOn: 1 })),
      };
    }
    if (vista === "mes") {
      return {
        desde: aISO(startOfMonth(new Date())),
        hasta: aISO(endOfMonth(new Date())),
      };
    }
    return rangoDeCalendario(mesCalendario);
  }, [vista, mesCalendario]);

  const agenda = useConsulta<Actividad[]>(
    () => actividadesDeAgenda(actuante, rango.desde, rango.hasta),
    [],
    [actuante.id, rango.desde, rango.hasta],
  );

  const actividadesDelDia = diaSeleccionado
    ? agenda.datos.filter((a) => a.fecha === diaSeleccionado)
    : [];

  function cambiarMes(mes: Date) {
    setMesCalendario(mes);
    setDiaSeleccionado(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl">Agenda</h1>
        {/* Única acción primaria de la pantalla, y por eso lo único naranja además del
            marcador de hoy en el calendario. */}
        {puedeCrear(actuante, "actividad") && (
          <Link
            href="/actividades"
            data-destino
            className="transicion-ui inline-flex items-center gap-2 rounded-control bg-naranja px-4 text-sm font-medium text-tinta toque-actividad"
          >
            <Plus className="size-4" aria-hidden />
            Nueva actividad
          </Link>
        )}
      </header>

      <SelectorVista vista={vista} alCambiar={setVista} />

      {vista === "calendario" ? (
        <div className="flex flex-col gap-4">
          <div className="vidrio filo rounded-tarjeta p-3 elevacion-apoyo">
            <CalendarioMensual
              mes={mesCalendario}
              alCambiarMes={cambiarMes}
              actividades={agenda.datos}
              cargando={agenda.cargando}
              diaSeleccionado={diaSeleccionado}
              alSeleccionarDia={setDiaSeleccionado}
            />
          </div>

          {diaSeleccionado && (
            <div>
              <p className="mb-1 text-xs font-medium text-tinta-tenue">
                {actividadesDelDia.length === 0
                  ? "Sin actividades ese día."
                  : `${actividadesDelDia.length} actividad${actividadesDelDia.length === 1 ? "" : "es"}`}
              </p>
              {actividadesDelDia.length > 0 && (
                <div className="flex flex-col divide-y divide-borde vidrio filo rounded-tarjeta">
                  {actividadesDelDia.map((actividad) => (
                    <RenglonActividad key={actividad.id} actividad={actividad} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <ListaPorDia
          actividades={agenda.datos}
          cargando={agenda.cargando}
          vacio={SIN_ACTIVIDADES[vista]}
        />
      )}
    </div>
  );
}
