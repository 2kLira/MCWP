/**
 * Reportes del territorio: problemas o necesidades que el brigadista levanta en la calle y que
 * aparecen en el mapa hasta que se marcan como atendidos.
 *
 * Qué ve cada quien lo decide RLS (supabase/seguridad.sql, sección 11): el administrador todos,
 * cualquier otro rol solo los suyos. Aquí no se filtra por rol.
 */

import { db, resultado, uno, type Resultado } from "@/lib/datos/cliente";
import { borrarArchivos } from "@/lib/datos/almacenamiento";

export type CategoriaReporte =
  | "calles_pavimento"
  | "banquetas_accesibilidad"
  | "alumbrado_publico"
  | "drenaje"
  | "basura_limpieza"
  | "canchas_espacios_deportivos"
  | "parques_jardines"
  | "senderos_seguros"
  | "pasos_peatonales"
  | "senalizacion_transito"
  | "transporte_publico"
  | "arbolado_medio_ambiente"
  | "riesgos_via_publica";

export type ReporteTerritorio = {
  id: string;
  categoria: CategoriaReporte;
  descripcion: string;
  lat: number;
  lng: number;
  created_at: string;
  /** La sellan la base y el GPS; null si el punto cayó fuera de toda sección. */
  seccion_clave: string | null;
  /** Ruta de la foto en la cubeta `fotos`, o null si se levantó sin foto. Se firma al mostrarla. */
  foto_ruta: string | null;
  /** El nombre de quien lo levantó. Null si RLS no deja leer a ese usuario. */
  autor: { nombre: string } | null;
};

/**
 * Lo único que se manda es lo que el brigadista eligió y escribió, más la coordenada del GPS.
 * Autor, fecha, sección y demarcación los sella la base: aunque se mandaran, se ignorarían.
 */
export type ReporteNuevo = {
  categoria: CategoriaReporte;
  descripcion: string;
  lat: number;
  lng: number;
  precision_m: number | null;
  /** La ruta que devolvió `subirFotoReporte`. El trigger exige que sea de la carpeta propia. */
  foto_ruta: string | null;
};

export function levantarReporte(reporte: ReporteNuevo): Promise<Resultado<{ id: string } | null>> {
  return uno<{ id: string }>(
    db().from("reportes_territorio").insert(reporte).select("id").single(),
  );
}

/** Los pendientes, para pintarlos en el mapa. Los atendidos no se piden. */
export async function reportesPendientes(): Promise<Resultado<ReporteTerritorio[]>> {
  const { data, error } = await db()
    .from("reportes_territorio")
    .select(
      "id, categoria, descripcion, lat, lng, created_at, seccion_clave, foto_ruta, autor:usuarios!reportes_territorio_levantado_por_fkey(nombre)",
    )
    .eq("atendido", false)
    .order("created_at", { ascending: false })
    .limit(2000);
  // Sin tipos generados, supabase-js cree que el embebido es un arreglo; con la llave foránea
  // hacia un solo usuario, PostgREST devuelve un objeto.
  return resultado((data ?? []) as unknown as ReporteTerritorio[], error, []);
}

/**
 * Marcar como atendido. Solo el administrador: la política de UPDATE lo exige, y el trigger deja
 * tocar únicamente `atendido`, así que esta llamada no puede cambiar nada más del reporte.
 *
 * Si RLS lo rechaza, PostgREST no da error: devuelve cero renglones. Por eso se pide el renglón
 * de vuelta y la ausencia se traduce en aviso.
 */
export async function marcarReporteAtendido(id: string): Promise<Resultado<boolean>> {
  const { data, error } = await db()
    .from("reportes_territorio")
    .update({ atendido: true })
    .eq("id", id)
    .select("id");
  const r = resultado(data ?? [], error, []);
  if (r.aviso) return { datos: false, sinEsquema: r.sinEsquema, aviso: r.aviso };
  if (r.datos.length === 0) {
    return {
      datos: false,
      sinEsquema: false,
      aviso: "No se pudo marcar como atendido. Solo el administrador puede hacerlo.",
    };
  }
  return { datos: true, sinEsquema: false, aviso: null };
}

/**
 * Borrar un reporte, con su foto. Solo el administrador: lo exige `reportes_territorio_delete` y,
 * para la foto, `almacen_fotos_delete`. Se borra de verdad, no hay papelera.
 *
 * Primero el renglón y después el archivo, en ese orden: si el archivo no se puede borrar, queda
 * suelto en la cubeta sin nadie que lo enlace y solo el administrador lo alcanza. Al revés, un
 * fallo dejaría un reporte apuntando a una foto que ya no existe.
 *
 * Igual que al marcar atendido, si RLS lo rechaza PostgREST devuelve cero renglones sin error.
 */
export async function borrarReporte(id: string): Promise<Resultado<boolean>> {
  const { data, error } = await db()
    .from("reportes_territorio")
    .delete()
    .eq("id", id)
    .select("id, foto_ruta");
  const r = resultado((data ?? []) as { id: string; foto_ruta: string | null }[], error, []);
  if (r.aviso) return { datos: false, sinEsquema: r.sinEsquema, aviso: r.aviso };
  if (r.datos.length === 0) {
    return {
      datos: false,
      sinEsquema: false,
      aviso: "No se pudo borrar el reporte. Solo el administrador puede hacerlo.",
    };
  }
  const fotos = r.datos.map((f) => f.foto_ruta).filter((f): f is string => f != null);
  await borrarArchivos(fotos);
  return { datos: true, sinEsquema: false, aviso: null };
}
