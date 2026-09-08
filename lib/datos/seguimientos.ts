/**
 * Seguimiento. La bandeja no es una tabla: es la vista v_bandeja_seguimiento, que resuelve en la
 * base la regla del spec (quiere participar o quiere información, y su último seguimiento está
 * pendiente o no existe).
 */

import { aplicarAlcance } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, esFaltaDeEsquema, lista, uno, type Resultado } from "@/lib/datos/cliente";

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
};

export function bandeja(usuario: UsuarioActuante | null): Promise<Resultado<FilaBandeja[]>> {
  const consulta = aplicarAlcance(
    db().from("v_bandeja_seguimiento").select("*"),
    usuario,
  );
  // Lo más viejo sin atender sale primero.
  return lista<FilaBandeja>(consulta.order("created_at", { ascending: true }));
}

/**
 * Cuántas personas hay en la bandeja. Se pide como conteo exacto: la consulta de filas devuelve
 * como máximo una página, así que contar el largo del arreglo daba el tope, no el total.
 */
export async function totalBandeja(
  usuario: UsuarioActuante | null,
): Promise<Resultado<number>> {
  const consulta = aplicarAlcance(
    db().from("v_bandeja_seguimiento").select("*", { count: "exact", head: true }),
    usuario,
  );
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
