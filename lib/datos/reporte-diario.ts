/**
 * Reporte del día: qué se hizo en campo una fecha dada. Actividades y recorridos, en qué
 * secciones, a cuántas personas se alcanzó y cuántas de ellas cayeron en cada categoría.
 *
 * Una persona cuenta como alcanzada ese día si se registró ese día o si se le anotó una
 * participación ese día (alguien ya registrado al que se volvió a ver en un recorrido). Se cuenta
 * una sola vez aunque aparezca por los dos lados.
 *
 * Aquí sí se traen renglones y se agrupan en el navegador: son los de un solo día, y agruparlos
 * por actividad, sección y capturista a la vez costaría una vista nueva por cada corte. RLS
 * decide qué renglones llegan, igual que en el resto del sistema.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import type { EstatusActividad, TipoActividad, UsuarioActuante } from "@/lib/tipos";
import { db, resultado, type Resultado } from "@/lib/datos/cliente";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { compararPadron } from "@/lib/personas";

/** PostgREST corta en 1000 renglones por petición. */
const PAGINA = 1000;

/** Pide páginas hasta agotar. Si una falla, devuelve el error y nada más: un día a medias engaña. */
async function todas<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<{ filas: T[]; error: PostgrestError | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) return { filas: [], error };
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return { filas, error: null };
  }
}

