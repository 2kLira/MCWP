/**
 * Único punto de verdad de permisos.
 *
 * No hay login, así que no hay Row Level Security: el filtrado por territorio vive aquí, en la
 * capa de aplicación, y todo acceso a datos pasa por este módulo. No dupliques esta lógica en
 * componentes. Cuando el proyecto se apruebe, este archivo se reemplaza por políticas de base de
 * datos y las pantallas no tienen que cambiar.
 */

import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import type { EstatusActividad, RolUsuario, UsuarioActuante } from "@/lib/tipos";

/* ---------------------------------------------------------------------------
 * Alcance territorial
 * ------------------------------------------------------------------------- */

export type Alcance =
  | { tipo: "todo" }
  | { tipo: "demarcacion"; demarcacionId: number }
  | { tipo: "seccion"; seccionClave: string; demarcacionId: number | null }
  | { tipo: "ninguno" };

/**
 * Hasta dónde alcanza a ver el usuario actuante. Es la función de la que cuelgan todas las demás:
 * si cambias el recorte de un rol, cámbialo aquí y nada más aquí.
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
      return usuario.seccionClave
        ? {
            tipo: "seccion",
            seccionClave: usuario.seccionClave,
            demarcacionId: usuario.demarcacionId,
          }
        : { tipo: "ninguno" };

    // El brigadista ve lo mismo que su territorio asignado, pero no crea ni edita nada.
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

/** Texto corto del territorio del usuario, para mostrarlo junto al conmutador. */
export function etiquetaAlcance(
  usuario: UsuarioActuante | null,
  nombreDemarcacion?: string | null,
): string {
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
 * Preguntas de lectura
 * ------------------------------------------------------------------------- */

/** Forma mínima de cualquier registro con territorio: personas, actividades, secciones. */
export type ConTerritorio = {
  seccion_clave?: string | null;
  demarcacion_id?: number | null;
};

export function puedeVerDemarcacion(
  usuario: UsuarioActuante | null,
  demarcacionId: number | null | undefined,
): boolean {
  const alcance = alcanceDe(usuario);
  switch (alcance.tipo) {
    case "todo":
      return true;
    case "demarcacion":
      return demarcacionId === alcance.demarcacionId;
    case "seccion":
      // Ve su demarcación como contexto, pero solo con el detalle de su sección.
      return demarcacionId === alcance.demarcacionId;
    case "ninguno":
      return false;
  }
}

export function puedeVerSeccion(
  usuario: UsuarioActuante | null,
  seccion: ConTerritorio | string | null | undefined,
  demarcacionId?: number | null,
): boolean {
  const clave = typeof seccion === "string" ? seccion : seccion?.seccion_clave;
  const demarcacion =
    typeof seccion === "string"
      ? demarcacionId
      : (seccion?.demarcacion_id ?? demarcacionId);

  const alcance = alcanceDe(usuario);
  switch (alcance.tipo) {
    case "todo":
      return true;
    case "demarcacion":
      return demarcacion === alcance.demarcacionId;
    case "seccion":
      return clave === alcance.seccionClave;
    case "ninguno":
      return false;
  }
}

/** La misma pregunta para cualquier registro que traiga sección o demarcación. */
export function puedeVerRegistro(
  usuario: UsuarioActuante | null,
  registro: ConTerritorio | null | undefined,
): boolean {
  if (!registro) return false;
  const alcance = alcanceDe(usuario);
  switch (alcance.tipo) {
    case "todo":
      return true;
    case "demarcacion":
      return registro.demarcacion_id === alcance.demarcacionId;
    case "seccion":
      return registro.seccion_clave === alcance.seccionClave;
    case "ninguno":
      return false;
  }
}

/** Recorta una lista ya traída. Para listas grandes, filtra en la consulta con aplicarAlcance. */
export function filtrarPorTerritorio<T extends ConTerritorio>(
  usuario: UsuarioActuante | null,
  registros: readonly T[],
): T[] {
  const alcance = alcanceDe(usuario);
  if (alcance.tipo === "todo") return [...registros];
  if (alcance.tipo === "ninguno") return [];
  return registros.filter((r) => puedeVerRegistro(usuario, r));
}

/**
 * Aplica el recorte territorial a una consulta de Supabase. Es la vía preferida: recorta en la
 * base, no en el navegador.
 *
 * Las columnas se pueden renombrar cuando la tabla las llama distinto, por ejemplo en la vista
 * v_seccion_resumen, donde la sección es `clave`.
 */
export function aplicarAlcance<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Q extends PostgrestFilterBuilder<any, any, any, any, any>,
>(
  consulta: Q,
  usuario: UsuarioActuante | null,
  columnas: { seccion?: string; demarcacion?: string } = {},
): Q {
  const colSeccion = columnas.seccion ?? "seccion_clave";
  const colDemarcacion = columnas.demarcacion ?? "demarcacion_id";
  const alcance = alcanceDe(usuario);

  switch (alcance.tipo) {
    case "todo":
      return consulta;
    case "demarcacion":
      return consulta.eq(colDemarcacion, alcance.demarcacionId) as Q;
    case "seccion":
      return consulta.eq(colSeccion, alcance.seccionClave) as Q;
    case "ninguno":
      // Consulta que no devuelve nada, en lugar de devolver todo por descuido.
      return consulta.eq(colSeccion, "__sin_territorio__") as Q;
  }
}

/**
 * Variante para consultas que agregan por demarcación, como v_demarcacion_resumen. Un responsable
 * de sección sigue perteneciendo a una demarcación: aquí ve la suya completa, aunque el detalle
 * por sección siga recortado a la que le toca.
 */
export function aplicarAlcanceDemarcacion<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Q extends PostgrestFilterBuilder<any, any, any, any, any>,
>(consulta: Q, usuario: UsuarioActuante | null, columna = "demarcacion_id"): Q {
  const alcance = alcanceDe(usuario);
  switch (alcance.tipo) {
    case "todo":
      return consulta;
    case "demarcacion":
      return consulta.eq(columna, alcance.demarcacionId) as Q;
    case "seccion":
      return alcance.demarcacionId
        ? (consulta.eq(columna, alcance.demarcacionId) as Q)
        : (consulta.eq(columna, -1) as Q);
    case "ninguno":
      return consulta.eq(columna, -1) as Q;
  }
}

/* ---------------------------------------------------------------------------
 * Preguntas de escritura
 * ------------------------------------------------------------------------- */

export type Entidad =
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
  persona: ["admin", "resp_demarcacion", "resp_seccion"],
  foto: ["admin", "resp_demarcacion", "resp_seccion"],
  actividad: ["admin", "resp_demarcacion", "resp_seccion"],
  seguimiento: ["admin", "resp_demarcacion", "resp_seccion"],
  usuario: ["admin"],
  asignacion: ["admin"],
};

