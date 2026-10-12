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
 * Calendario mensual con rejilla propia de CSS grid, sin librería. Bajo el número de cada día va
 * el conteo de sus actividades, el día elegido se pinta como ficha en tinta y hoy lleva un punto
 * naranja: uno de los pocos lugares donde vive ese color en la pantalla.
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
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-tinta first-letter:uppercase">
          {format(mes, "MMMM yyyy", { locale: es })}
        </p>
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => alCambiarMes(subMonths(mes, 1))}
          className="boton"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => alCambiarMes(addMonths(mes, 1))}
          className="boton"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {ABREVIATURAS.map((abrev) => (
          <p key={abrev} className="pb-1 text-center text-xs text-tinta-suave first-letter:uppercase">
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
                "transicion-ui relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-control py-1.5 leading-tight transition-colors",
                // El día elegido es una ficha en tinta; el naranja se queda para el punto de hoy.
                seleccionado ? "bg-tinta text-fondo" : "text-tinta hover:bg-superficie-hundida",
                !enMes && "opacity-40",
              )}
            >
              <span className="cifras text-sm font-semibold">{format(dia, "d")}</span>
              <span
                className={cn(
                  "cifras min-h-[1.2em] text-[0.6875rem]",
                  seleccionado ? "text-fondo" : "text-tinta-suave",
                )}
              >
                {cargando || conteo === 0 ? null : conteo}
              </span>
              {esHoy && (
                <span
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-naranja"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
