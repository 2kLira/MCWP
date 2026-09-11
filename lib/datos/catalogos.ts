/**
 * Catálogos y agregados territoriales. Son las consultas que comparten todas las pantallas.
 * Las cifras salen de las vistas de la base, nunca de sumas hechas en el navegador.
 */

import { aplicarAlcance, aplicarAlcanceDemarcacion, puedeVerSeccion } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, lista, type Resultado } from "@/lib/datos/cliente";
import { cargarSecciones } from "@/lib/territorio";

export type Problematica = {
  id: number;
  nombre: string;
  orden: number;
  activa: boolean;
};

export type ColoniaBreve = {
  id: number;
  nombre: string;
  cp: string | null;
  demarcacion_principal_id: number | null;
};

export type SeccionResumen = {
  clave: string;
  numero: number;
  demarcacion_id: number;
  demarcacion: string;
  es_sustituta: boolean;
  responsable_id: string | null;
  responsable: string | null;
  personas: number;
  quieren_participar: number;
  quieren_info: number;
  reuniones: number;
  activismo: number;
  recorridos: number;
  ultima_actividad: string | null;
  proxima_actividad: string | null;
  promovidos: number;
  aspirantes_representante: number;
  /* Fase B/C · la sección como unidad de meta. Nulos legítimos: la lista nominal y la meta de
   * votos llegan por Excel del cliente y todavía no están cargadas para todas las secciones. */
  lista_nominal: number | null;
  meta_votos: number | null;
  prioridad: "A" | "B" | null;
  /** Falso en las seis sustitutas: geometría de referencia que ya no está en el catálogo del
   *  cliente. No entran en sumas de lista nominal ni de meta, para no contar territorio de más. */
  en_catalogo: boolean;
  /** Ya tiene al menos un recorrido en estatus realizada. Esa es toda la definición. */
  recorrida: boolean;
  casillas: number;
};

/**
 * Resumen por colonia, partido por demarcación y sección: 28 colonias cruzan demarcaciones, y
 * agrupar solo por colonia obligaría a decidir a qué territorio se le cuenta cada persona. Con
 * esta forma, aplicarAlcance recorta sin inventar nada; quien ve todo el municipio suma los
 * renglones por colonia.
 */
export type ColoniaResumen = {
  colonia_id: number;
  colonia: string;
  demarcacion_id: number | null;
  seccion_clave: string | null;
  personas: number;
  quieren_participar: number;
  quieren_info: number;
  promovidos: number;
  aspirantes_representante: number;
};

export type DemarcacionResumen = {
  demarcacion_id: number;
  demarcacion: string;
  slug: string;
  centro_lat: number | null;
  centro_lng: number | null;
  secciones: number;
  secciones_con_responsable: number;
  secciones_sin_responsable: number;
  personas: number;
  quieren_participar: number;
  quieren_info: number;
  reuniones: number;
  activismo: number;
  recorridos: number;
  ultima_actividad: string | null;
  proxima_actividad: string | null;
};

export function problematicas(): Promise<Resultado<Problematica[]>> {
  return lista<Problematica>(
    db().from("problematicas").select("*").eq("activa", true).order("orden"),
  );
}

/**
 * Colonias para el autocompletado del registro. Es capa de referencia, nunca fuente de verdad
 * territorial: si la colonia y la sección se contradicen, gana la sección.
 */
export function coloniasDeSeccion(
  seccionClave: string,
): Promise<Resultado<ColoniaBreve[]>> {
  return lista<ColoniaBreve>(
    db()
      .from("colonia_seccion")
      .select("traslape_pct, colonias!inner(id, nombre, cp, demarcacion_principal_id)")
      .eq("seccion_clave", seccionClave)
      .order("traslape_pct", { ascending: false })
      .then(({ data, error }) => ({
        data:
          (data as { colonias: ColoniaBreve }[] | null)?.map((f) => f.colonias) ??
          null,
        error,
      })),
  );
}

/** Una colonia dentro de la ficha de una sección, con qué tanto de la sección ocupa. */
export type ColoniaDeSeccion = {
  colonia_id: number;
  colonia: string;
  cp: string | null;
  traslape_pct: number;
};

/**
 * Colonias que integran una sección, ordenadas de mayor a menor traslape: primero la que ocupa
 * más territorio de la sección. Es el reemplazo de la capa de colonias que se retira del mapa: el
 * dato vive en la ficha, no en una capa aparte.
 *
 * Se recorta por territorio con `puedeVerSeccion` en vez de `aplicarAlcance` porque
 * `colonia_seccion` no lleva `demarcacion_id` propio; la sección ya viene elegida de una lista que
 * el usuario alcanza a ver, así que esto es una comprobación de cierre, no el primer filtro.
 */