export function puedeCrear(
  usuario: UsuarioActuante | null,
  entidad: Entidad,
): boolean {
  if (!usuario || !usuario.activo) return false;
  if (alcanceDe(usuario).tipo === "ninguno") return false;
  return CREA[entidad].includes(usuario.rol);
}

/**
 * Editar exige, además del rol, que el registro caiga dentro del territorio. Un registro sin
 * territorio (una persona que todavía no tiene sección resuelta) solo lo edita el administrador.
 */
export function puedeEditar(
  usuario: UsuarioActuante | null,
  entidad: Entidad,
  registro?: ConTerritorio | null,
): boolean {
  if (!usuario || !usuario.activo) return false;
  if (!EDITA[entidad].includes(usuario.rol)) return false;
  if (!registro) return usuario.rol === "admin";
  return puedeVerRegistro(usuario, registro);
}

export function esAdmin(usuario: UsuarioActuante | null): boolean {
  return usuario?.rol === "admin" && usuario.activo;
}

/** La pantalla de usuarios solo existe para el administrador. */
export function puedeVerUsuarios(usuario: UsuarioActuante | null): boolean {
  return esAdmin(usuario);
}

/** Los reportes comparativos entre demarcaciones solo tienen sentido con alcance municipal. */
export function puedeVerReportesComparativos(
  usuario: UsuarioActuante | null,
): boolean {
  return alcanceDe(usuario).tipo === "todo";
}

/**
 * La carga masiva se restringe más que la captura de una persona. Un brigadista registra gente en
 * la calle de una en una, pero meter un archivo de miles de renglones es otra cosa: cambia el
 * padrón de golpe y hay que poder señalar a un responsable. Por eso solo el administrador y los
 * responsables de demarcación.
 *
 * El recorte por territorio de los renglones del archivo no se decide aquí: cada renglón se
 * revisa con puedeVerSeccion, para que nadie cargue promovidos de un territorio que no le toca.
 */
export function puedeImportar(usuario: UsuarioActuante | null): boolean {
  if (!usuario || !usuario.activo) return false;
  return usuario.rol === "admin" || usuario.rol === "resp_demarcacion";
}

/* ---------------------------------------------------------------------------
 * Qué actividades alcanza a ver cada rol
 * ------------------------------------------------------------------------- */

/**
 * Los estatus de actividad que este usuario alcanza a ver, en actividades y en agenda.
 *
 * Solo el administrador general ve lo cerrado. Brigadistas y responsables ven lo que todavía
 * pueden trabajar: programada y en curso. Una actividad realizada o cancelada deja de aparecerles
 * en cuanto se cierra, porque lo cerrado es historia y la historia es de quien coordina.
 *
 * Esta es la única lista que decide eso. Si mañana un rol debe ver lo realizado, se cambia aquí
 * y ninguna pantalla se entera.
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

/** True si este usuario alcanza a ver una actividad en ese estatus. */
export function puedeVerEstatus(
  usuario: UsuarioActuante | null,
  estatus: EstatusActividad,
): boolean {
  return estatusVisibles(usuario).includes(estatus);
}

/**
 * El brigadista no navega el sistema: se le manda a una actividad y captura. Solo ve su agenda y
 * lo que tiene abierto, así que las pantallas de listado general no son para él.
 */
export function puedeVerListadosGenerales(usuario: UsuarioActuante | null): boolean {
  if (!usuario || !usuario.activo) return false;
  return usuario.rol !== "brigadista";
}

/**
 * Responsable de una actividad. A diferencia de la asignación territorial, aquí no se exige que sea
 * el responsable de esa sección: una actividad en la sección 0524 la puede encabezar alguien de otra
 * demarcación, y eso pasa todo el tiempo en campo. Basta con que la cuenta esté activa y tenga un
 * rol que encabece trabajo.
 */
export function puedeEncabezarActividad(usuario: UsuarioActuante | null): boolean {
  if (!usuario || !usuario.activo) return false;
  return usuario.rol !== "brigadista";
}
