/**
 * Cálculos sobre la ficha de una persona. Nada de lo que aquí se calcula se le pide al capturista:
 * la edad sale de la fecha de nacimiento, y el cumpleaños sale de la misma fecha.
 */

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
