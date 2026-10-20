/**
 * Indicadores de "Cómo vamos", el bloque de gráficas del tablero. Igual que lib/datos/tablero.ts:
 * todo lo que se puede contar se cuenta en la base con `count exact`, sin traer filas al
 * navegador, y RLS decide sobre qué renglones se cuenta. Lo único que se agrega aquí son las
 * filas que ya vienen agregadas por una vista (demarcaciones, problemáticas por sección).
 */

import type { UsuarioActuante } from "@/lib/tipos";
import { esAdmin } from "@/lib/puertas-ui";
import { db, esFaltaDeEsquema, lista, type Resultado } from "@/lib/datos/cliente";
import { demarcacionesResumen, problematicasPorSeccion } from "@/lib/datos/catalogos";
import { capturasPorUsuario } from "@/lib/datos/usuarios";
import { fechaLocalIso } from "@/lib/utils";

/** Medianoche local de hace `dias` días (negativo = días adelante). */
function medianoche(dias: number): Date {
  const f = new Date();
  f.setHours(0, 0, 0, 0);
  f.setDate(f.getDate() - dias);
  return f;
}

function contar(tabla: string) {
  return db().from(tabla).select("*", { count: "exact", head: true });
}

/* ---------------------------------------------------------------------------
 * Ritmo de captura
 * ------------------------------------------------------------------------- */

export type DiaCaptura = {
  /** 'AAAA-MM-DD' local. */
  fecha: string;
  personas: number;
};

/**
 * Personas nuevas por día, de hace `dias - 1` días a hoy, en orden. Un conteo por día: con miles
 * de renglones sigue siendo una respuesta de catorce números, no catorce mil filas.
 */
export async function capturaPorDia(
  usuario: UsuarioActuante | null,
  dias = 14,
): Promise<Resultado<DiaCaptura[]>> {
  void usuario;
  const rangos = Array.from({ length: dias }, (_, i) => {
    const atras = dias - 1 - i;
    return { inicio: medianoche(atras), fin: medianoche(atras - 1) };
  });
  const respuestas = await Promise.all(
    rangos.map(({ inicio, fin }) =>
      contar("personas")
        .gte("created_at", inicio.toISOString())
        .lt("created_at", fin.toISOString()),
    ),
  );
  const error = respuestas.find((r) => r.error)?.error ?? null;
  if (error) {
    return { datos: [], sinEsquema: esFaltaDeEsquema(error), aviso: error.message };
  }
  return {
    datos: rangos.map(({ inicio }, i) => ({
      fecha: fechaLocalIso(inicio),
      personas: respuestas[i]?.count ?? 0,
    })),
    sinEsquema: false,
    aviso: null,
  };
}

/* ---------------------------------------------------------------------------
 * Seguimiento: cuánto lleva esperando la gente de la bandeja
 * ------------------------------------------------------------------------- */

export type TramoEspera = {
  etiqueta: string;
  /** Días de espera, inclusive. `hasta` nulo = en adelante. */
  desde: number;
  hasta: number | null;
  personas: number;
};

export type EsperaBandeja = {
  tramos: TramoEspera[];
  urgentes: number;
  /** A quien nunca se le ha registrado ningún seguimiento. */
  sinAtender: number;
};

const TRAMOS: Omit<TramoEspera, "personas">[] = [
  { etiqueta: "0 a 2 días", desde: 0, hasta: 2 },
  { etiqueta: "3 a 7", desde: 3, hasta: 7 },
  { etiqueta: "8 a 14", desde: 8, hasta: 14 },
  { etiqueta: "15 o más", desde: 15, hasta: null },
];

/**
 * La espera corre desde el último seguimiento o, si nunca hubo uno, desde que se registró: la
 * misma cuenta que pinta Seguimiento en cada renglón. La vista no trae esa fecha ya resuelta, así
 * que cada tramo pide las dos ramas con un `or`. Los valores van entre comillas porque una fecha
 * ISO trae `:` y `.`, que la gramática del filtro de PostgREST lee aparte.
 */
function filtroTramo(desde: number, hasta: number | null): string {
  const conSeguimiento = [`ultimo_seguimiento_fecha.lte.${fechaLocalIso(medianoche(desde))}`];
  const sinSeguimiento = [
    "ultimo_seguimiento_fecha.is.null",
    `created_at.lt."${medianoche(desde - 1).toISOString()}"`,
  ];
  if (hasta !== null) {
    conSeguimiento.push(`ultimo_seguimiento_fecha.gt.${fechaLocalIso(medianoche(hasta + 1))}`);
    sinSeguimiento.push(`created_at.gte."${medianoche(hasta).toISOString()}"`);
  }
  return `and(${conSeguimiento.join(",")}),and(${sinSeguimiento.join(",")})`;
}

export async function esperaBandeja(
  usuario: UsuarioActuante | null,
): Promise<Resultado<EsperaBandeja>> {
  void usuario;
  const [urgentes, sinAtender, ...tramos] = await Promise.all([
    contar("v_bandeja_seguimiento").eq("urgente_contactar", true),
    contar("v_bandeja_seguimiento").is("ultimo_seguimiento_estado", null),
    ...TRAMOS.map((t) => contar("v_bandeja_seguimiento").or(filtroTramo(t.desde, t.hasta))),
  ]);
  const error = [urgentes, sinAtender, ...tramos].find((r) => r.error)?.error ?? null;
  const vacio: EsperaBandeja = {
    tramos: TRAMOS.map((t) => ({ ...t, personas: 0 })),
    urgentes: 0,
    sinAtender: 0,
  };
  if (error) return { datos: vacio, sinEsquema: esFaltaDeEsquema(error), aviso: error.message };
  return {
    datos: {
      tramos: TRAMOS.map((t, i) => ({ ...t, personas: tramos[i]?.count ?? 0 })),
      urgentes: urgentes.count ?? 0,
      sinAtender: sinAtender.count ?? 0,
    },
    sinEsquema: false,
    aviso: null,
  };
}

