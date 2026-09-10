/**
 * Catálogos y agregados territoriales. Son las consultas que comparten todas las pantallas.
 * Las cifras salen de las vistas de la base, nunca de sumas hechas en el navegador.
 */

import { aplicarAlcance, aplicarAlcanceDemarcacion } from "@/lib/permisos";
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

/** Resumen por sección, ya recortado al territorio del usuario actuante. */
export function seccionesResumen(
  usuario: UsuarioActuante | null,
): Promise<Resultado<SeccionResumen[]>> {
  const consulta = db().from("v_seccion_resumen").select("*");
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
