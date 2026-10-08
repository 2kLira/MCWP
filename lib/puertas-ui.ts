/**
 * Puertas de interfaz.
 *
 * Esto es **cosmética**. Oculta botones y pantallas para que nadie toque lo que va a rebotar, y
 * para que cada rol vea una aplicación que se le parece. **No es seguridad.**
 *
 * La seguridad vive en `supabase/seguridad.sql` y nada más ahí: Row Level Security decide en cada
 * consulta quién alcanza qué. Si una regla de este archivo no coincide con una política, **gana la
 * política** y lo que se corrige es este archivo.
 *
 * Qué NO va aquí, nunca más: filtrar consultas. Si una pantalla necesita menos datos, se le piden
 * menos a la base; no se traen todos y se recortan después. Este archivo reemplazó a
 * `lib/permisos.ts`, que hacía las dos cosas a la vez y competía con las políticas.
 */

import type { EstatusActividad, RolUsuario, UsuarioActuante } from "@/lib/tipos";

/* ---------------------------------------------------------------------------
 * Alcance, solo para texto y prellenado
 * ------------------------------------------------------------------------- */

export type Alcance =
  | { tipo: "todo" }
  | { tipo: "demarcacion"; demarcacionId: number }
  | { tipo: "seccion"; seccionClave: string; demarcacionId: number | null }
  | { tipo: "ninguno" };

/**
 * El territorio asignado al usuario. Ya **no** recorta nada: sirve para poner etiquetas, para
 * prellenar la sección de un formulario y para centrar el mapa donde a esa persona le importa.
 *
 * Ojo con el brigadista: su alcance real no es un territorio, son las actividades a las que lo
 * inviten. Si trae territorio asignado se usa como pista de dónde centrar el mapa, y nada más.
 */
export function alcanceDe(usuario: UsuarioActuante | null): Alcance {
  if (!usuario || !usuario.activo) return { tipo: "ninguno" };

  switch (usuario.rol) {
    case "admin":
      return { tipo: "todo" };

    case "resp_demarcacion":
      return usuario.demarcacionId
        ? { tipo: "demarcacion", demarcacionId: usuario.demarcacionId }
        : { tipo: "ninguno" };

    case "resp_seccion":
    case "brigadista":
      if (usuario.seccionClave) {
        return {
          tipo: "seccion",
          seccionClave: usuario.seccionClave,
          demarcacionId: usuario.demarcacionId,
        };
      }
      return usuario.demarcacionId
        ? { tipo: "demarcacion", demarcacionId: usuario.demarcacionId }
        : { tipo: "ninguno" };
  }
}

/**
 * Texto corto de hasta dónde llega esta persona.
 *
 * Al brigadista no se le dice un territorio aunque tenga uno asignado, porque sería mentirle: lo
 * que de verdad alcanza son las actividades a las que lo inviten.
 */
export function etiquetaAlcance(
  usuario: UsuarioActuante | null,
  nombreDemarcacion?: string | null,
): string {
  if (usuario?.rol === "brigadista") return "Las actividades a las que te inviten";

  const alcance = alcanceDe(usuario);
  switch (alcance.tipo) {
    case "todo":
      return "Todo el municipio";
    case "demarcacion":
      return nombreDemarcacion ?? "Su demarcación";
    case "seccion":
      return `Sección ${alcance.seccionClave}`;
    case "ninguno":
      return "Sin territorio asignado";
  }
}

/* ---------------------------------------------------------------------------
 * Qué botones se pintan
 * ------------------------------------------------------------------------- */

/** Tipo interno: no se exporta porque los call sites pasan literales. */
type Entidad =
  | "persona"
  | "actividad"
  | "seguimiento"
  | "usuario"
  | "asignacion"
  | "foto";

const CREA: Record<Entidad, readonly RolUsuario[]> = {
  // Registrar gente en la calle es el corazón del sistema: lo hacen todos, incluido el brigadista.
  persona: ["admin", "resp_demarcacion", "resp_seccion", "brigadista"],
  foto: ["admin", "resp_demarcacion", "resp_seccion", "brigadista"],
  actividad: ["admin", "resp_demarcacion", "resp_seccion"],
  seguimiento: ["admin", "resp_demarcacion", "resp_seccion"],
  usuario: ["admin"],
  asignacion: ["admin"],
};

const EDITA: Record<Entidad, readonly RolUsuario[]> = {
  // El brigadista entra en esta lista porque la política `personas_brigadista_corrige` le permite
  // corregir lo que él capturó. Antes no estaba, y la interfaz le escondía un botón que la base sí
  // le habría dejado usar: la puerta de la aplicación era más estricta que la de la base.
  persona: ["admin", "resp_demarcacion", "resp_seccion", "brigadista"],
  foto: ["admin", "resp_demarcacion", "resp_seccion"],
  actividad: ["admin", "resp_demarcacion", "resp_seccion"],
  seguimiento: ["admin", "resp_demarcacion", "resp_seccion"],
  usuario: ["admin"],
  asignacion: ["admin"],
};

