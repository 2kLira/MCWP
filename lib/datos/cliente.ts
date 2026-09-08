/**
 * Cimiento de todo el acceso a datos.
 *
 * Reglas de la casa, en orden de importancia:
 *
 * 1. Todo recorte por territorio sale de lib/permisos.ts. Aquí se llama `aplicarAlcance`, no se
 *    escriben condiciones de demarcación ni de sección a mano, y en los componentes tampoco.
 * 2. Las agregaciones se piden a las vistas de la base, no se arman en el navegador.
 * 3. Mientras la base no tenga esquema, las consultas no truenan: devuelven vacío y avisan una vez
 *    en la consola. La maqueta se tiene que poder recorrer aunque nadie haya aplicado schema.sql.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { clienteSupabase } from "@/lib/supabase";

export type Resultado<T> = {
  datos: T;
  /** Verdadero cuando la base todavía no tiene el esquema aplicado. */
  sinEsquema: boolean;
  /** Mensaje para mostrar en un estado vacío, si algo salió mal. */
  aviso: string | null;
};

/** Códigos de Postgres para "la tabla o la vista no existe" y "la función no existe". */
const CODIGOS_SIN_ESQUEMA = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

let yaAvisado = false;

export function esFaltaDeEsquema(error: PostgrestError | null): boolean {
  if (!error) return false;
  return CODIGOS_SIN_ESQUEMA.has(error.code);
}

export function resultado<T>(
  datos: T,
  error: PostgrestError | null,
  vacio: T,
): Resultado<T> {
  if (!error) return { datos, sinEsquema: false, aviso: null };

  if (esFaltaDeEsquema(error)) {
    if (!yaAvisado) {
      yaAvisado = true;
      console.warn(
        "La base todavía no tiene el esquema. Aplica supabase/schema.sql en el editor SQL de " +
          "Supabase y luego corre npm run db:importar y npm run db:sembrar.",
      );
    }
    return {
      datos: vacio,
      sinEsquema: true,
      aviso: "La base todavía no tiene datos cargados.",
    };
  }

  console.error(error);
  return { datos: vacio, sinEsquema: false, aviso: error.message };
}

export function db() {
  return clienteSupabase();
}

/** Azúcar para las consultas que devuelven una lista. */
export async function lista<T>(
  consulta: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<Resultado<T[]>> {
  const { data, error } = await consulta;
  return resultado(data ?? [], error, []);
}

/** Azúcar para las consultas que devuelven una fila o ninguna. */
export async function uno<T>(
  consulta: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
): Promise<Resultado<T | null>> {
  const { data, error } = await consulta;
  return resultado(data ?? null, error, null);
}
