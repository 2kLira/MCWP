import type { UsuarioActuante } from "@/lib/tipos";

/**
 * Los cuatro usuarios entre los que cambia el conmutador de rol. Son datos sembrados, no personas
 * reales. Mientras la base no tenga usuarios cargados, esta lista es la que alimenta el
 * conmutador; después se reemplaza por la consulta a la tabla usuarios sin tocar la interfaz.
 *
 * Los identificadores son uuid fijos para que la selección sobreviva a recargas.
 */
export const ACTUANTES: readonly UsuarioActuante[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    nombre: "Dirección general",
    rol: "admin",
    demarcacionId: null,
    seccionClave: null,
    activo: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    nombre: "Responsable de Santa Rosa Panzacola",
    rol: "resp_demarcacion",
    demarcacionId: 13,
    seccionClave: null,
    activo: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    nombre: "Responsable de la sección 0473",
    rol: "resp_seccion",
    demarcacionId: 13,
    seccionClave: "0473",
    activo: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    nombre: "Brigadista de San Martín Mexicapam",
    rol: "brigadista",
    demarcacionId: 12,
    seccionClave: null,
    activo: true,
  },
] as const;

export const ACTUANTE_INICIAL = ACTUANTES[0];