/**
 * Nota sobre lo que se quitó aquí: antes esto exigía que `alcanceDe` no fuera "ninguno". Con RLS
 * eso es incorrecto y además era un error visible: el acceso del brigadista viene de la invitación
 * a una actividad, no de un territorio asignado, y los brigadistas se dan de alta sin territorio.
 * Con la condición vieja se quedaban sin el botón de registrar, que es lo único que van a tocar.
 */
export function puedeCrear(usuario: UsuarioActuante | null, entidad: Entidad): boolean {
  if (!usuario || !usuario.activo) return false;
  return CREA[entidad].includes(usuario.rol);
}

/**
 * Si el rol puede editar ese tipo de cosa. Solo el rol: ya no se compara territorio.
 *
 * Para personas hay una pregunta más fina, `puedeEditarPersona`, porque la política no mira el
 * territorio sino quién capturó el renglón.
 */
export function puedeEditar(usuario: UsuarioActuante | null, entidad: Entidad): boolean {
  if (!usuario || !usuario.activo) return false;
  return EDITA[entidad].includes(usuario.rol);
}

/**
 * Quién puede corregir a una persona. Comprueba **propiedad, no territorio**, porque eso es lo que
 * dice `personas_brigadista_corrige`: el admin corrige a cualquiera; el brigadista, solo lo que él
 * capturó, y solo mientras su actividad siga abierta (eso último lo impone la política, aquí no se
 * puede saber).
 */
export function puedeEditarPersona(
  usuario: UsuarioActuante | null,
  persona: { registrada_por?: string | null } | null,
): boolean {
  if (!usuario || !usuario.activo || !persona) return false;
  if (esAdmin(usuario)) return true;
  if (!EDITA.persona.includes(usuario.rol)) return false;
  return persona.registrada_por === usuario.id;
}

export function esAdmin(usuario: UsuarioActuante | null): boolean {
  return usuario?.rol === "admin" && usuario.activo;
}

/** La pantalla de usuarios solo existe para el administrador. */
export function puedeVerUsuarios(usuario: UsuarioActuante | null): boolean {
  return esAdmin(usuario);
}

/**
 * La carga masiva se restringe más que la captura de una persona. Un brigadista registra gente en
 * la calle de una en una, pero meter un archivo de miles de renglones cambia el padrón de golpe y
 * hay que poder señalar a un responsable.
 */
export function puedeImportar(usuario: UsuarioActuante | null): boolean {
  if (!usuario || !usuario.activo) return false;
  return usuario.rol === "admin" || usuario.rol === "resp_demarcacion";
}

/* ---------------------------------------------------------------------------
 * Qué actividades se listan
 * ------------------------------------------------------------------------- */

/**
 * Los estatus de actividad que se le muestran a cada rol.
 *
 * Esto sí coincide con RLS y por eso sobrevive: la política le quita al brigadista el acceso en
 * cuanto la actividad pasa a realizada o cancelada, así que pedir solo lo abierto esconde lo que
 * de todos modos rebotaría, en lugar de competir con la base.
 */
const ESTATUS_ABIERTOS: readonly EstatusActividad[] = ["programada", "en_curso"];
const ESTATUS_TODOS: readonly EstatusActividad[] = [
  "programada",
  "en_curso",
  "realizada",
  "cancelada",
];

export function estatusVisibles(
  usuario: UsuarioActuante | null,
): readonly EstatusActividad[] {
  if (!usuario || !usuario.activo) return [];
  return usuario.rol === "admin" ? ESTATUS_TODOS : ESTATUS_ABIERTOS;
}

/**
 * El brigadista no navega el sistema: se le invita a una actividad y captura. Las pantallas de
 * listado general no son para él, y con RLS además le saldrían vacías.
 */
export function puedeVerListadosGenerales(usuario: UsuarioActuante | null): boolean {
  if (!usuario || !usuario.activo) return false;
  return usuario.rol !== "brigadista";
}

/**
 * Responsable de una actividad. No se exige que sea el responsable de esa sección: una actividad
 * en la sección 0524 la puede encabezar alguien de otra demarcación, y eso pasa todo el tiempo en
 * campo. Basta con una cuenta activa y un rol que encabece trabajo.
 */
export function puedeEncabezarActividad(usuario: UsuarioActuante | null): boolean {
  if (!usuario || !usuario.activo) return false;
  return usuario.rol !== "brigadista";
}
