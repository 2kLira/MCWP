/**
 * Cifras del tablero. Todo lo que se puede contar se cuenta en la base con `count exact`, sin
 * traer filas al navegador. Lo único que se suma aquí son las catorce filas de
 * v_demarcacion_resumen, que ya vienen agregadas por la base.
 */

import { aplicarAlcance } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, esFaltaDeEsquema, type Resultado } from "@/lib/datos/cliente";
import { seccionesResumen } from "@/lib/datos/catalogos";
import { bandeja } from "@/lib/datos/seguimientos";

export type ResumenTablero = {
  personas: number;
  nuevasSemana: number;
  quierenParticipar: number;
  quierenInfo: number;
  responsables: number;
  reuniones: number;
  activismo: number;
  recorridos: number;
  seccionesConResponsable: number;
  seccionesSinResponsable: number;
  sinSeguimiento: number;
  porCerrar: number;
};

const VACIO: ResumenTablero = {
  personas: 0,
  nuevasSemana: 0,
  quierenParticipar: 0,
  quierenInfo: 0,
  responsables: 0,
  reuniones: 0,
  activismo: 0,
  recorridos: 0,
  seccionesConResponsable: 0,
  seccionesSinResponsable: 0,
  sinSeguimiento: 0,
  porCerrar: 0,
};

function haceDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return f.toISOString();
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

async function contar(
  usuario: UsuarioActuante | null,
  tabla: string,
  ajustar?: (c: ReturnType<typeof armar>) => ReturnType<typeof armar>,
): Promise<{ total: number; sinEsquema: boolean }> {
  const base = armar(tabla);
  const consulta = aplicarAlcance(ajustar ? ajustar(base) : base, usuario);
  const { count, error } = await consulta;
  return { total: count ?? 0, sinEsquema: esFaltaDeEsquema(error) };
}

function armar(tabla: string) {
  return db().from(tabla).select("*", { count: "exact", head: true });
}

export async function resumenTablero(
  usuario: UsuarioActuante | null,
): Promise<Resultado<ResumenTablero>> {
  const [
    personas,
    nuevas,
    participar,
    info,
    reuniones,
    activismo,
    recorridos,
    porCerrar,
    secciones,
    porAtender,
  ] = await Promise.all([
    contar(usuario, "personas"),
    contar(usuario, "personas", (c) => c.gte("created_at", haceDias(7))),
    contar(usuario, "personas", (c) => c.eq("quiere_participar", true)),
    contar(usuario, "personas", (c) => c.eq("quiere_info", true)),
    contar(usuario, "actividades", (c) => c.eq("tipo", "reunion").eq("estatus", "realizada")),
    contar(usuario, "actividades", (c) => c.eq("tipo", "activismo").eq("estatus", "realizada")),
    contar(usuario, "actividades", (c) => c.eq("tipo", "recorrido").eq("estatus", "realizada")),
    // Por cerrar: las que ya empezaron, o las programadas cuya fecha ya pasó.
    contar(usuario, "actividades", (c) =>
      c.or(`estatus.eq.en_curso,and(estatus.eq.programada,fecha.lt.${hoy()})`),
    ),
    seccionesResumen(usuario),
    bandeja(usuario),
  ]);

  // Las secciones ya vienen recortadas al territorio del actuante, así que aquí solo se separan
  // las que tienen responsable de las que no.
  const conResponsable = secciones.datos.filter((s) => s.responsable_id).length;
  const sinResponsable = secciones.datos.length - conResponsable;

  const sinEsquema = personas.sinEsquema || secciones.sinEsquema;
  if (sinEsquema) return { datos: VACIO, sinEsquema: true, aviso: "La base todavía no tiene datos." };

  return {
    datos: {
      personas: personas.total,
      nuevasSemana: nuevas.total,
      quierenParticipar: participar.total,
      quierenInfo: info.total,
      responsables: conResponsable,
      reuniones: reuniones.total,
      activismo: activismo.total,
      recorridos: recorridos.total,
      seccionesConResponsable: conResponsable,
      seccionesSinResponsable: sinResponsable,
      sinSeguimiento: porAtender.datos.length,
      porCerrar: porCerrar.total,
    },
    sinEsquema: false,
    aviso: null,
  };
}
