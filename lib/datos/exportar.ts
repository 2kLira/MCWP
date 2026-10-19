/**
 * Las tablas que se bajan a Excel desde /exportar.
 *
 * Aquí no se filtra nada por rol: cada consulta pide lo que pide y RLS decide qué renglones
 * regresan. Un responsable de demarcación baja su demarcación; el administrador, todo. Lo único que
 * se decide en la interfaz es qué hojas se ofrecen (ver `HOJAS` en app/(aplicacion)/exportar).
 *
 * Cada hoja trae nombres, no ids: quien abre el archivo no tiene cómo cruzar un uuid.
 */

import { demarcacionPorId } from "@/lib/demarcaciones";
import { compararPadron } from "@/lib/personas";
import { formatearTelefono } from "@/lib/territorio";
import {
  ETIQUETA_ESTATUS,
  ETIQUETA_GENERO,
  ETIQUETA_TIPO_ACTIVIDAD,
  type EstatusActividad,
  type Genero,
  type TipoActividad,
} from "@/lib/tipos";
import {
  ETIQUETA_ESTADO_SEGUIMIENTO,
  ETIQUETA_TIPO_SEGUIMIENTO,
} from "@/components/seguimiento/utilidades";
import type { EstadoSeguimiento, TipoSeguimiento } from "@/lib/datos/seguimientos";
import { db } from "@/lib/datos/cliente";
import type { Hoja } from "@/lib/xlsx";

/** PostgREST corta en 1000 renglones por petición; se pide por páginas hasta agotar. */
const PAGINA = 1000;

async function todas<T>(tabla: string, columnas: string, orden: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db()
      .from(tabla)
      .select(columnas)
      .order(orden, { ascending: true })
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGINA) return filas;
  }
}

/** `2026-10-10` se lee como día local, no como medianoche UTC (que en Oaxaca es el día anterior). */
function dia(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const [a, m, d] = valor.slice(0, 10).split("-").map(Number);
  return a && m && d ? new Date(a, m - 1, d) : null;
}

function momento(valor: string | null | undefined): Date | null {
  return valor ? new Date(valor) : null;
}

function telefono(normalizado: string | null | undefined): string {
  return formatearTelefono(normalizado);
}

function demarcacion(id: number | null | undefined): string {
  return id ? (demarcacionPorId(id)?.nombre ?? "") : "";
}

type Nombre = { nombre: string } | null;

/* ---------------------------------------------------------------------------
 * Personas
 * ------------------------------------------------------------------------- */

type FilaPersona = {
  nombre: string;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  telefono_norm: string | null;
  calle: string | null;
  seccion_clave: string | null;
  demarcacion_id: number | null;
  genero: Genero | null;
  fecha_nacimiento: string | null;
  quiere_participar: boolean | null;
  quiere_info: boolean | null;
  es_promovido: boolean | null;
  promovido_en: string | null;
  quiere_ser_representante: boolean | null;
  quiere_barda_lona: boolean | null;
  urgente_contactar: boolean | null;
  urgente_motivo: string | null;
  created_at: string;
  colonias: Nombre;
  registrador: Nombre;
  origen: Nombre;
};

