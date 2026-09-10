/**
 * Acceso a personas. Todo recorte territorial sale de lib/permisos.ts.
 */

import { aplicarAlcance, puedeEditar, puedeVerRegistro } from "@/lib/permisos";
import { normalizarTelefono } from "@/lib/territorio";
import type { Genero, UsuarioActuante } from "@/lib/tipos";
import { db, lista, resultado, uno, type Resultado } from "@/lib/datos/cliente";

export type Persona = {
  id: string;
  nombre: string;
  telefono_norm: string | null;
  telefono_raw: string | null;
  calle: string | null;
  colonia_id: number | null;
  seccion_clave: string | null;
  demarcacion_id: number | null;
  lat: number | null;
  lng: number | null;
  origen_ubicacion: "gps" | "mapa" | "manual" | null;
  quiere_participar: boolean;
  quiere_info: boolean;
  aviso_version: string | null;
  consentimiento_en: string | null;
  registrada_por: string | null;
  actividad_origen: string | null;
  created_at: string;
  genero: Genero | null;
  fecha_nacimiento: string | null;
  es_promovido: boolean;
  promovido_en: string | null;
  promovido_por: string | null;
  quiere_ser_representante: boolean;
};

export type PersonaEnLista = Pick<
  Persona,
  | "id"
  | "nombre"
  | "telefono_norm"
  | "calle"
  | "colonia_id"
  | "seccion_clave"
  | "demarcacion_id"
  | "quiere_participar"
  | "quiere_info"
  | "created_at"
  | "genero"
  | "fecha_nacimiento"
  | "es_promovido"
  | "quiere_ser_representante"
>;

export type FiltrosPersonas = {
  demarcacionId?: number | null;
  seccionClave?: string | null;
  quiereParticipar?: boolean;
  quiereInfo?: boolean;
  texto?: string;
  promovido?: boolean;
  representante?: boolean;
  genero?: Genero | null;
};

const COLUMNAS_LISTA =
  "id, nombre, telefono_norm, calle, colonia_id, seccion_clave, demarcacion_id, quiere_participar, quiere_info, created_at, genero, fecha_nacimiento, es_promovido, quiere_ser_representante";

export async function listarPersonas(
  usuario: UsuarioActuante | null,
  filtros: FiltrosPersonas = {},
  rango: { desde?: number; limite?: number } = {},
): Promise<Resultado<{ filas: PersonaEnLista[]; total: number }>> {
  const desde = rango.desde ?? 0;
  const limite = rango.limite ?? 100;

  let consulta = db()
    .from("personas")
    .select(COLUMNAS_LISTA, { count: "exact" });

  consulta = aplicarAlcance(consulta, usuario);

  // Los filtros de la pantalla se aplican encima del recorte, nunca en su lugar.
  if (filtros.demarcacionId) consulta = consulta.eq("demarcacion_id", filtros.demarcacionId);
  if (filtros.seccionClave) consulta = consulta.eq("seccion_clave", filtros.seccionClave);
  if (filtros.quiereParticipar) consulta = consulta.eq("quiere_participar", true);
  if (filtros.quiereInfo) consulta = consulta.eq("quiere_info", true);
  if (filtros.promovido) consulta = consulta.eq("es_promovido", true);
  if (filtros.representante) consulta = consulta.eq("quiere_ser_representante", true);
  if (filtros.genero) consulta = consulta.eq("genero", filtros.genero);

  const texto = filtros.texto?.trim();
  if (texto) {
    const digitos = texto.replace(/\D/g, "");
    consulta =
      digitos.length >= 4
        ? consulta.or(`nombre.ilike.%${texto}%,telefono_norm.ilike.%${digitos}%`)
        : consulta.ilike("nombre", `%${texto}%`);
  }

  const { data, error, count } = await consulta
    .order("created_at", { ascending: false })
    .range(desde, desde + limite - 1);

  return resultado(
    { filas: (data ?? []) as PersonaEnLista[], total: count ?? 0 },
    error,
    { filas: [], total: 0 },
  );
}

export async function obtenerPersona(
  usuario: UsuarioActuante | null,
  id: string,
): Promise<Resultado<Persona | null>> {
  const r = await uno<Persona>(
    db().from("personas").select("*").eq("id", id).maybeSingle(),
  );
  if (r.datos && !puedeVerRegistro(usuario, r.datos)) {
    return { datos: null, sinEsquema: false, aviso: "Esta persona está fuera de tu territorio." };
  }
  return r;
}

