"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Actividad } from "@/lib/datos/actividades";
import { aISO, hoyISO } from "@/components/agenda/utilidades";
import { cn } from "@/lib/utils";

const ABREVIATURAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** Rango de días a consultar para llenar la rejilla completa del mes, incluidas las orillas. */
export function rangoDeCalendario(mes: Date): { desde: string; hasta: string } {
  return {
    desde: aISO(startOfWeek(startOfMonth(mes), { weekStartsOn: 1 })),
    hasta: aISO(endOfWeek(endOfMonth(mes), { weekStartsOn: 1 })),
  };
}

/**
 * Calendario mensual con rejilla propia de CSS grid, sin librería. Un punto por actividad en cada
 * día, cifras tabulares en el número del día, y el marcador de hoy en naranja: uno de los pocos
 * lugares donde vive ese color en la pantalla.
 */
export function CalendarioMensual({
  mes,
  alCambiarMes,
  actividades,
  cargando,
  diaSeleccionado,
  alSeleccionarDia,
}: {
  mes: Date;
  alCambiarMes: (mes: Date) => void;
  actividades: Actividad[];
  cargando: boolean;
  diaSeleccionado: string | null;
  alSeleccionarDia: (fechaISO: string) => void;
}) {
  const dias = eachDayOfInterval({
    start: startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }),
  });

  const hoy = hoyISO();

  const conteoPorDia = new Map<string, number>();
  for (const actividad of actividades) {
    conteoPorDia.set(actividad.fecha, (conteoPorDia.get(actividad.fecha) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium capitalize text-tinta">
          {format(mes, "MMMM yyyy", { locale: es })}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => alCambiarMes(subMonths(mes, 1))}
            className="transicion-ui grid size-11 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => alCambiarMes(addMonths(mes, 1))}
            className="transicion-ui grid size-11 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {ABREVIATURAS.map((abrev) => (
          <p key={abrev} className="py-1 text-center text-xs text-tinta-tenue">
            {abrev}
          </p>
        ))}

        {dias.map((dia) => {
          const iso = aISO(dia);
          const enMes = isSameMonth(dia, mes);
          const esHoy = iso === hoy;
          const seleccionado = iso === diaSeleccionado;
          const conteo = conteoPorDia.get(iso) ?? 0;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => alSeleccionarDia(iso)}
              aria-pressed={seleccionado}
              aria-label={`${format(dia, "d 'de' MMMM", { locale: es })}${conteo > 0 ? `, ${conteo} actividades` : ""}`}
              className={cn(
                "transicion-ui flex min-h-11 flex-col items-center gap-1 rounded-control border py-1.5 transition-colors",
                seleccionado
                  ? "border-tinta bg-superficie-hundida"
                  : "border-transparent hover:bg-superficie-hundida",
                !enMes && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "cifras grid size-6 place-items-center rounded-full text-sm",
                  esHoy ? "bg-naranja text-tinta" : "text-tinta",
                )}
              >
                {format(dia, "d")}
              </span>
              <span className="flex h-1.5 flex-wrap items-center justify-center gap-0.5">
                {cargando
                  ? null
                  : Array.from({ length: Math.min(conteo, 4) }).map((_, i) => (
                      <span key={i} className="size-1.5 rounded-full bg-tinta-tenue" aria-hidden />
                    ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