/* ---------------------------------------------------------------------------
 * Territorio: secciones prioritarias recorridas
 * ------------------------------------------------------------------------- */

export type AvancePrioritarias = {
  a: number;
  aRecorridas: number;
  b: number;
  bRecorridas: number;
};

/** Suma de las catorce filas de v_demarcacion_resumen, que ya vienen agregadas por la base. */
export async function avancePrioritarias(
  usuario: UsuarioActuante | null,
): Promise<Resultado<AvancePrioritarias>> {
  const r = await demarcacionesResumen(usuario);
  // Postgres devuelve los `count` como texto; Number() los regresa a número antes de sumar.
  const sumar = (valor: (d: (typeof r.datos)[number]) => number) =>
    r.datos.reduce((s, d) => s + (Number(valor(d)) || 0), 0);
  return {
    ...r,
    datos: {
      a: sumar((d) => d.secciones_prioritarias_a),
      aRecorridas: sumar((d) => d.secciones_prioritarias_a_recorridas),
      b: sumar((d) => d.secciones_prioritarias_b),
      bRecorridas: sumar((d) => d.secciones_prioritarias_b_recorridas),
    },
  };
}

/* ---------------------------------------------------------------------------
 * Día de la elección: casillas con representante
 * ------------------------------------------------------------------------- */

export type AvanceCasillasTablero = {
  casillas: number;
  titulares: number;
  suplentes: number;
};

/**
 * Tres conteos en vez de traer las casillas con sus representantes. Un renglón de representante
 * existe solo si alguien lo guardó con nombre, la misma regla que `representanteCubierto`.
 */
export async function avanceCasillas(
  usuario: UsuarioActuante | null,
): Promise<Resultado<AvanceCasillasTablero>> {
  void usuario;
  const [casillas, titulares, suplentes] = await Promise.all([
    contar("casillas"),
    contar("representantes_casilla").eq("cargo", "titular").neq("nombre", ""),
    contar("representantes_casilla").eq("cargo", "suplente").neq("nombre", ""),
  ]);
  const error = casillas.error ?? titulares.error ?? suplentes.error;
  if (error) {
    return {
      datos: { casillas: 0, titulares: 0, suplentes: 0 },
      sinEsquema: esFaltaDeEsquema(error),
      aviso: error.message,
    };
  }
  return {
    datos: {
      casillas: casillas.count ?? 0,
      titulares: titulares.count ?? 0,
      suplentes: suplentes.count ?? 0,
    },
    sinEsquema: false,
    aviso: null,
  };
}

/* ---------------------------------------------------------------------------
 * Lo que más piden
 * ------------------------------------------------------------------------- */

export type TotalProblematica = { problematica: string; menciones: number };

export async function problematicasPrincipales(
  usuario: UsuarioActuante | null,
): Promise<Resultado<{ principales: TotalProblematica[]; total: number }>> {
  const r = await problematicasPorSeccion(usuario);
  const conteo = new Map<string, number>();
  for (const m of r.datos) {
    conteo.set(m.problematica, (conteo.get(m.problematica) ?? 0) + Number(m.menciones));
  }
  const todas = [...conteo.entries()]
    .map(([problematica, menciones]) => ({ problematica, menciones }))
    .sort((a, b) => b.menciones - a.menciones);
  return {
    ...r,
    datos: {
      principales: todas.slice(0, 5),
      total: todas.reduce((s, p) => s + p.menciones, 0),
    },
  };
}

/* ---------------------------------------------------------------------------
 * Equipo: quién capturó esta semana
 * ------------------------------------------------------------------------- */

export type CapturaEquipo = { nombre: string; personas: number };

export type ActividadEquipo = {
  /** Quienes capturaron en los últimos siete días, de más a menos. */
  activos: CapturaEquipo[];
  /** Cuentas activas de campo (no administradores) sin ninguna captura en siete días. */
  sinCapturar: number;
};

/** Solo el administrador lee a los demás usuarios; para cualquier otro rol sale vacío. */
export async function actividadEquipo(
  usuario: UsuarioActuante | null,
): Promise<Resultado<ActividadEquipo>> {
  const vacio: ActividadEquipo = { activos: [], sinCapturar: 0 };
  if (!esAdmin(usuario)) return { datos: vacio, sinEsquema: false, aviso: null };

  const [capturas, usuarios] = await Promise.all([
    capturasPorUsuario(usuario),
    lista<{ id: string; nombre: string; rol: string; activo: boolean }>(
      db().from("usuarios").select("id, nombre, rol, activo"),
    ),
  ]);
  if (capturas.aviso || usuarios.aviso) {
    return { datos: vacio, sinEsquema: false, aviso: capturas.aviso ?? usuarios.aviso };
  }

  const porUsuario = new Map(capturas.datos.map((c) => [c.usuario_id, c.personas_7_dias]));
  const activos = usuarios.datos
    .map((u) => ({ nombre: u.nombre, personas: porUsuario.get(u.id) ?? 0 }))
    .filter((u) => u.personas > 0)
    .sort((a, b) => b.personas - a.personas);
  const sinCapturar = usuarios.datos.filter(
    (u) => u.activo && u.rol !== "admin" && !porUsuario.get(u.id),
  ).length;

  return { datos: { activos, sinCapturar }, sinEsquema: false, aviso: null };
}