export type EventoHistorial = {
  persona_id: string;
  evento: string;
  detalle: string | null;
  fecha: string;
  actividad_id: string | null;
  actividad: string | null;
  tipo_actividad: string | null;
  usuario_id: string | null;
  usuario: string | null;
  nota: string | null;
  created_at: string;
};

export function historialPersona(id: string): Promise<Resultado<EventoHistorial[]>> {
  return lista<EventoHistorial>(
    db()
      .from("v_historial_persona")
      .select("*")
      .eq("persona_id", id)
      .order("fecha", { ascending: false }),
  );
}

/**
 * Detección de duplicado del registro rápido. A propósito NO se recorta por territorio: si el
 * teléfono ya existe en otra demarcación hay que enterarse igual, porque si no se crearía un
 * duplicado y la llave de deduplicación dejaría de servir.
 */
export function buscarPorTelefono(
  telefonoNormalizado: string,
): Promise<Resultado<Persona | null>> {
  return uno<Persona>(
    db().from("personas").select("*").eq("telefono_norm", telefonoNormalizado).maybeSingle(),
  );
}

/** Aviso suave cuando no hay teléfono. Nunca bloquea. */
export function coincidenciasPorNombre(
  nombre: string,
  seccionClave: string | null,
): Promise<Resultado<PersonaEnLista[]>> {
  let consulta = db().from("personas").select(COLUMNAS_LISTA).ilike("nombre", `%${nombre}%`);
  if (seccionClave) consulta = consulta.eq("seccion_clave", seccionClave);
  return lista<PersonaEnLista>(consulta.limit(5));
}

export type EntradaPersona = {
  nombre: string;
  telefono_raw?: string | null;
  calle?: string | null;
  colonia_id?: number | null;
  seccion_clave?: string | null;
  demarcacion_id?: number | null;
  lat?: number | null;
  lng?: number | null;
  origen_ubicacion?: "gps" | "mapa" | "manual" | null;
  quiere_participar?: boolean;
  quiere_info?: boolean;
  aviso_version?: string | null;
  consentimiento_en?: string | null;
  registrada_por?: string | null;
  actividad_origen?: string | null;
  genero?: Genero | null;
  fecha_nacimiento?: string | null;
  es_promovido?: boolean;
  quiere_ser_representante?: boolean;
};

export function crearPersona(entrada: EntradaPersona): Promise<Resultado<Persona | null>> {
  const fila: Record<string, unknown> = {
    ...entrada,
    // El teléfono normalizado es la llave de deduplicación y lo calcula el sistema, no el usuario.
    telefono_norm: normalizarTelefono(entrada.telefono_raw),
  };
  // La fecha de promoción no se le pide a nadie: se sella sola en el momento del alta.
  if (entrada.es_promovido) {
    fila.promovido_en = new Date().toISOString();
  }
  // crearPersona no recibe el actuante en su firma actual, así que promovido_por se queda sin
  // llenar aquí; lo pone marcarPromovido, que sí conoce quién marca.
  return uno<Persona>(db().from("personas").insert(fila).select().single());
}

export async function actualizarPersona(
  usuario: UsuarioActuante | null,
  id: string,
  cambios: Partial<EntradaPersona>,
): Promise<Resultado<Persona | null>> {
  const actual = await obtenerPersona(usuario, id);
  if (!actual.datos || !puedeEditar(usuario, "persona", actual.datos)) {
    return { datos: null, sinEsquema: false, aviso: "No puedes editar esta persona." };
  }
  const fila: Record<string, unknown> = { ...cambios };
  if (cambios.telefono_raw !== undefined) {
    fila.telefono_norm = normalizarTelefono(cambios.telefono_raw);
  }
  return uno<Persona>(db().from("personas").update(fila).eq("id", id).select().single());
}

/**
 * Marca o desmarca a una persona como promovida. Va aparte de actualizarPersona porque, a
 * diferencia de un cambio de datos cualquiera, aquí el sistema sella quién y cuándo: no se le pide
 * al usuario ninguna de las dos cosas.
 */
export async function marcarPromovido(
  usuario: UsuarioActuante | null,
  id: string,
  valor: boolean,
): Promise<Resultado<Persona | null>> {
  const actual = await obtenerPersona(usuario, id);
  if (!actual.datos || !puedeEditar(usuario, "persona", actual.datos)) {
    return { datos: null, sinEsquema: false, aviso: "No puedes editar esta persona." };
  }
  const fila = valor
    ? {
        es_promovido: true,
        promovido_en: new Date().toISOString(),
        promovido_por: usuario?.id ?? null,
      }
    : { es_promovido: false, promovido_en: null, promovido_por: null };
  return uno<Persona>(db().from("personas").update(fila).eq("id", id).select().single());
}
