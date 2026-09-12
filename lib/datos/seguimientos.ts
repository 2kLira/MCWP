/**
 * Seguimiento. La bandeja no es una tabla: es la vista v_bandeja_seguimiento, que resuelve en la
 * base la regla del spec (quiere participar, quiere información o dejó una solicitud que requiere
 * seguimiento, y su último seguimiento está pendiente o no existe).
 */

import { aplicarAlcance } from "@/lib/permisos";
import { normalizarTelefono } from "@/lib/territorio";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, esFaltaDeEsquema, lista, uno, type Resultado } from "@/lib/datos/cliente";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export type TipoSeguimiento = "llamada" | "whatsapp" | "invitacion" | "reunion" | "otro";
export type EstadoSeguimiento = "pendiente" | "en_seguimiento" | "atendido";

export type Seguimiento = {
  id: string;
  persona_id: string;
  fecha: string;
  tipo: TipoSeguimiento;
  nota: string | null;
  responsable_id: string | null;
  estado: EstadoSeguimiento;
  created_at: string;
};

export type FilaBandeja = {
  persona_id: string;
  nombre: string;
  telefono_norm: string | null;
  seccion_clave: string | null;
  demarcacion_id: number | null;
  quiere_participar: boolean;
  quiere_info: boolean;
  created_at: string;
  ultimo_seguimiento_fecha: string | null;
  ultimo_seguimiento_estado: EstadoSeguimiento | null;
  ultimo_seguimiento_tipo: TipoSeguimiento | null;
  /** Verdadero si tiene al menos una solicitud con requiere_seguimiento. La marca dura del renglón. */
  tiene_solicitud: boolean;
};

/** Por qué cayó en la bandeja: quiere participar, quiere información, o dejó una solicitud. */
export type MotivoBandeja = "participa" | "info" | "solicitud";

export type FiltrosBandeja = {
  demarcacionId?: number | null;
  seccionClave?: string | null;
  /** "sin_atender" = nunca se le ha registrado nada (ultimo_seguimiento_estado es nulo). */
  estado?: EstadoSeguimiento | "sin_atender";
  tipo?: TipoSeguimiento;
  motivo?: MotivoBandeja;
  /** Nombre o teléfono. El teléfono se compara ya normalizado. */
  texto?: string;
};

/**
 * Aplica los filtros de la pantalla encima del recorte territorial, siempre en la consulta. La
 * usan tanto `bandeja` como `totalBandeja`: si un filtro se les aplicara distinto, el conteo del
 * encabezado y la lista mostrarían números distintos.
 */
function aplicarFiltrosBandeja<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Q extends PostgrestFilterBuilder<any, any, any, any, any>,
>(consulta: Q, filtros: FiltrosBandeja): Q {
  let resultado = consulta;

  if (filtros.demarcacionId) resultado = resultado.eq("demarcacion_id", filtros.demarcacionId) as Q;
  if (filtros.seccionClave) resultado = resultado.eq("seccion_clave", filtros.seccionClave) as Q;

  if (filtros.estado === "sin_atender") {
    resultado = resultado.is("ultimo_seguimiento_estado", null) as Q;
  } else if (filtros.estado) {
    resultado = resultado.eq("ultimo_seguimiento_estado", filtros.estado) as Q;
  }

  if (filtros.tipo) resultado = resultado.eq("ultimo_seguimiento_tipo", filtros.tipo) as Q;

  if (filtros.motivo === "participa") {
    resultado = resultado.eq("quiere_participar", true) as Q;
  } else if (filtros.motivo === "info") {
    resultado = resultado.eq("quiere_info", true) as Q;
  } else if (filtros.motivo === "solicitud") {
    resultado = resultado.eq("tiene_solicitud", true) as Q;
  }

  const texto = filtros.texto?.trim();
  if (texto) {
    // El teléfono llega pegado, con espacios o con guiones: se normaliza igual que al capturarlo,
    // para que "951 100 4821" encuentre lo mismo que "9511004821".
    const telefono = normalizarTelefono(texto);
    resultado =
      telefono && telefono.length >= 4
        ? (resultado.or(`nombre.ilike.%${texto}%,telefono_norm.ilike.%${telefono}%`) as Q)
        : (resultado.ilike("nombre", `%${texto}%`) as Q);
  }

  return resultado;
}

export function bandeja(
  usuario: UsuarioActuante | null,
  filtros: FiltrosBandeja = {},
): Promise<Resultado<FilaBandeja[]>> {
  let consulta = aplicarAlcance(db().from("v_bandeja_seguimiento").select("*"), usuario);
  consulta = aplicarFiltrosBandeja(consulta, filtros);
  // Lo más viejo sin atender sale primero.
  return lista<FilaBandeja>(consulta.order("created_at", { ascending: true }));
}

/**
 * Cuántas personas hay en la bandeja con estos filtros. Se pide como conteo exacto: la consulta
 * de filas devuelve como máximo una página, así que contar el largo del arreglo daba el tope, no
 * el total.
 */
export async function totalBandeja(
  usuario: UsuarioActuante | null,
  filtros: FiltrosBandeja = {},
): Promise<Resultado<number>> {
  let consulta = aplicarAlcance(
    db().from("v_bandeja_seguimiento").select("*", { count: "exact", head: true }),
    usuario,
  );
  consulta = aplicarFiltrosBandeja(consulta, filtros);
  const { count, error } = await consulta;
  if (error) {
    return { datos: 0, sinEsquema: esFaltaDeEsquema(error), aviso: error.message };
  }
  return { datos: count ?? 0, sinEsquema: false, aviso: null };
}

export function seguimientosDePersona(personaId: string): Promise<Resultado<Seguimiento[]>> {
  return lista<Seguimiento>(
    db()
      .from("seguimientos")
      .select("*")
      .eq("persona_id", personaId)
      .order("fecha", { ascending: false }),
  );
}

export function crearSeguimiento(entrada: {
  personaId: string;
  tipo: TipoSeguimiento;
  nota?: string | null;
  responsableId?: string | null;
  estado?: EstadoSeguimiento;
}): Promise<Resultado<Seguimiento | null>> {
  return uno<Seguimiento>(
    db()
      .from("seguimientos")
      .insert({
        persona_id: entrada.personaId,
        tipo: entrada.tipo,
        nota: entrada.nota ?? null,
        responsable_id: entrada.responsableId ?? null,
        estado: entrada.estado ?? "pendiente",
      })
      .select()
      .single(),
  );
}

export function cambiarEstadoSeguimiento(
  id: string,
  estado: EstadoSeguimiento,
): Promise<Resultado<Seguimiento | null>> {
  return uno<Seguimiento>(
    db().from("seguimientos").update({ estado }).eq("id", id).select().single(),
  );
}