export async function hojaPersonas(): Promise<Hoja> {
  const filas = await todas<FilaPersona>(
    "personas",
    "id, nombre, nombres, apellido_paterno, apellido_materno, telefono_norm, calle, seccion_clave, demarcacion_id, genero, fecha_nacimiento, " +
      "quiere_participar, quiere_info, es_promovido, promovido_en, quiere_ser_representante, quiere_barda_lona, urgente_contactar, urgente_motivo, " +
      "created_at, colonias(nombre), " +
      "registrador:usuarios!personas_registrada_por_fkey(nombre), " +
      "origen:actividades!personas_actividad_origen_fkey(nombre)",
    "created_at",
  );

  filas.sort(compararPadron);

  return {
    nombre: "Personas",
    columnas: [
      { titulo: "Apellido paterno" },
      { titulo: "Apellido materno" },
      { titulo: "Nombre(s)" },
      { titulo: "Teléfono", ancho: 14 },
      { titulo: "Calle" },
      { titulo: "Colonia" },
      { titulo: "Sección", ancho: 9 },
      { titulo: "Demarcación" },
      { titulo: "Género", ancho: 14 },
      { titulo: "Fecha de nacimiento", formato: "fecha", ancho: 12 },
      { titulo: "Quiere participar", ancho: 10 },
      { titulo: "Quiere información", ancho: 10 },
      { titulo: "Promovido", ancho: 10 },
      { titulo: "Promovido desde", formato: "fechaHora", ancho: 17 },
      { titulo: "Quiere ser representante", ancho: 10 },
      { titulo: "Barda o lona", ancho: 10 },
      { titulo: "Urgente contactar", ancho: 10 },
      { titulo: "Por qué es urgente", ancho: 40 },
      { titulo: "Registrada en la actividad" },
      { titulo: "Registrada por" },
      { titulo: "Fecha de registro", formato: "fechaHora", ancho: 17 },
    ],
    filas: filas.map((p) => [
      p.apellido_paterno,
      p.apellido_materno,
      p.apellido_paterno ? p.nombres : p.nombre,
      telefono(p.telefono_norm),
      p.calle,
      p.colonias?.nombre,
      p.seccion_clave,
      demarcacion(p.demarcacion_id),
      p.genero ? ETIQUETA_GENERO[p.genero] : null,
      dia(p.fecha_nacimiento),
      p.quiere_participar,
      p.quiere_info,
      p.es_promovido,
      momento(p.promovido_en),
      p.quiere_ser_representante,
      p.quiere_barda_lona,
      p.urgente_contactar,
      p.urgente_motivo,
      p.origen?.nombre,
      p.registrador?.nombre,
      momento(p.created_at),
    ]),
  };
}

/* ---------------------------------------------------------------------------
 * Actividades
 * ------------------------------------------------------------------------- */

type FilaActividad = {
  nombre: string;
  tipo: TipoActividad;
  fecha: string;
  hora: string | null;
  estatus: EstatusActividad;
  direccion: string | null;
  seccion_clave: string | null;
  demarcacion_id: number | null;
  objetivo: string | null;
  conclusion: string | null;
  cerrada_en: string | null;
  colonias: Nombre;
  responsable: Nombre;
  participaciones: { tipo: string }[];
};

export async function hojaActividades(): Promise<Hoja> {
  const filas = await todas<FilaActividad>(
    "actividades",
    "id, nombre, tipo, fecha, hora, estatus, direccion, seccion_clave, demarcacion_id, objetivo, " +
      "conclusion, cerrada_en, colonias(nombre), " +
      "responsable:usuarios!actividades_responsable_id_fkey(nombre), participaciones(tipo)",
    "fecha",
  );

  return {
    nombre: "Actividades",
    columnas: [
      { titulo: "Actividad" },
      { titulo: "Tipo", ancho: 12 },
      { titulo: "Fecha", formato: "fecha", ancho: 12 },
      { titulo: "Hora", ancho: 8 },
      { titulo: "Estatus", ancho: 12 },
      { titulo: "Dirección" },
      { titulo: "Colonia" },
      { titulo: "Sección", ancho: 9 },
      { titulo: "Demarcación" },
      { titulo: "Responsable" },
      { titulo: "Asistentes", ancho: 11 },
      { titulo: "Personas nuevas", ancho: 11 },
      { titulo: "Objetivo", ancho: 40 },
      { titulo: "Conclusión", ancho: 50 },
      { titulo: "Cerrada", formato: "fechaHora", ancho: 17 },
    ],
    filas: filas.map((a) => [
      a.nombre,
      ETIQUETA_TIPO_ACTIVIDAD[a.tipo],
      dia(a.fecha),
      a.hora?.slice(0, 5),
      ETIQUETA_ESTATUS[a.estatus],
      a.direccion,
      a.colonias?.nombre,
      a.seccion_clave,
      demarcacion(a.demarcacion_id),
      a.responsable?.nombre,
      a.participaciones.length,
      a.participaciones.filter((p) => p.tipo === "registro").length,
      a.objetivo,
      a.conclusion,
      momento(a.cerrada_en),
    ]),
  };
}