/** Medianoche local de la fecha 'AAAA-MM-DD' y la del día siguiente, en ISO. */
function limitesDelDia(fecha: string): { inicio: string; fin: string } {
  const inicio = new Date(`${fecha}T00:00:00`);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

/* ---------------------------------------------------------------------------
 * Tipos
 * ------------------------------------------------------------------------- */

type Nombre = { nombre: string } | null;

const CAMPOS_PERSONA =
  "id, nombre, nombres, apellido_paterno, apellido_materno, seccion_clave, demarcacion_id, created_at, " +
  "quiere_participar, quiere_info, es_promovido, quiere_ser_representante, quiere_barda_lona, " +
  "urgente_contactar, urgente_motivo";

type PersonaDelDia = {
  id: string;
  nombre: string;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  seccion_clave: string | null;
  demarcacion_id: number | null;
  created_at: string;
  quiere_participar: boolean;
  quiere_info: boolean;
  es_promovido: boolean;
  quiere_ser_representante: boolean;
  quiere_barda_lona: boolean;
  urgente_contactar: boolean;
  urgente_motivo: string | null;
};

/** Las marcas que se cuentan en cada corte del reporte. */
export type Categorias = {
  alcanzadas: number;
  nuevas: number;
  promovidos: number;
  quierenInfo: number;
  quierenParticipar: number;
  representantes: number;
  bardaLona: number;
  urgentes: number;
};

const CATEGORIAS_VACIAS: Categorias = {
  alcanzadas: 0,
  nuevas: 0,
  promovidos: 0,
  quierenInfo: 0,
  quierenParticipar: 0,
  representantes: 0,
  bardaLona: 0,
  urgentes: 0,
};

export type ActividadDelDia = {
  id: string;
  tipo: TipoActividad;
  nombre: string;
  hora: string | null;
  estatus: EstatusActividad;
  responsable: string | null;
  /** La sección donde se programó la actividad. */
  seccion: string | null;
  /** Las secciones de la gente que se capturó en ella, de más a menos. */
  seccionesAlcanzadas: string[];
  asistentesAprox: number | null;
  categorias: Categorias;
};

export type SeccionDelDia = Categorias & {
  seccion: string;
  demarcacion: string | null;
};

export type CapturistaDelDia = Categorias & { nombre: string };

export type UrgenteDelDia = {
  id: string;
  nombre: string;
  seccion: string | null;
  motivo: string | null;
};

export type ReporteDiario = {
  fecha: string;
  total: Categorias;
  /** Personas a las que se marcó como promovidas ese día, aunque se hubieran registrado antes. */
  promovidasEseDia: number;
  /** Seguimientos anotados con fecha de ese día. */
  seguimientos: number;
  actividades: ActividadDelDia[];
  secciones: SeccionDelDia[];
  capturistas: CapturistaDelDia[];
  problematicas: { problematica: string; menciones: number }[];
  urgentes: UrgenteDelDia[];
};

export function reporteVacio(fecha: string): ReporteDiario {
  return {
    fecha,
    total: { ...CATEGORIAS_VACIAS },
    promovidasEseDia: 0,
    seguimientos: 0,
    actividades: [],
    secciones: [],
    capturistas: [],
    problematicas: [],
    urgentes: [],
  };
}

/* ---------------------------------------------------------------------------
 * Consulta
 * ------------------------------------------------------------------------- */

type ParticipacionDelDia = {
  actividad_id: string;
  registrador: Nombre;
  personas: PersonaDelDia | null;
};

type PersonaNueva = PersonaDelDia & { actividad_origen: string | null; registrador: Nombre };

type ActividadFila = {
  id: string;
  tipo: TipoActividad;
  nombre: string;
  hora: string | null;
  estatus: EstatusActividad;
  seccion_clave: string | null;
  asistentes_aprox: number | null;
  responsable: Nombre;
};

const CAMPOS_ACTIVIDAD =
  "id, tipo, nombre, hora, estatus, seccion_clave, asistentes_aprox, responsable:usuarios!actividades_responsable_id_fkey(nombre)";

function sumar(c: Categorias, p: PersonaDelDia, nueva: boolean) {
  c.alcanzadas += 1;
  if (nueva) c.nuevas += 1;
  if (p.es_promovido) c.promovidos += 1;
  if (p.quiere_info) c.quierenInfo += 1;
  if (p.quiere_participar) c.quierenParticipar += 1;
  if (p.quiere_ser_representante) c.representantes += 1;
  if (p.quiere_barda_lona) c.bardaLona += 1;
  if (p.urgente_contactar) c.urgentes += 1;
}

/** Agrupa personas por una llave, contando cada persona una sola vez por grupo. */
class Cortes<T extends Categorias> {
  private grupos = new Map<string, { datos: T; vistas: Set<string> }>();
  constructor(private crear: (llave: string) => T) {}
  sumar(llave: string, p: PersonaDelDia, nueva: boolean) {
    let g = this.grupos.get(llave);
    if (!g) {
      g = { datos: this.crear(llave), vistas: new Set() };
      this.grupos.set(llave, g);
    }
    if (g.vistas.has(p.id)) return;
    g.vistas.add(p.id);
    sumar(g.datos, p, nueva);
  }
  get(llave: string): T | undefined {
    return this.grupos.get(llave)?.datos;
  }
  valores(): T[] {
    return [...this.grupos.values()]
      .map((g) => g.datos)
      .sort((a, b) => b.alcanzadas - a.alcanzadas || b.promovidos - a.promovidos);
  }
}

export async function reporteDiario(
  usuario: UsuarioActuante | null,
  fecha: string,
): Promise<Resultado<ReporteDiario>> {
  void usuario;
  const vacio = reporteVacio(fecha);
  const { inicio, fin } = limitesDelDia(fecha);

  const [nuevas, participaciones, actividadesDelDia, menciones, promovidas, seguimientos] =
    await Promise.all([
      todas<PersonaNueva>((desde, hasta) =>
        db()
          .from("personas")
          .select(
            `${CAMPOS_PERSONA}, actividad_origen, registrador:usuarios!personas_registrada_por_fkey(nombre)`,
          )
          .gte("created_at", inicio)
          .lt("created_at", fin)
          .order("created_at")
          .order("id")
          .range(desde, hasta),
      ),
      todas<ParticipacionDelDia>((desde, hasta) =>
        db()
          .from("participaciones")
          .select(
            `actividad_id, registrador:usuarios!participaciones_registrada_por_fkey(nombre), personas(${CAMPOS_PERSONA})`,
          )
          .gte("created_at", inicio)
          .lt("created_at", fin)
          .order("created_at")
          .order("id")
          .range(desde, hasta),
      ),
      db().from("actividades").select(CAMPOS_ACTIVIDAD).eq("fecha", fecha).order("hora"),
      todas<{ problematicas: { nombre: string } | null }>((desde, hasta) =>
        db()
          .from("menciones_problematica")
          .select("problematicas!inner(nombre), participaciones!inner(created_at)")
          .gte("participaciones.created_at", inicio)
          .lt("participaciones.created_at", fin)
          .order("id")
          .range(desde, hasta),
      ),
      db()
        .from("personas")
        .select("*", { count: "exact", head: true })
        .gte("promovido_en", inicio)
        .lt("promovido_en", fin),
      db().from("seguimientos").select("*", { count: "exact", head: true }).eq("fecha", fecha),
    ]);

  const error =
    nuevas.error ??
    participaciones.error ??
    actividadesDelDia.error ??
    menciones.error ??
    promovidas.error ??
    seguimientos.error;
  if (error) return resultado(vacio, error, vacio);

  // Actividades: las programadas para ese día más las que recibieron capturas ese día aunque
  // tengan otra fecha (una actividad que se cerró tarde, un recorrido de varios días).
  const actividades = new Map<string, ActividadFila>(
    ((actividadesDelDia.data ?? []) as unknown as ActividadFila[]).map((a) => [a.id, a]),
  );
  const faltantes = [
    ...new Set(
      [
        ...participaciones.filas.map((p) => p.actividad_id),
        ...nuevas.filas.map((p) => p.actividad_origen),
      ].filter((id): id is string => !!id && !actividades.has(id)),
    ),
  ];
  if (faltantes.length > 0) {
    const extra = await db().from("actividades").select(CAMPOS_ACTIVIDAD).in("id", faltantes);
    if (extra.error) return resultado(vacio, extra.error, vacio);
    for (const a of (extra.data ?? []) as unknown as ActividadFila[]) actividades.set(a.id, a);
  }

  const total = { ...CATEGORIAS_VACIAS };
  const vistas = new Set<string>();
  const idsNuevas = new Set(nuevas.filas.map((p) => p.id));
  const porActividad = new Cortes<Categorias>(() => ({ ...CATEGORIAS_VACIAS }));
  const seccionesDeActividad = new Map<string, Map<string, number>>();
  const porSeccion = new Cortes<SeccionDelDia>((clave) => ({
    ...CATEGORIAS_VACIAS,
    seccion: clave,
    demarcacion: null,
  }));
  const porCapturista = new Cortes<CapturistaDelDia>((nombre) => ({
    ...CATEGORIAS_VACIAS,
    nombre,
  }));
  const urgentes = new Map<string, PersonaDelDia>();

  function anotar(p: PersonaDelDia, actividadId: string | null, capturista: string) {
    const nueva = idsNuevas.has(p.id);
    if (!vistas.has(p.id)) {
      vistas.add(p.id);
      sumar(total, p, nueva);
      if (p.urgente_contactar) urgentes.set(p.id, p);
    }
    const seccion = p.seccion_clave ?? "Sin sección";
    porSeccion.sumar(seccion, p, nueva);
    const s = porSeccion.get(seccion);
    if (s && !s.demarcacion) s.demarcacion = demarcacionPorId(p.demarcacion_id)?.nombre ?? null;
    porCapturista.sumar(capturista, p, nueva);
    if (actividadId) {
      porActividad.sumar(actividadId, p, nueva);
      const mapa = seccionesDeActividad.get(actividadId) ?? new Map<string, number>();
      mapa.set(seccion, (mapa.get(seccion) ?? 0) + 1);
      seccionesDeActividad.set(actividadId, mapa);
    }
  }

  for (const p of participaciones.filas) {
    if (p.personas) anotar(p.personas, p.actividad_id, p.registrador?.nombre ?? "Sin nombre");
  }
  // Las nuevas que no traen participación: registradas fuera de una actividad.
  for (const p of nuevas.filas) {
    anotar(p, p.actividad_origen, p.registrador?.nombre ?? "Sin nombre");
  }

  const conteoProblematicas = new Map<string, number>();
  for (const m of menciones.filas) {
    const nombre = m.problematicas?.nombre;
    if (nombre) conteoProblematicas.set(nombre, (conteoProblematicas.get(nombre) ?? 0) + 1);
  }

  const listaActividades: ActividadDelDia[] = [...actividades.values()]
    .map((a) => ({
      id: a.id,
      tipo: a.tipo,
      nombre: a.nombre,
      hora: a.hora,
      estatus: a.estatus,
      responsable: a.responsable?.nombre ?? null,
      seccion: a.seccion_clave,
      seccionesAlcanzadas: [...(seccionesDeActividad.get(a.id) ?? new Map()).entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([clave]) => clave),
      asistentesAprox: a.asistentes_aprox,
      categorias: porActividad.get(a.id) ?? { ...CATEGORIAS_VACIAS },
    }))
    // Los recorridos primero, que es lo que más se pregunta; luego por hora.
    .sort(
      (x, y) =>
        Number(y.tipo === "recorrido") - Number(x.tipo === "recorrido") ||
        (x.hora ?? "99").localeCompare(y.hora ?? "99"),
    );

  return {
    datos: {
      fecha,
      total,
      promovidasEseDia: promovidas.count ?? 0,
      seguimientos: seguimientos.count ?? 0,
      actividades: listaActividades,
      secciones: porSeccion.valores(),
      capturistas: porCapturista.valores(),
      problematicas: [...conteoProblematicas.entries()]
        .map(([problematica, n]) => ({ problematica, menciones: n }))
        .sort((a, b) => b.menciones - a.menciones),
      urgentes: [...urgentes.values()].sort(compararPadron).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        seccion: p.seccion_clave,
        motivo: p.urgente_motivo,
      })),
    },
    sinEsquema: false,
    aviso: null,
  };
}
