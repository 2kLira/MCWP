// Tipos de dominio. Los nombres siguen el esquema de spec/modelo-datos.md.

export type RolUsuario =
  | "admin"
  | "resp_demarcacion"
  | "resp_seccion"
  | "brigadista";

/** El usuario que está actuando en la sesión. Sin login, lo elige el conmutador de rol. */
export type UsuarioActuante = {
  id: string;
  nombre: string;
  rol: RolUsuario;
  /** Territorio asignado. Un responsable de demarcación trae demarcacionId; uno de sección,
   *  seccionClave y la demarcación a la que pertenece esa sección. */
  demarcacionId: number | null;
  seccionClave: string | null;
  activo: boolean;
};

export type Demarcacion = {
  id: number;
  nombre: string;
  slug: string;
  centroLat: number | null;
  centroLng: number | null;
};

export type Seccion = {
  clave: string;
  numero: number;
  demarcacionId: number;
  distritoLocal: number | null;
  distritoFederal: number | null;
  areaKm2: number | null;
  centroLat: number | null;
  centroLng: number | null;
  esSustituta: boolean;
  nota: string | null;
};

/** Género de una persona. Se captura, nunca se infiere del nombre. */
export type Genero = "mujer" | "hombre" | "otro" | "no_especifica";

export const GENEROS: readonly Genero[] = [
  "mujer",
  "hombre",
  "otro",
  "no_especifica",
];

export const ETIQUETA_GENERO: Record<Genero, string> = {
  mujer: "Mujer",
  hombre: "Hombre",
  otro: "Otro",
  no_especifica: "Prefiere no decir",
};

export type TipoActividad = "reunion" | "activismo" | "recorrido" | "crucero";
export type EstatusActividad =
  | "programada"
  | "en_curso"
  | "realizada"
  | "cancelada";

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  admin: "Administrador general",
  resp_demarcacion: "Responsable de demarcación",
  resp_seccion: "Responsable de sección",
  brigadista: "Brigadista",
};

export const ETIQUETA_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  reunion: "Reunión",
  activismo: "Actividad de activismo",
  recorrido: "Recorrido",
  crucero: "Crucero",
};

export const ETIQUETA_ESTATUS: Record<EstatusActividad, string> = {
  programada: "Programada",
  en_curso: "En curso",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

/** Nota que llevan las seis secciones sustitutas en su ficha. */
export const NOTA_SUSTITUTA =
  "Geometría de referencia, pendiente de actualizar con el marco vigente.";