/* ---------------------------------------------------------------------------
 * Asistencias: quién estuvo en qué actividad
 * ------------------------------------------------------------------------- */

type FilaParticipacion = {
  tipo: string;
  created_at: string;
  personas: { nombre: string; telefono_norm: string | null; seccion_clave: string | null } | null;
  actividades: { nombre: string; fecha: string } | null;
  registrador: Nombre;
};

export async function hojaAsistencias(): Promise<Hoja> {
  const filas = await todas<FilaParticipacion>(
    "participaciones",
    "id, tipo, created_at, personas(nombre, telefono_norm, seccion_clave), " +
      "actividades(nombre, fecha), " +
      "registrador:usuarios!participaciones_registrada_por_fkey(nombre)",
    "created_at",
  );

  return {
    nombre: "Asistencias",
    columnas: [
      { titulo: "Persona" },
      { titulo: "Teléfono", ancho: 14 },
      { titulo: "Sección", ancho: 9 },
      { titulo: "Actividad" },
      { titulo: "Fecha de la actividad", formato: "fecha", ancho: 12 },
      { titulo: "Tipo", ancho: 14 },
      { titulo: "Registrada por" },
      { titulo: "Fecha de captura", formato: "fechaHora", ancho: 17 },
    ],
    filas: filas.map((p) => [
      p.personas?.nombre,
      telefono(p.personas?.telefono_norm),
      p.personas?.seccion_clave,
      p.actividades?.nombre,
      dia(p.actividades?.fecha),
      p.tipo === "registro" ? "Registro nuevo" : "Asistencia",
      p.registrador?.nombre,
      momento(p.created_at),
    ]),
  };
}

/* ---------------------------------------------------------------------------
 * Problemáticas mencionadas
 * ------------------------------------------------------------------------- */

type FilaMencion = {
  comentario: string | null;
  problematicas: Nombre;
  participaciones: {
    created_at: string;
    personas: { nombre: string; seccion_clave: string | null; demarcacion_id: number | null } | null;
    actividades: Nombre;
  } | null;
};

export async function hojaProblematicas(): Promise<Hoja> {
  const filas = await todas<FilaMencion>(
    "menciones_problematica",
    "id, comentario, problematicas(nombre), " +
      "participaciones(created_at, personas(nombre, seccion_clave, demarcacion_id), actividades(nombre))",
    "id",
  );

  return {
    nombre: "Problemáticas",
    columnas: [
      { titulo: "Problemática" },
      { titulo: "Comentario", ancho: 50 },
      { titulo: "Persona" },
      { titulo: "Sección", ancho: 9 },
      { titulo: "Demarcación" },
      { titulo: "Actividad" },
      { titulo: "Fecha", formato: "fechaHora", ancho: 17 },
    ],
    filas: filas.map((m) => [
      m.problematicas?.nombre,
      m.comentario,
      m.participaciones?.personas?.nombre,
      m.participaciones?.personas?.seccion_clave,
      demarcacion(m.participaciones?.personas?.demarcacion_id),
      m.participaciones?.actividades?.nombre,
      momento(m.participaciones?.created_at),
    ]),
  };
}

/* ---------------------------------------------------------------------------
 * Solicitudes
 * ------------------------------------------------------------------------- */

type FilaSolicitud = {
  tema: string;
  descripcion: string | null;
  requiere_seguimiento: boolean | null;
  created_at: string;
  personas: { nombre: string; telefono_norm: string | null; seccion_clave: string | null } | null;
};

export async function hojaSolicitudes(): Promise<Hoja> {
  const filas = await todas<FilaSolicitud>(
    "solicitudes",
    "id, tema, descripcion, requiere_seguimiento, created_at, " +
      "personas(nombre, telefono_norm, seccion_clave)",
    "created_at",
  );

  return {
    nombre: "Solicitudes",
    columnas: [
      { titulo: "Persona" },
      { titulo: "Teléfono", ancho: 14 },
      { titulo: "Sección", ancho: 9 },
      { titulo: "Tema" },
      { titulo: "Descripción", ancho: 50 },
      { titulo: "Requiere seguimiento", ancho: 12 },
      { titulo: "Fecha", formato: "fechaHora", ancho: 17 },
    ],
    filas: filas.map((s) => [
      s.personas?.nombre,
      telefono(s.personas?.telefono_norm),
      s.personas?.seccion_clave,
      s.tema,
      s.descripcion,
      s.requiere_seguimiento,
      momento(s.created_at),
    ]),
  };
}

