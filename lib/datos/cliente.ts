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

/** Código propio para "la aplicación se desplegó sin las variables de Supabase". */
export const SIN_CONFIGURACION = "SIN_CONFIGURACION";

const ERROR_SIN_CONFIGURACION: PostgrestError = {
  name: "SinConfiguracion",
  message:
    "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en este despliegue.",
  code: SIN_CONFIGURACION,
  details: "",
  hint: "",
  toJSON() {
    return { ...this };
  },
} as PostgrestError;

/**
 * Sustituto del cliente cuando no hay configuración. Acepta cualquier cadena de métodos, como
 * `db().from("x").select().eq(...)`, y al esperarla devuelve el error de configuración en lugar
 * de reventar a media construcción de la consulta.
 */
function consultaVacia(): unknown {
  const manejador: ProxyHandler<Record<string, unknown>> = {
    get(_destino, propiedad) {
      if (propiedad === "then") {
        return (resolver: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: ERROR_SIN_CONFIGURACION, count: null }).then(
            resolver,
          );
      }
      if (propiedad === "catch" || propiedad === "finally") {
        return () => proxy;
      }
      return () => proxy;
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, manejador);
  return proxy;
}

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

  if (error.code === SIN_CONFIGURACION) {
    if (!yaAvisado) {
      yaAvisado = true;
      console.error(
        "Este despliegue no tiene NEXT_PUBLIC_SUPABASE_URL ni NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
          "Agrégalas en las variables de entorno del proyecto y vuelve a desplegar: se incrustan " +
          "al compilar, así que no basta con guardarlas.",
      );
    }
    return {
      datos: vacio,
      sinEsquema: true,
      aviso: "Este despliegue no está conectado a la base de datos.",
    };
  }

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

/**
 * Punto de entrada de toda consulta. Si el despliegue no trae las variables de Supabase,
 * devuelve un sustituto que responde el error de configuración sin lanzar.
 */
export function db() {
  const real = clienteSupabase();
  if (real) return real;
  return { from: () => consultaVacia(), rpc: () => consultaVacia() } as unknown as NonNullable<
    ReturnType<typeof clienteSupabase>
  >;
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
