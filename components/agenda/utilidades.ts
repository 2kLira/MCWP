/**
 * Formato compartido entre las vistas de la agenda. Las cuentas de fechas salen de date-fns.
 */

import { es } from "date-fns/locale";
import { format } from "date-fns";
import type { Actividad } from "@/lib/datos/actividades";

export function hoyISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function aISO(fecha: Date): string {
  return format(fecha, "yyyy-MM-dd");
}

export function tituloDia(fechaISO: string): string {
  return format(new Date(`${fechaISO}T12:00:00`), "EEEE d 'de' MMMM", { locale: es });
}

export function horaCorta(hora: string | null): string {
  if (!hora) return "Sin hora";
  return hora.slice(0, 5);
}

/** Agrupa una lista ya ordenada por fecha en bloques por día, conservando el orden. */
export function agruparPorDia(actividades: readonly Actividad[]): [string, Actividad[]][] {
  const grupos = new Map<string, Actividad[]>();
  for (const actividad of actividades) {
    const grupo = grupos.get(actividad.fecha);
    if (grupo) grupo.push(actividad);
    else grupos.set(actividad.fecha, [actividad]);
  }
  return [...grupos.entries()];
}
