/**
 * Cimiento de todo el acceso a datos.
 *
 * Reglas de la casa, en orden de importancia:
 *
 * 1. **Aquí no se recorta nada.** El recorte lo hace Row Level Security, en supabase/seguridad.sql.
 *    No se escriben condiciones de demarcación ni de sección a mano, ni aquí ni en los componentes.
 *    Si una pantalla necesita menos datos, se le piden menos a la base; no se traen todos y se
 *    filtran después.
 * 2. Las agregaciones se piden a las vistas de la base, no se arman en el navegador. Las vistas
 *    llevan `security_invoker`, así que respetan las políticas de quien consulta.
 * 3. Las consultas no truenan: devuelven vacío y avisan. Falta de configuración, falta de esquema
 *    o rechazo de política degradan la pantalla, nunca la tumban.
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

/**
 * Códigos ya avisados en la consola. Es un conjunto y no un booleano a propósito: con un booleano,
 * el primer aviso silenciaba todos los demás, así que un rechazo de política tapaba una sesión
 * caducada y nadie se enteraba del segundo problema.
 */
const yaAvisados = new Set<string>();

function avisarUnaVez(codigo: string, mensaje: string) {
  if (yaAvisados.has(codigo)) return;
  yaAvisados.add(codigo);
  console.warn(mensaje);
}

export function esFaltaDeEsquema(error: PostgrestError | null): boolean {
  if (!error) return false;
  return CODIGOS_SIN_ESQUEMA.has(error.code);
}

/**
 * Traducción de lo que contesta la base a algo que se pueda leer en pantalla.
 *
 * Reglas de redacción, que no se negocian:
 *
 * - Ningún mensaje nombra una tabla, una política, un código, ni la palabra "RLS". Lo que piensa
 *   Postgres va a la consola; en pantalla va qué hacer.
 * - Lo desconocido **no se tapa** con una frase amable. Si el código no está aquí, se muestra el
 *   mensaje original y el objeto completo va a la consola: tragarse lo desconocido es cómo un
 *   error se esconde una semana.
 *
 * Devuelve null cuando no hay traducción, para que quien llama decida.
 */
function mensajeDeError(error: PostgrestError): string | null {
  switch (error.code) {
    case "42501":
      // Dos cosas distintas comparten este código. Una política que rechaza la escritura dice
      // "new row violates row-level security policy". El rol anon sin acceso al esquema dice
      // "permission denied", y eso solo pasa cuando la sesión se cayó.
      return /permission denied/i.test(error.message)
        ? "Tu sesión terminó. Vuelve a entrar."
        : "No tienes permiso para guardar esto.";

    case "PGRST301":
      return "Tu sesión terminó. Vuelve a entrar.";

    // El más traicionero de todos. Pasa con .insert().select().single(): el renglón SÍ se escribió,
    // pero la política de lectura no lo alcanza, y PostgREST contesta "no encontré ninguno". Decir
    // "no se pudo guardar" aquí hace que alguien capture a la misma persona tres veces.
    //
    // El mensaje da por hecho que fue una escritura, y hoy eso es cierto: se revisó uno por uno y
    // **todos** los `.single()` del proyecto están sobre insert, update o upsert; las lecturas usan
    // `maybeSingle()`, que devuelve null sin error. Si alguien agrega una lectura con `.single()`,
    // este mensaje se vuelve mentira y hay que partirlo en dos.
    case "PGRST116":
      return "Se guardó, pero con tu permiso no se puede volver a leer.";

    case "23505":
      return "Ya existe un registro con ese dato.";

    case "23503":
      return "La sección o la actividad de este registro no existe en la base.";

    case "23514":
      return "Algún dato no cumple el formato que espera la base.";

    case "22P02":
      return "Un dato llegó con un formato que la base no entiende.";

    default:
      return null;
  }
}

/**
 * @param contexto Frase que dice **qué hacer**, añadida al mensaje traducido. La pasan las
 *   funciones de escritura, porque solo ellas saben qué se estaba intentando.
 */
export function resultado<T>(
  datos: T,
  error: PostgrestError | null,
  vacio: T,
  contexto?: string,
): Resultado<T> {
  if (!error) return { datos, sinEsquema: false, aviso: null };

  if (error.code === SIN_CONFIGURACION) {
    avisarUnaVez(
      error.code,
      "Este despliegue no tiene NEXT_PUBLIC_SUPABASE_URL ni NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Agrégalas en las variables de entorno del proyecto y vuelve a desplegar: se incrustan " +
        "al compilar, así que no basta con guardarlas.",
    );
    return {
      datos: vacio,
      sinEsquema: true,
      aviso: "Este despliegue no está conectado a la base de datos.",
    };
  }

  if (esFaltaDeEsquema(error)) {
    avisarUnaVez(
      error.code,
      "La base todavía no tiene el esquema. Aplica supabase/schema.sql y supabase/seguridad.sql " +
        "en el editor SQL de Supabase, y luego corre npm run db:importar.",
    );
    return {
      datos: vacio,
      sinEsquema: true,
      aviso: "La base todavía no tiene datos cargados.",
    };
  }

  const traducido = mensajeDeError(error);
  if (traducido) {
    // A la consola va el detalle, para quien depura. A la pantalla, la traducción.
    avisarUnaVez(error.code, `[${error.code}] ${error.message}`);
    return {
      datos: vacio,
      sinEsquema: false,
      aviso: contexto ? `${traducido} ${contexto}` : traducido,
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
  contexto?: string,
): Promise<Resultado<T[]>> {
  const { data, error } = await consulta;
  return resultado(data ?? [], error, [], contexto);
}

/** Azúcar para las consultas que devuelven una fila o ninguna. */
export async function uno<T>(
  consulta: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  contexto?: string,
): Promise<Resultado<T | null>> {
  const { data, error } = await consulta;
  return resultado(data ?? null, error, null, contexto);
}
