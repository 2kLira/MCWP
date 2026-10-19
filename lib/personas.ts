/**
 * Cálculos sobre la ficha de una persona. Nada de lo que aquí se calcula se le pide al capturista:
 * la edad sale de la fecha de nacimiento, y el cumpleaños sale de la misma fecha.
 */

import { ETIQUETA_RANGO_EDAD, RANGOS_EDAD, type RangoEdad } from "@/lib/tipos";

/** Convierte lo que venga de la base (date de Postgres, cadena o Date) a una fecha local. */
function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;

  // Postgres devuelve 'AAAA-MM-DD'. Construirla a mano evita que se corra un día por zona horaria.
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!partes) return null;
  const fecha = new Date(
    Number(partes[1]),
    Number(partes[2]) - 1,
    Number(partes[3]),
  );
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Edad cumplida hoy, o null si no hay fecha de nacimiento. Nunca se guarda: siempre se calcula. */
export function edadDesde(
  fechaNacimiento: string | Date | null | undefined,
): number | null {
  const nacimiento = aFecha(fechaNacimiento);
  if (!nacimiento) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;

  return edad >= 0 && edad < 130 ? edad : null;
}

/** True si hoy es el cumpleaños. Compara mes y día, igual que la vista v_cumpleanos_hoy. */
export function cumpleHoy(
  fechaNacimiento: string | Date | null | undefined,
): boolean {
  const nacimiento = aFecha(fechaNacimiento);
  if (!nacimiento) return false;

  const hoy = new Date();
  return (
    nacimiento.getMonth() === hoy.getMonth() &&
    nacimiento.getDate() === hoy.getDate()
  );
}

/** Texto corto para la ficha: "34 años" o cadena vacía si no hay fecha. */
export function etiquetaEdad(
  fechaNacimiento: string | Date | null | undefined,
): string {
  const edad = edadDesde(fechaNacimiento);
  if (edad === null) return "";
  return `${edad} ${edad === 1 ? "año" : "años"}`;
}

type PartesNombre = {
  nombre: string;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
};

/**
 * Orden de padrón: apellido paterno, materno y nombre, con reglas del español (á = a, ñ después
 * de n). Quien se registró antes de las tres partes (o por carga masiva) no tiene apellidos
 * separados: va con su nombre completo en "Nombre(s)" y se ordena al final, no al principio.
 */
const ORDEN_ES = new Intl.Collator("es", { sensitivity: "base" });

export function compararPadron(a: PartesNombre, b: PartesNombre): number {
  if (!a.apellido_paterno !== !b.apellido_paterno) return a.apellido_paterno ? -1 : 1;
  const ka = [a.apellido_paterno, a.apellido_materno, a.nombres ?? a.nombre];
  const kb = [b.apellido_paterno, b.apellido_materno, b.nombres ?? b.nombre];
  for (let i = 0; i < ka.length; i++) {
    const c = ORDEN_ES.compare(ka[i] ?? "", kb[i] ?? "");
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * Rangos del filtro de edad de la lista de personas: los mismos de los contactos sin datos, más
 * los menores de 18, porque el sistema registra gente en general y no solo a quien vota.
 */
export type RangoEdadFiltro = RangoEdad | "menor_18";

export const RANGOS_EDAD_FILTRO: readonly RangoEdadFiltro[] = ["menor_18", ...RANGOS_EDAD];

export const ETIQUETA_RANGO_EDAD_FILTRO: Record<RangoEdadFiltro, string> = {
  menor_18: "Menores de 18",
  ...ETIQUETA_RANGO_EDAD,
};

const EDADES: Record<RangoEdadFiltro, [number, number | null]> = {
  menor_18: [0, 17],
  "18_29": [18, 29],
  "30_44": [30, 44],
  "45_59": [45, 59],
  "60_mas": [60, null],
};

/** Hoy menos tantos años, como 'AAAA-MM-DD' local. El 29 de febrero cae al 1 de marzo. */
function haceAnios(anios: number): string {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear() - anios, hoy.getMonth(), hoy.getDate());
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/**
 * Un rango de edad traducido a fechas de nacimiento, para que lo filtre la base y no la pantalla.
 * Tener entre `min` y `max` años cumplidos es haber nacido a lo más hace `min` años y después de
 * hace `max + 1` años. Quien no tiene fecha de nacimiento no cae en ningún rango.
 */
export function nacimientoParaRango(rango: RangoEdadFiltro): {
  nacidoHasta: string;
  nacidoDespuesDe: string | null;
} {
  const [min, max] = EDADES[rango];
  return {
    nacidoHasta: haceAnios(min),
    nacidoDespuesDe: max === null ? null : haceAnios(max + 1),
  };
}
