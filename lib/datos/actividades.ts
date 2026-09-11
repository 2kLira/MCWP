/**
 * Reunión, activismo, recorrido y crucero son una sola entidad con una columna `tipo`.
 * El cierre lo consolida el sistema: el responsable únicamente escribe la conclusión.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { aplicarAlcance, puedeEditar } from "@/lib/permisos";
import type { EstatusActividad, TipoActividad, UsuarioActuante } from "@/lib/tipos";
import { db, lista, resultado, uno, type Resultado } from "@/lib/datos/cliente";

export type Actividad = {
  id: string;
  tipo: TipoActividad;
  nombre: string;
  fecha: string;
  hora: string | null;
  direccion: string | null;
  colonia_id: number | null;
  seccion_clave: string | null;
  demarcacion_id: number | null;
  lat: number | null;
  lng: number | null;
  responsable_id: string | null;
  objetivo: string | null;
  notas: string | null;
  estatus: EstatusActividad;
  asistentes_aprox: number | null;
  conclusion: string | null;
  cerrada_en: string | null;
  cerrada_por: string | null;
  created_by: string | null;
  created_at: string;
};

export type FiltrosActividades = {
  tipo?: TipoActividad;
  estatus?: EstatusActividad;
  desde?: string;
  hasta?: string;
};

export function listarActividades(
  usuario: UsuarioActuante | null,
  filtros: FiltrosActividades = {},
): Promise<Resultado<Actividad[]>> {
  let consulta = aplicarAlcance(db().from("actividades").select("*"), usuario);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.estatus) consulta = consulta.eq("estatus", filtros.estatus);
  if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
  return lista<Actividad>(consulta.order("fecha", { ascending: false }));
}

export function actividadesDeAgenda(
  usuario: UsuarioActuante | null,
  desde: string,
  hasta: string,
): Promise<Resultado<Actividad[]>> {
  const consulta = aplicarAlcance(db().from("actividades").select("*"), usuario);
  return lista<Actividad>(
    consulta
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .neq("estatus", "cancelada")
      .order("fecha")
      .order("hora", { nullsFirst: false }),
  );
}

export function obtenerActividad(id: string): Promise<Resultado<Actividad | null>> {
  return uno<Actividad>(db().from("actividades").select("*").eq("id", id).maybeSingle());
}

export type EntradaActividad = Partial<Omit<Actividad, "id" | "created_at">> & {
  tipo: TipoActividad;
  nombre: string;
  fecha: string;
};

export function crearActividad(entrada: EntradaActividad): Promise<Resultado<Actividad | null>> {
  return uno<Actividad>(db().from("actividades").insert(entrada).select().single());
}

export async function actualizarActividad(
  usuario: UsuarioActuante | null,
  id: string,
  cambios: Partial<EntradaActividad>,
): Promise<Resultado<Actividad | null>> {
  const actual = await obtenerActividad(id);
  if (!actual.datos || !puedeEditar(usuario, "actividad", actual.datos)) {
    return { datos: null, sinEsquema: false, aviso: "No puedes editar esta actividad." };
  }
  return uno<Actividad>(db().from("actividades").update(cambios).eq("id", id).select().single());
}

/** Transiciones que tienen sentido. Lo demás se rechaza con un aviso, no con un error crudo. */
const TRANSICIONES: Record<EstatusActividad, readonly EstatusActividad[]> = {
  programada: ["en_curso", "realizada", "cancelada"],
  en_curso: ["realizada", "cancelada"],
  realizada: [],
  cancelada: ["programada"],
};

export async function cambiarEstatus(
  usuario: UsuarioActuante | null,
  id: string,
  estatus: EstatusActividad,
): Promise<Resultado<Actividad | null>> {
  const actual = await obtenerActividad(id);
  if (!actual.datos) return { datos: null, sinEsquema: actual.sinEsquema, aviso: "No existe." };
  if (!puedeEditar(usuario, "actividad", actual.datos)) {
    return { datos: null, sinEsquema: false, aviso: "No puedes mover esta actividad." };
  }
  if (!TRANSICIONES[actual.datos.estatus].includes(estatus)) {
    return {
      datos: null,
      sinEsquema: false,
      aviso: `No se puede pasar de ${actual.datos.estatus} a ${estatus}.`,
    };
  }
  return uno<Actividad>(
    db().from("actividades").update({ estatus }).eq("id", id).select().single(),
  );
}

/** Al cerrar, lo único que escribe el responsable es la conclusión. */
export async function cerrarActividad(
  usuario: UsuarioActuante | null,
  id: string,
  conclusion: string,
): Promise<Resultado<Actividad | null>> {
  const actual = await obtenerActividad(id);
  if (!actual.datos || !puedeEditar(usuario, "actividad", actual.datos)) {
    return { datos: null, sinEsquema: false, aviso: "No puedes cerrar esta actividad." };
  }
  return uno<Actividad>(
    db()
      .from("actividades")
      .update({
        estatus: "realizada",
        conclusion,
        cerrada_en: new Date().toISOString(),
        cerrada_por: usuario?.id ?? null,
      })
      .eq("id", id)
      .select()
      .single(),
  );
}

