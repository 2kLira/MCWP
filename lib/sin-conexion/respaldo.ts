/**
 * Lo último que se leyó de la base, para que la captura arranque sin señal.
 *
 * Solo para lo poco que el formulario de registro necesita leer antes de capturar: quién es el
 * usuario, sus actividades abiertas y el catálogo de problemáticas. **No es una réplica de la
 * base** ni debe crecer hacia eso: aquí no entra ninguna persona del padrón. Lo que se guarda son
 * datos que el propio usuario ya alcanzaba a leer con su permiso, y se borran al cerrar sesión.
 *
 * Va en localStorage y no en IndexedDB porque son unos cuantos kilobytes que se leen al pintar.
 */

import type { Resultado } from "@/lib/datos/cliente";
import type { UsuarioActuante } from "@/lib/tipos";

const PREFIJO = "soet:";
const CLAVE_ACTUANTE = `${PREFIJO}actuante`;

function leer<T>(clave: string): T | undefined {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo === null ? undefined : (JSON.parse(crudo) as T);
  } catch {
    return undefined;
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Navegación privada o almacenamiento lleno: sin respaldo, la pantalla sigue funcionando
    // igual que antes, con red.
  }
}

/**
 * Corre la consulta; si contesta bien, guarda lo que trajo, y si falla, devuelve lo último que
 * se guardó. Sin nada guardado, devuelve el fallo tal cual, con su aviso.
 *
 * Cae al respaldo ante **cualquier** fallo y no solo ante la falta de red, a propósito: con una
 * conexión que se cae a medias el error llega como sesión vencida o como tiempo agotado, y
 * distinguirlos aquí no cambiaría nada. Lo que se capture con un dato viejo lo vuelve a juzgar
 * la base al enviarlo.
 */
export async function conRespaldo<T>(
  clave: string,
  consulta: () => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  const r = await consulta();
  const llave = `${PREFIJO}respaldo:${clave}`;
  if (!r.aviso && !r.sinEsquema) {
    escribir(llave, r.datos);
    return r;
  }
  const guardado = leer<T>(llave);
  return guardado === undefined ? r : { datos: guardado, sinEsquema: false, aviso: null };
}

/**
 * Deja guardado algo que llegó por otra consulta. ElegirActividad lo usa para que cada actividad
 * de la lista se pueda abrir sin señal aunque nunca se haya leído sola.
 */
export function sembrarRespaldo(clave: string, valor: unknown) {
  escribir(`${PREFIJO}respaldo:${clave}`, valor);
}

/** Quién entró por última vez en este teléfono. Lo escribe el proveedor de identidad. */
export function guardarActuante(actuante: UsuarioActuante) {
  escribir(CLAVE_ACTUANTE, actuante);
}

export function actuanteGuardado(): UsuarioActuante | null {
  return leer<UsuarioActuante>(CLAVE_ACTUANTE) ?? null;
}

/** Al cerrar sesión. Las capturas pendientes se borran aparte, en la cola. */
export function borrarRespaldos() {
  try {
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith(PREFIJO)) localStorage.removeItem(clave);
    }
  } catch {
    // Igual que en escribir.
  }
}
