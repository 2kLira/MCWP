/**
 * Reporte semanal. Se cuenta en la base, una consulta contada por semana, en lugar de traer las
 * filas al navegador para agruparlas aquí.
 */

import { aplicarAlcance } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, type Resultado } from "@/lib/datos/cliente";

export type SemanaReporte = {
  etiqueta: string;
  inicio: string;
  personas: number;
  actividades: number;
};

function lunesDeHace(semanas: number): Date {
  const f = new Date();
  f.setHours(0, 0, 0, 0);
  // Lunes de la semana en curso.
  const dia = (f.getDay() + 6) % 7;
  f.setDate(f.getDate() - dia - semanas * 7);
  return f;
}

export async function reporteSemanal(
  usuario: UsuarioActuante | null,
  semanas = 10,
): Promise<Resultado<SemanaReporte[]>> {
  const rangos = Array.from({ length: semanas }, (_, i) => {
    const inicio = lunesDeHace(semanas - 1 - i);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 7);
    return { inicio, fin };
  });

  const consultas = rangos.flatMap(({ inicio, fin }) => [
    aplicarAlcance(
      db().from("personas").select("*", { count: "exact", head: true }),
      usuario,
    )
      .gte("created_at", inicio.toISOString())
      .lt("created_at", fin.toISOString()),
    aplicarAlcance(
      db().from("actividades").select("*", { count: "exact", head: true }),
      usuario,
    )
      .eq("estatus", "realizada")
      .gte("fecha", inicio.toISOString().slice(0, 10))
      .lt("fecha", fin.toISOString().slice(0, 10)),
  ]);

  const respuestas = await Promise.all(consultas);
  if (respuestas[0]?.error) {
    return { datos: [], sinEsquema: true, aviso: "La base todavía no tiene datos." };
  }

  return {
    datos: rangos.map(({ inicio }, i) => ({
      etiqueta: inicio.toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
      inicio: inicio.toISOString().slice(0, 10),
      personas: respuestas[i * 2]?.count ?? 0,
      actividades: respuestas[i * 2 + 1]?.count ?? 0,
    })),
    sinEsquema: false,
    aviso: null,
  };
}