export function coloniasDeSeccionConTraslape(
  usuario: UsuarioActuante | null,
  seccionClave: string,
  demarcacionId?: number | null,
): Promise<Resultado<ColoniaDeSeccion[]>> {
  if (!puedeVerSeccion(usuario, seccionClave, demarcacionId)) {
    return Promise.resolve({ datos: [], sinEsquema: false, aviso: null });
  }
  return lista<ColoniaDeSeccion>(
    db()
      .from("colonia_seccion")
      .select("colonia_id, traslape_pct, colonias!inner(nombre, cp)")
      .eq("seccion_clave", seccionClave)
      .order("traslape_pct", { ascending: false })
      .then(({ data, error }) => ({
        data:
          (
            data as
              | { colonia_id: number; traslape_pct: number; colonias: { nombre: string; cp: string | null } }[]
              | null
          )?.map((f) => ({
            colonia_id: f.colonia_id,
            colonia: f.colonias.nombre,
            cp: f.colonias.cp,
            traslape_pct: f.traslape_pct,
          })) ?? null,
        error,
      })),
  );
}

/**
 * Claves de sección que sí tienen polígono en la cartografía cacheada (secciones.geojson). Sirve
 * para distinguir, dentro del catálogo, las 18 secciones que el reseccionamiento del INE dejó sin
 * geometría publicada: siguen en el catálogo y en las cifras, solo no se pintan todavía en el
 * mapa. No hay columna en la base para esto porque es un dato de la cartografía, no de la fase B.
 */
export async function clavesConGeometria(): Promise<Resultado<Set<string>>> {
  try {
    const coleccion = await cargarSecciones();
    const claves = new Set(coleccion.features.map((f) => f.properties.clave));
    return { datos: claves, sinEsquema: false, aviso: null };
  } catch (error) {
    return {
      datos: new Set<string>(),
      sinEsquema: false,
      aviso: error instanceof Error ? error.message : "No se pudo cargar la cartografía.",
    };
  }
}

export function buscarColonias(
  texto: string,
  limite = 8,
): Promise<Resultado<ColoniaBreve[]>> {
  return lista<ColoniaBreve>(
    db()
      .from("colonias")
      .select("id, nombre, cp, demarcacion_principal_id")
      .ilike("nombre", `%${texto}%`)
      .order("nombre")
      .limit(limite),
  );
}

/**
 * Resumen por sección, ya recortado al territorio del usuario actuante.
 *
 * `opciones.prioridad` filtra por secciones prioritarias A o B, para el listado de la fase C.
 * Se pide a la base con `.eq`, no se filtra después en el navegador.
 */
export function seccionesResumen(
  usuario: UsuarioActuante | null,
  opciones: { prioridad?: "A" | "B" } = {},
): Promise<Resultado<SeccionResumen[]>> {
  let consulta = db().from("v_seccion_resumen").select("*");
  if (opciones.prioridad) consulta = consulta.eq("prioridad", opciones.prioridad);
  return lista<SeccionResumen>(
    aplicarAlcance(consulta, usuario, { seccion: "clave" }).order("clave"),
  );
}

/**
 * Resumen por colonia, demarcación y sección a la vez, ya recortado al territorio del usuario
 * actuante. Cada renglón es la porción de una colonia dentro de una sección; una colonia partida
 * entre demarcaciones aparece en varios renglones. Devuelve vacío sin tronar si la vista todavía
 * no existe.
 */
export function coloniaResumen(
  usuario: UsuarioActuante | null,
): Promise<Resultado<ColoniaResumen[]>> {
  const consulta = db().from("v_colonia_resumen").select("*");
  return lista<ColoniaResumen>(aplicarAlcance(consulta, usuario).order("colonia"));
}

/** Resumen por demarcación, recortado igual. */
export function demarcacionesResumen(
  usuario: UsuarioActuante | null,
): Promise<Resultado<DemarcacionResumen[]>> {
  const consulta = db().from("v_demarcacion_resumen").select("*");
  return lista<DemarcacionResumen>(
    aplicarAlcanceDemarcacion(consulta, usuario).order("personas", { ascending: false }),
  );
}

export type MencionPorSeccion = {
  clave: string;
  demarcacion_id: number;
  problematica_id: number;
  problematica: string;
  menciones: number;
};

export function problematicasPorSeccion(
  usuario: UsuarioActuante | null,
): Promise<Resultado<MencionPorSeccion[]>> {
  const consulta = db().from("v_problematicas_por_seccion").select("*");
  return lista<MencionPorSeccion>(
    aplicarAlcance(consulta, usuario, { seccion: "clave" }).order("menciones", {
      ascending: false,
    }),
  );
}
