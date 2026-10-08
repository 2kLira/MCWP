/**
 * Catálogos y agregados territoriales. Son las consultas que comparten todas las pantallas.
 * Las cifras salen de las vistas de la base, nunca de sumas hechas en el navegador.
 */

import type { UsuarioActuante } from "@/lib/tipos";
import { db, lista, type Resultado } from "@/lib/datos/cliente";

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
  /** Personas de la sección que recibieron apoyo (migración de la rama soet). */
  apoyos: number;
  /* Fase B/C · la sección como unidad de meta. Nulos legítimos: la lista nominal y la meta de
   * votos llegan por Excel del cliente y todavía no están cargadas para todas las secciones. */
  lista_nominal: number | null;
  meta_votos: number | null;
  prioridad: "A" | "B" | null;
  /** Falso en las seis sustitutas: geometría de referencia que ya no está en el catálogo del
   *  cliente. No entran en sumas de lista nominal ni de meta, para no contar territorio de más. */
  en_catalogo: boolean;
  /** Si la sección tiene polígono publicado. Lo dice la base, derivado de secciones_geom. */
  tiene_geometria: boolean;
  /** Ya tiene al menos un recorrido en estatus realizada. Esa es toda la definición. */
  recorrida: boolean;
  casillas: number;
};

/**
 * Resumen por colonia, partido por demarcación y sección: 28 colonias cruzan demarcaciones, y
 * agrupar solo por colonia obligaría a decidir a qué territorio se le cuenta cada persona. Con
 * esta forma, RLS recorta sin inventar nada; quien ve todo el municipio suma los
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
  /* Sumados por la vista, no en el navegador. Solo cuentan las secciones del catálogo. */
  lista_nominal: number;
  meta_votos: number | null;
  promovidos: number;
  secciones_prioritarias_a: number;
  secciones_prioritarias_a_recorridas: number;
  secciones_prioritarias_b: number;
  secciones_prioritarias_b_recorridas: number;
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
 */
export function coloniasDeSeccionConTraslape(
  usuario: UsuarioActuante | null,
  seccionClave: string,
  demarcacionId?: number | null,
): Promise<Resultado<ColoniaDeSeccion[]>> {
  // `usuario` ya no recorta —eso lo hace RLS— pero se conserva en la firma porque es la
  // dependencia de useConsulta que redispara al cambiar de identidad. No lo quites.
  void usuario;
  void demarcacionId;
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
 * **Solo las 169 del catálogo.** Las 6 sustitutas quedaron en la base con `en_catalogo = false`
 * para no perder su geometría, pero el cliente pidió que no se cuenten: sus sucesoras ya están en
 * el catálogo y contarlas a las dos sería contar la misma gente dos veces. El filtro va aquí, en
 * un solo lugar, para que el mapa, el tablero y los listados no puedan discrepar.
 *
 * `opciones.prioridad` filtra por secciones prioritarias A o B, para el listado de la fase C.
 * Se pide a la base con `.eq`, no se filtra después en el navegador.
 */
export function seccionesResumen(
  usuario: UsuarioActuante | null,
  opciones: { prioridad?: "A" | "B" } = {},
): Promise<Resultado<SeccionResumen[]>> {
  let consulta = db().from("v_seccion_resumen").select("*").eq("en_catalogo", true);
  if (opciones.prioridad) consulta = consulta.eq("prioridad", opciones.prioridad);
  return lista<SeccionResumen>(
    consulta.order("clave"),
  );
}

/**
 * Resumen por colonia, demarcación y sección a la vez. El recorte lo hace RLS sobre la vista,
 * que es security_invoker. Cada renglón es la porción de una colonia dentro de una sección; una colonia partida
 * entre demarcaciones aparece en varios renglones. Devuelve vacío sin tronar si la vista todavía
 * no existe.
 */
export function coloniaResumen(
  usuario: UsuarioActuante | null,
): Promise<Resultado<ColoniaResumen[]>> {
  // `usuario` ya no recorta —eso lo hace RLS— pero se conserva en la firma porque es la
  // dependencia de useConsulta que redispara al cambiar de identidad. No lo quites.
  void usuario;
  const consulta = db().from("v_colonia_resumen").select("*");
  return lista<ColoniaResumen>(consulta.order("colonia"));
}

/** Resumen por demarcación. El recorte lo hace RLS. */
export function demarcacionesResumen(
  usuario: UsuarioActuante | null,
): Promise<Resultado<DemarcacionResumen[]>> {
  // `usuario` ya no recorta —eso lo hace RLS— pero se conserva en la firma porque es la
  // dependencia de useConsulta que redispara al cambiar de identidad. No lo quites.
  void usuario;
  const consulta = db().from("v_demarcacion_resumen").select("*");
  return lista<DemarcacionResumen>(
    consulta.order("personas", { ascending: false }),
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
  // `usuario` ya no recorta —eso lo hace RLS— pero se conserva en la firma porque es la
  // dependencia de useConsulta que redispara al cambiar de identidad. No lo quites.
  void usuario;
  const consulta = db().from("v_problematicas_por_seccion").select("*");
  return lista<MencionPorSeccion>(
    consulta.order("menciones", { ascending: false }),
  );
}
