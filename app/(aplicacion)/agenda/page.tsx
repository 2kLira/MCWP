"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { Plus } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { puedeCrear } from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import type { Actividad } from "@/lib/datos/actividades";
import { actividadesDeAgendaVisibles, esAgendaPropia } from "@/components/agenda/datos";
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

/**
 * Vacío de la agenda propia. Que no haya nada abierto es lo normal entre jornadas, no una falla:
 * un solo renglón seco, sin explicar de más y sin sugerir que algo se perdió.
 */
const SIN_ASIGNADAS = "Sin actividades asignadas por ahora.";

export default function Agenda() {
  const { actuante } = useActuante();
  const [vista, setVista] = useState<Vista>("hoy");
  const [mesCalendario, setMesCalendario] = useState(() => startOfMonth(new Date()));
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  // Para el brigadista esta pantalla es todo el sistema: su agenda son sus actividades, y solo
  // las que siguen abiertas. Al cerrarse, desaparecen solas por el recorte de estatus.
  const propia = esAgendaPropia(actuante);

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

  // Una sola consulta para las tres listas y para el calendario, ya recortada por rol. Si el
  // conteo y la lista salieran de fuentes distintas, el calendario marcaría días que al abrirlos
  // aparecen vacíos.
  const agenda = useConsulta<Actividad[]>(
    () => actividadesDeAgendaVisibles(actuante, rango.desde, rango.hasta),
    [],
    [actuante.id, actuante.rol, rango.desde, rango.hasta],
  );

  const actividadesDelDia = diaSeleccionado
    ? agenda.datos.filter((a) => a.fecha === diaSeleccionado)
    : [];

  function cambiarMes(mes: Date) {
    setMesCalendario(mes);
    setDiaSeleccionado(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo={propia ? "Mi agenda" : "Agenda"}
        apoyo={propia ? "Sus actividades programadas y en curso." : undefined}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <SelectorVista vista={vista} alCambiar={setVista} />
        {/* Única acción primaria de la pantalla, y por eso lo único naranja además del
            marcador de hoy en el calendario. */}
        {puedeCrear(actuante, "actividad") && (
          <Link href="/actividades" data-destino className="boton-primario ml-auto">
            <Plus className="size-4" aria-hidden />
            Nueva actividad
          </Link>
        )}
      </div>

      {vista === "calendario" ? (
        <div
          className={
            diaSeleccionado
              ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6"
              : "grid gap-4"
          }
        >
          <div className="tarjeta min-w-0 p-3 sm:p-[1.125rem]">
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
            <div className="tarjeta min-w-0 p-[1.125rem]">
              <p className="text-[0.78125rem] font-semibold text-tinta-suave">
                {/* Un día suelto que el usuario eligió: aquí basta decir que está vacío. */}
                {actividadesDelDia.length === 0 ? (
                  "Sin actividades ese día."
                ) : (
                  <>
                    <span className="cifras">{actividadesDelDia.length}</span>
                    {actividadesDelDia.length === 1 ? " actividad" : " actividades"}
                  </>
                )}
              </p>
              {actividadesDelDia.length > 0 && (
                <div className="mt-0.5 flex flex-col divide-y divide-separador">
                  {actividadesDelDia.map((actividad) => (
                    <RenglonActividad
                      key={actividad.id}
                      actividad={actividad}
                      conDireccion={propia}
                    />
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
          vacio={propia ? SIN_ASIGNADAS : SIN_ACTIVIDADES[vista]}
          conDireccion={propia}
        />
      )}
    </div>
  );
}
