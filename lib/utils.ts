export { cn } from "cn"

/**
 * La fecha del calendario local, "AAAA-MM-DD", para comparar contra columnas `date`.
 *
 * No usar `toISOString().slice(0, 10)` para esto: da la fecha en UTC, que en Oaxaca ya es mañana
 * desde las 18:00. Con eso las actividades de hoy salían como "por cerrar" en la noche y el
 * registro dejaba poner como nacimiento la fecha de mañana. Ver también `public.hoy_oaxaca()`.
 */
export function fechaLocalIso(fecha: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}