/* ---------------------------------------------------------------------------
 * Seguimientos (solo administrador, por RLS)
 * ------------------------------------------------------------------------- */

type FilaSeguimiento = {
  fecha: string | null;
  tipo: TipoSeguimiento;
  estado: EstadoSeguimiento;
  nota: string | null;
  personas: { nombre: string; telefono_norm: string | null } | null;
  responsable: Nombre;
};

export async function hojaSeguimientos(): Promise<Hoja> {
  const filas = await todas<FilaSeguimiento>(
    "seguimientos",
    "id, fecha, tipo, estado, nota, created_at, personas(nombre, telefono_norm), " +
      "responsable:usuarios!seguimientos_responsable_id_fkey(nombre)",
    "created_at",
  );

  return {
    nombre: "Seguimiento",
    columnas: [
      { titulo: "Persona" },
      { titulo: "Teléfono", ancho: 14 },
      { titulo: "Fecha", formato: "fecha", ancho: 12 },
      { titulo: "Tipo", ancho: 12 },
      { titulo: "Estado", ancho: 15 },
      { titulo: "Nota", ancho: 50 },
      { titulo: "Responsable" },
    ],
    filas: filas.map((s) => [
      s.personas?.nombre,
      telefono(s.personas?.telefono_norm),
      dia(s.fecha),
      ETIQUETA_TIPO_SEGUIMIENTO[s.tipo],
      ETIQUETA_ESTADO_SEGUIMIENTO[s.estado],
      s.nota,
      s.responsable?.nombre,
    ]),
  };
}

/* ---------------------------------------------------------------------------
 * Representantes de casilla (solo administrador, por RLS)
 * ------------------------------------------------------------------------- */

type FilaRepresentante = {
  cargo: "titular" | "suplente";
  nombre: string | null;
  telefono_norm: string | null;
  capacitacion: "capacitado" | "por_capacitar";
  manual: "entregado" | "pendiente";
  acreditacion: "acreditado" | "pendiente";
  created_at: string;
  casillas: { seccion_clave: string; tipo: string; numero: number | null; domicilio: string | null } | null;
  personas: Nombre;
};

export async function hojaRepresentantes(): Promise<Hoja> {
  const filas = await todas<FilaRepresentante>(
    "representantes_casilla",
    "id, cargo, nombre, telefono_norm, capacitacion, manual, acreditacion, created_at, " +
      "casillas(seccion_clave, tipo, numero, domicilio), personas(nombre)",
    "created_at",
  );

  return {
    nombre: "Representantes",
    columnas: [
      { titulo: "Sección", ancho: 9 },
      { titulo: "Casilla", ancho: 10 },
      { titulo: "Domicilio de la casilla", ancho: 40 },
      { titulo: "Cargo", ancho: 10 },
      { titulo: "Nombre" },
      { titulo: "Teléfono", ancho: 14 },
      { titulo: "Capacitación", ancho: 14 },
      { titulo: "Manual", ancho: 11 },
      { titulo: "Acreditación", ancho: 13 },
      { titulo: "Fecha de registro", formato: "fechaHora", ancho: 17 },
    ],
    filas: filas.map((r) => [
      r.casillas?.seccion_clave,
      r.casillas ? [r.casillas.tipo, r.casillas.numero].filter(Boolean).join(" ") : null,
      r.casillas?.domicilio,
      r.cargo === "titular" ? "Titular" : "Suplente",
      r.personas?.nombre ?? r.nombre,
      telefono(r.telefono_norm),
      r.capacitacion === "capacitado" ? "Capacitado" : "Por capacitar",
      r.manual === "entregado" ? "Entregado" : "Pendiente",
      r.acreditacion === "acreditado" ? "Acreditado" : "Pendiente",
      momento(r.created_at),
    ]),
  };
}