export type Consolidado = {
  asistentes: number;
  nuevas: number;
  quierenParticipar: number;
  quierenInfo: number;
  menciones: { problematica: string; menciones: number }[];
};

/**
 * Los conteos del cierre. Nada de esto se le pregunta a nadie: se cuenta en la base.
 */
export async function consolidadoDeActividad(id: string): Promise<Resultado<Consolidado>> {
  const vacio: Consolidado = {
    asistentes: 0,
    nuevas: 0,
    quierenParticipar: 0,
    quierenInfo: 0,
    menciones: [],
  };

  const { data, error } = await db()
    .from("participaciones")
    .select("id, tipo, personas!inner(quiere_participar, quiere_info)")
    .eq("actividad_id", id);

  if (error) return resultado(vacio, error, vacio);

  type Fila = { id: string; tipo: string; personas: { quiere_participar: boolean; quiere_info: boolean } };
  const filas = (data ?? []) as unknown as Fila[];

  const menciones = await db()
    .from("menciones_problematica")
    .select("problematicas!inner(nombre), participaciones!inner(actividad_id)")
    .eq("participaciones.actividad_id", id);

  const conteo = new Map<string, number>();
  for (const fila of (menciones.data ?? []) as unknown as {
    problematicas: { nombre: string };
  }[]) {
    const nombre = fila.problematicas.nombre;
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }

  return {
    datos: {
      asistentes: filas.length,
      nuevas: filas.filter((f) => f.tipo === "registro").length,
      quierenParticipar: filas.filter((f) => f.personas?.quiere_participar).length,
      quierenInfo: filas.filter((f) => f.personas?.quiere_info).length,
      menciones: [...conteo.entries()]
        .map(([problematica, menciones]) => ({ problematica, menciones }))
        .sort((a, b) => b.menciones - a.menciones),
    },
    sinEsquema: false,
    aviso: null,
  };
}

export type ParticipacionEnLista = {
  id: string;
  tipo: "registro" | "asistencia";
  persona_id: string;
  personas: { nombre: string; telefono_norm: string | null } | null;
};

export function participacionesDeActividad(
  actividadId: string,
): Promise<Resultado<ParticipacionEnLista[]>> {
  // supabase-js tipa la relación a-uno como arreglo; en tiempo de ejecución llega un objeto.
  const consulta = db()
    .from("participaciones")
    .select("id, tipo, persona_id, personas(nombre, telefono_norm)")
    .eq("actividad_id", actividadId)
    .order("created_at") as unknown as PromiseLike<{
    data: ParticipacionEnLista[] | null;
    error: PostgrestError | null;
  }>;
  return lista<ParticipacionEnLista>(consulta);
}

/**
 * Registra la participación y cuelga de ella las menciones de problemáticas. Cuelgan de la
 * participación, no de la persona, para que cada mención conserve su actividad y su fecha.
 */
export async function registrarParticipacion(entrada: {
  personaId: string;
  actividadId: string;
  tipo: "registro" | "asistencia";
  registradaPor?: string | null;
  problematicas?: { id: number; comentario?: string | null }[];
}): Promise<Resultado<{ id: string } | null>> {
  const { data, error } = await db()
    .from("participaciones")
    .upsert(
      {
        persona_id: entrada.personaId,
        actividad_id: entrada.actividadId,
        tipo: entrada.tipo,
        registrada_por: entrada.registradaPor ?? null,
      },
      { onConflict: "persona_id,actividad_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error) return resultado(null, error, null);

  if (entrada.problematicas?.length) {
    await db()
      .from("menciones_problematica")
      .upsert(
        entrada.problematicas.map((p) => ({
          participacion_id: data.id,
          problematica_id: p.id,
          comentario: p.comentario ?? null,
        })),
        { onConflict: "participacion_id,problematica_id" },
      );
  }

  return { datos: data, sinEsquema: false, aviso: null };
}

export type Foto = {
  id: string;
  actividad_id: string | null;
  url: string;
  subida_por: string | null;
  created_at: string;
};

export function fotosDeActividad(actividadId: string): Promise<Resultado<Foto[]>> {
  return lista<Foto>(
    db().from("fotos").select("*").eq("actividad_id", actividadId).order("created_at"),
  );
}

export function agregarFoto(entrada: {
  actividadId: string;
  url: string;
  subidaPor?: string | null;
}): Promise<Resultado<Foto | null>> {
  return uno<Foto>(
    db()
      .from("fotos")
      .insert({
        actividad_id: entrada.actividadId,
        url: entrada.url,
        subida_por: entrada.subidaPor ?? null,
      })
      .select()
      .single(),
  );
}

export function agregarBrigadista(actividadId: string, usuarioId: string) {
  return db().from("actividad_brigadistas").upsert({
    actividad_id: actividadId,
    usuario_id: usuarioId,
  });
}

export function quitarBrigadista(actividadId: string, usuarioId: string) {
  return db()
    .from("actividad_brigadistas")
    .delete()
    .eq("actividad_id", actividadId)
    .eq("usuario_id", usuarioId);
}
