/**
 * Encuestas con QR, del lado del administrador. Quién ve qué lo decide RLS (seguridad.sql,
 * sección 14): hoy solo el administrador. Lo que contesta la gente sin cuenta no pasa por aquí,
 * pasa por /api/encuestas/[codigo].
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { esAdmin } from "@/lib/puertas-ui";
import type { UsuarioActuante } from "@/lib/tipos";
import type { OpcionPregunta, PreguntaEncuesta, TipoPregunta, ValorRespuesta } from "@/lib/encuestas";
import { db, lista, resultado, uno, type Resultado } from "@/lib/datos/cliente";

export type Encuesta = {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  incluye_registro: boolean;
  mensaje_final: string | null;
  activa: boolean;
  created_at: string;
};

export type ResumenEncuesta = {
  encuesta_id: string;
  respuestas: number;
  con_datos: number;
  personas_nuevas: number;
  ultima_respuesta: string | null;
};

export type EncuestaEnLista = Encuesta & { resumen: ResumenEncuesta | null };

export type ConteoOpcion = { pregunta_id: string; valor: string; total: number };

export type RespuestaEncuesta = {
  id: string;
  created_at: string;
  respuestas: Record<string, ValorRespuesta>;
  seccion_clave: string | null;
  telefono_ya_registrado: boolean;
  persona: { id: string; nombre: string; telefono_norm: string | null } | null;
};

/** Lo que manda el editor. Sin `id` crea; con `id` edita. */
export type EntradaEncuesta = {
  id?: string;
  titulo: string;
  descripcion: string;
  incluye_registro: boolean;
  mensaje_final: string;
  /** El editor ya sabía que había respuestas. Si no lo sabía y las hay, la base rechaza. */
  congelada: boolean;
  preguntas: {
    tipo: TipoPregunta;
    texto: string;
    obligatoria: boolean;
    opciones: OpcionPregunta[];
  }[];
};

const COLUMNAS =
  "id, codigo, titulo, descripcion, incluye_registro, mensaje_final, activa, created_at";

const SOLO_ADMIN = "Solo el administrador ve las encuestas.";

export async function listarEncuestas(
  usuario: UsuarioActuante | null,
): Promise<Resultado<EncuestaEnLista[]>> {
  if (!esAdmin(usuario)) return { datos: [], sinEsquema: false, aviso: SOLO_ADMIN };
  const [encuestas, resumenes] = await Promise.all([
    lista<Encuesta>(db().from("encuestas").select(COLUMNAS).order("created_at", { ascending: false })),
    lista<ResumenEncuesta>(db().from("v_encuesta_resumen").select("*")),
  ]);
  const porId = new Map(resumenes.datos.map((r) => [r.encuesta_id, r]));
  return {
    ...encuestas,
    datos: encuestas.datos.map((e) => ({ ...e, resumen: porId.get(e.id) ?? null })),
  };
}

export type EncuestaCompleta = Encuesta & {
  preguntas: PreguntaEncuesta[];
  resumen: ResumenEncuesta | null;
};

export async function obtenerEncuesta(
  usuario: UsuarioActuante | null,
  id: string,
): Promise<Resultado<EncuestaCompleta | null>> {
  if (!esAdmin(usuario)) return { datos: null, sinEsquema: false, aviso: SOLO_ADMIN };
  const [encuesta, preguntas, resumen] = await Promise.all([
    uno<Encuesta>(db().from("encuestas").select(COLUMNAS).eq("id", id).maybeSingle()),
    lista<PreguntaEncuesta>(
      db()
        .from("encuesta_preguntas")
        .select("id, orden, tipo, texto, obligatoria, opciones")
        .eq("encuesta_id", id)
        .order("orden"),
    ),
    uno<ResumenEncuesta>(
      db().from("v_encuesta_resumen").select("*").eq("encuesta_id", id).maybeSingle(),
    ),
  ]);
  if (!encuesta.datos) return { ...encuesta, datos: null };
  return {
    ...encuesta,
    aviso: encuesta.aviso ?? preguntas.aviso,
    datos: { ...encuesta.datos, preguntas: preguntas.datos, resumen: resumen.datos },
  };
}

/** Conteo por opción. Lo cuenta la vista `v_encuesta_conteos`, no el navegador. */
export function conteosDeEncuesta(
  usuario: UsuarioActuante | null,
  id: string,
): Promise<Resultado<ConteoOpcion[]>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({ datos: [], sinEsquema: false, aviso: SOLO_ADMIN });
  }
  return lista<ConteoOpcion>(
    db().from("v_encuesta_conteos").select("pregunta_id, valor, total").eq("encuesta_id", id),
  );
}

/**
 * Las respuestas una por una, con la persona si dejó sus datos. Para las respuestas de texto
 * libre y para el CSV. Topadas: una pantalla no necesita más, y el CSV lo dice.
 */
export const TOPE_RESPUESTAS = 2000;

export function respuestasDeEncuesta(
  usuario: UsuarioActuante | null,
  id: string,
): Promise<Resultado<RespuestaEncuesta[]>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({ datos: [], sinEsquema: false, aviso: SOLO_ADMIN });
  }
  // Mismo caso que participacionesDeActividad: supabase-js tipa la relación a-uno como arreglo;
  // en tiempo de ejecución llega un objeto.
  const consulta = db()
    .from("encuesta_respuestas")
    .select(
      "id, created_at, respuestas, seccion_clave, telefono_ya_registrado, persona:personas(id, nombre, telefono_norm)",
    )
    .eq("encuesta_id", id)
    .order("created_at", { ascending: false })
    .limit(TOPE_RESPUESTAS) as unknown as PromiseLike<{
    data: RespuestaEncuesta[] | null;
    error: PostgrestError | null;
  }>;
  return lista<RespuestaEncuesta>(consulta);
}

export async function guardarEncuesta(entrada: EntradaEncuesta): Promise<Resultado<string | null>> {
  const { data, error } = await db().rpc("guardar_encuesta", { p: entrada });
  return resultado((data as string | null) ?? null, error, null);
}

export function cambiarActivaEncuesta(
  id: string,
  activa: boolean,
): Promise<Resultado<{ id: string } | null>> {
  return uno<{ id: string }>(
    db().from("encuestas").update({ activa }).eq("id", id).select("id").single(),
  );
}
