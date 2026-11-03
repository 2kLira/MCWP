/**
 * Contactos sin datos: la gente que no quiso dejar su nombre ni su teléfono. Cuentan en la
 * actividad, en la sección y en las problemáticas, pero no son personas del padrón.
 *
 * Qué ve cada quien lo decide RLS (supabase/seguridad.sql, sección 12). La sección, la
 * demarcación, quién capturó y cuándo los sella la base; el punto llega ya difuminado y la base
 * lo vuelve a difuminar.
 *
 * El alta vive en lib/datos/capturas.ts, junto con la del registro rápido, porque pasa por la cola
 * del teléfono.
 */

import { db, resultado, type Resultado } from "@/lib/datos/cliente";
import type { Genero, RangoEdad } from "@/lib/tipos";

/** Cuántos contactos sin datos hay, con lo que RLS deje ver. */
export async function totalContactosAnonimos(
  filtro: { actividadId?: string } = {},
): Promise<number> {
  let consulta = db().from("contactos_anonimos").select("*", { count: "exact", head: true });
  if (filtro.actividadId) consulta = consulta.eq("actividad_id", filtro.actividadId);
  const { count, error } = await consulta;
  if (error) console.error(error);
  return count ?? 0;
}

/** Un contacto sin datos tal como lo pinta el mapa. El punto ya es el centro de su celda. */
export type ContactoAnonimo = {
  id: string;
  lat: number;
  lng: number;
  seccion_clave: string | null;
  genero: Genero | null;
  rango_edad: RangoEdad | null;
  peticion: string | null;
  comentario: string | null;
  created_at: string;
  problematicas: string[];
};

/**
 * Una celda del mapa con todos sus contactos. Como el punto guardado es el centro de la celda,
 * los contactos de una misma zona comparten coordenada exacta y se agrupan sin calcular nada.
 */
export type CeldaSinDatos = {
  id: string;
  lat: number;
  lng: number;
  seccionClave: string | null;
  contactos: ContactoAnonimo[];
  conPeticion: number;
};

/** Los contactos que tienen punto, con lo que RLS deje ver. Más recientes primero. */
export async function listarContactosAnonimos(): Promise<Resultado<ContactoAnonimo[]>> {
  const { data, error } = await db()
    .from("contactos_anonimos")
    .select(
      "id, lat, lng, seccion_clave, genero, rango_edad, peticion, comentario, created_at, " +
        "menciones_anonimas(problematicas(nombre))",
    )
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("created_at", { ascending: false });

  type Fila = Omit<ContactoAnonimo, "problematicas"> & {
    menciones_anonimas: { problematicas: { nombre: string } | null }[] | null;
  };
  const filas = ((data ?? []) as unknown as Fila[]).map(({ menciones_anonimas, ...resto }) => ({
    ...resto,
    problematicas: (menciones_anonimas ?? [])
      .map((m) => m.problematicas?.nombre)
      .filter((n): n is string => !!n),
  }));
  return resultado(filas, error, []);
}

/** Junta los contactos por celda. La celda más concurrida va primero. */
export function agruparPorCelda(contactos: readonly ContactoAnonimo[]): CeldaSinDatos[] {
  const celdas = new Map<string, CeldaSinDatos>();
  for (const c of contactos) {
    const id = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
    let celda = celdas.get(id);
    if (!celda) {
      celda = { id, lat: c.lat, lng: c.lng, seccionClave: c.seccion_clave, contactos: [], conPeticion: 0 };
      celdas.set(id, celda);
    }
    celda.contactos.push(c);
    if (c.peticion) celda.conPeticion++;
  }
  return [...celdas.values()].sort((a, b) => b.contactos.length - a.contactos.length);
}
