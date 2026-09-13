/**
 * Acceso a casillas y a sus representantes. Todo recorte territorial sale de lib/permisos.ts,
 * sobre `seccion_clave`: la casilla no tiene demarcación propia, hereda la de su sección.
 *
 * La sección electoral es la única unidad territorial exacta (spec/alcance.md): esta tabla ya
 * trae `seccion_clave` resuelta desde el archivo de coordenadas, no se vuelve a calcular aquí.
 */

import {
  alcanceDe,
  aplicarAlcance,
  puedeEncabezarActividad,
  puedeVerRegistro,
  type ConTerritorio,
} from "@/lib/permisos";
import { DEMARCACIONES } from "@/lib/demarcaciones";
import { cargarSecciones, normalizarTelefono, rasgoPorClave } from "@/lib/territorio";
import type { UsuarioActuante } from "@/lib/tipos";
import { db, lista, uno, type Resultado } from "@/lib/datos/cliente";

/* ---------------------------------------------------------------------------
 * Tipos
 * ------------------------------------------------------------------------- */

export type TipoCasilla = "BASICA" | "CONTIGUA";

export type CargoRepresentante = "titular" | "suplente";
export type EstadoCapacitacion = "capacitado" | "por_capacitar";
export type EstadoManual = "entregado" | "pendiente";
export type EstadoAcreditacion = "acreditado" | "pendiente";

export type Casilla = {
  id: number;
  seccion_clave: string;
  tipo: TipoCasilla;
  numero: number;
  domicilio: string | null;
  ubicacion: string | null;
  referencia: string | null;
  lat: number;
  lng: number;
};

export type RepresentanteCasilla = {
  id: string;
  casilla_id: number;
  cargo: CargoRepresentante;
  persona_id: string | null;
  nombre: string;
  telefono_norm: string | null;
  capacitacion: EstadoCapacitacion;
  manual: EstadoManual;
  acreditacion: EstadoAcreditacion;
  registrado_por: string | null;
};

/** Fila cruda que devuelve Supabase con el embed de representantes_casilla. */
type FilaCasilla = Casilla & { representantes_casilla: RepresentanteCasilla[] | null };

export type CasillaConRepresentantes = Casilla & {
  titular: RepresentanteCasilla | null;
  suplente: RepresentanteCasilla | null;
};

const COLUMNAS_CASILLA =
  "id, seccion_clave, tipo, numero, domicilio, ubicacion, referencia, lat, lng, representantes_casilla(*)";

function armarCasilla(fila: FilaCasilla): CasillaConRepresentantes {
  const representantes = fila.representantes_casilla ?? [];
  return {
    id: fila.id,
    seccion_clave: fila.seccion_clave,
    tipo: fila.tipo,
    numero: fila.numero,
    domicilio: fila.domicilio,
    ubicacion: fila.ubicacion,
    referencia: fila.referencia,
    lat: fila.lat,
    lng: fila.lng,
    titular: representantes.find((r) => r.cargo === "titular") ?? null,
    suplente: representantes.find((r) => r.cargo === "suplente") ?? null,
  };
}

/**
 * `casillas` no trae `demarcacion_id` propio: a diferencia de personas y actividades, aquí no
 * viene denormalizado (spec/modelo-datos.md sí lo pide para esas tablas, precisamente para que
 * `aplicarAlcance` filtre con una sola columna). La casilla solo hereda su sección, así que un
 * responsable de demarcación se resuelve aparte: se toman las claves de sección que caen en su
 * demarcación según la cartografía cacheada (la misma que usa el resto de la aplicación) y se
 * filtra con `.in(...)`. Para "todo", "sección" y "ninguno" sí basta la columna `seccion_clave`
 * y ahí aplicarAlcance funciona igual que en cualquier otra tabla.
 */
async function clavesDeSeccionPorDemarcacion(demarcacionId: number): Promise<string[]> {
  const nombre = DEMARCACIONES.find((d) => d.id === demarcacionId)?.nombre;
  if (!nombre) return [];
  const coleccion = await cargarSecciones();
  return coleccion.features
    .filter((rasgo) => rasgo.properties.demarcacion === nombre)
    .map((rasgo) => rasgo.properties.clave);
}

/** Demarcación de una sección, resuelta contra la cartografía cacheada. Null si no se conoce. */
export function demarcacionIdDeSeccion(seccionClave: string): number | null {
  const rasgo = rasgoPorClave(seccionClave);
  if (!rasgo) return null;
  return DEMARCACIONES.find((d) => d.nombre === rasgo.properties.demarcacion)?.id ?? null;
}

/**
 * Todas las casillas del territorio del actuante, con su sección y sus dos representantes (o
 * null cuando todavía no se han capturado). Orden por sección y número, que es como se buscan
 * en campo.
 */
export async function listarCasillas(
  usuario: UsuarioActuante | null,
): Promise<Resultado<CasillaConRepresentantes[]>> {
  let consulta = db().from("casillas").select(COLUMNAS_CASILLA);

  const alcance = alcanceDe(usuario);
  if (alcance.tipo === "demarcacion") {
    const claves = await clavesDeSeccionPorDemarcacion(alcance.demarcacionId);
    consulta =
      claves.length > 0
        ? consulta.in("seccion_clave", claves)
        : consulta.eq("seccion_clave", "__sin_territorio__");
  } else {
    consulta = aplicarAlcance(consulta, usuario);
  }

  const r = await lista<FilaCasilla>(
    consulta.order("seccion_clave", { ascending: true }).order("numero", { ascending: true }),
  );
  return { ...r, datos: r.datos.map(armarCasilla) };
}

/**
 * Si un titular y un suplente cuentan como "cubiertos" para el avance y para el color del punto
 * en el mapa. Una fila existe solo si alguien la guardó desde esta pantalla, así que basta con
 * que tenga nombre.
 */
export function representanteCubierto(
  representante: RepresentanteCasilla | null | undefined,
): boolean {
  return !!representante && representante.nombre.trim() !== "";
}

/** Los tres estados del punto en el mapa: sin nadie, solo uno de los dos, o completo. */
export type AvancePunto = "vacia" | "parcial" | "completa";

export function avanceDeCasilla(casilla: CasillaConRepresentantes): AvancePunto {
  const t = representanteCubierto(casilla.titular);
  const s = representanteCubierto(casilla.suplente);
  if (t && s) return "completa";
  if (t || s) return "parcial";
  return "vacia";
}

export type AvanceCasillas = {
  titularesCubiertos: number;
  suplentesCubiertos: number;
  total: number;
};

/**
 * Conteo de avance sobre una lista de casillas ya recortada al territorio del actuante (la que
 * devuelve listarCasillas, o el subconjunto que deje el filtro de sección de la pantalla: el
 * recorte sigue siendo el mismo, nomás más chico).
 */
export function calcularAvance(casillas: readonly CasillaConRepresentantes[]): AvanceCasillas {
  let titulares = 0;
  let suplentes = 0;
  for (const casilla of casillas) {
    if (representanteCubierto(casilla.titular)) titulares++;
    if (representanteCubierto(casilla.suplente)) suplentes++;
  }
  return { titularesCubiertos: titulares, suplentesCubiertos: suplentes, total: casillas.length };
}

/**
 * Casillas de una sección exacta, con sus representantes ya resueltos: la pantalla de alta
 * (app/registrar-representante) necesita saber de inmediato si el titular o el suplente ya están
 * ocupados, antes de que alguien elija cargo, así que no vale la pena traer la casilla "pelona" y
 * pedir los representantes aparte. Mismo recorte territorial que listarCasillas, nomás acotado a
 * una clave.
 */
export async function buscarCasillasPorSeccion(
  usuario: UsuarioActuante | null,
  seccionClave: string,
): Promise<Resultado<CasillaConRepresentantes[]>> {
  let consulta = db().from("casillas").select(COLUMNAS_CASILLA).eq("seccion_clave", seccionClave);

  const alcance = alcanceDe(usuario);
  if (alcance.tipo === "demarcacion") {
    // Una sola clave: más barato comparar su demarcación que traer todo el catálogo de la
    // demarcación como hace listarCasillas para su filtro .in(...).
    if (demarcacionIdDeSeccion(seccionClave) !== alcance.demarcacionId) {
      return { datos: [], sinEsquema: false, aviso: null };
    }
  } else {
    consulta = aplicarAlcance(consulta, usuario);
  }

  const r = await lista<FilaCasilla>(consulta.order("numero", { ascending: true }));
  return { ...r, datos: r.datos.map(armarCasilla) };
}

/**
 * Una casilla por id, con sus representantes. Sirve para refrescar el estado de ocupación justo
 * después de guardar (guardarRepresentante solo devuelve el renglón que se acaba de escribir, no
 * la casilla completa) sin volver a teclear la búsqueda por sección.
 */
export async function casillaPorId(
  usuario: UsuarioActuante | null,
  id: number,
): Promise<Resultado<CasillaConRepresentantes | null>> {
  const r = await uno<FilaCasilla>(
    db().from("casillas").select(COLUMNAS_CASILLA).eq("id", id).maybeSingle(),
  );
  if (!r.datos) return { ...r, datos: null };

  const territorio: ConTerritorio = {
    seccion_clave: r.datos.seccion_clave,
    demarcacion_id: demarcacionIdDeSeccion(r.datos.seccion_clave),
  };
  if (!puedeVerRegistro(usuario, territorio)) {
    return { datos: null, sinEsquema: false, aviso: "Esta casilla está fuera de tu territorio." };
  }
  return { ...r, datos: armarCasilla(r.datos) };
}

/**
 * Quién puede registrar o editar representantes de una casilla: el mismo criterio que encabezar
 * una actividad (nadie de capturista suelto, esto es coordinación), y siempre dentro de su
 * territorio. No se duplica la regla de alcance: se le pregunta a lib/permisos.ts, con la
 * demarcación resuelta desde la sección porque la casilla no la trae consigo (ver
 * demarcacionIdDeSeccion).
 */
export function puedeEditarRepresentantes(
  usuario: UsuarioActuante | null,
  casilla: Pick<Casilla, "seccion_clave">,
): boolean {
  const territorio: ConTerritorio = {
    seccion_clave: casilla.seccion_clave,
    demarcacion_id: demarcacionIdDeSeccion(casilla.seccion_clave),
  };
  return puedeEncabezarActividad(usuario) && puedeVerRegistro(usuario, territorio);
}

/* ---------------------------------------------------------------------------
 * Alta y edición de representantes
 * ------------------------------------------------------------------------- */

export type EntradaRepresentante = {
  casillaId: number;
  cargo: CargoRepresentante;
  nombre: string;
  telefonoRaw?: string | null;
  personaId?: string | null;
  capacitacion: EstadoCapacitacion;
  manual: EstadoManual;
  acreditacion: EstadoAcreditacion;
};

/**
 * Alta o edición de un titular o un suplente. La llave única (casilla_id, cargo) hace que esto
 * sea siempre un upsert: no hay un camino de creación distinto al de edición.
 */
export async function guardarRepresentante(
  usuario: UsuarioActuante | null,
  casilla: Pick<Casilla, "seccion_clave">,
  entrada: EntradaRepresentante,
): Promise<Resultado<RepresentanteCasilla | null>> {
  if (!puedeEditarRepresentantes(usuario, casilla)) {
    return {
      datos: null,
      sinEsquema: false,
      aviso: "No puedes editar representantes en esta casilla.",
    };
  }

  const fila = {
    casilla_id: entrada.casillaId,
    cargo: entrada.cargo,
    persona_id: entrada.personaId ?? null,
    nombre: entrada.nombre.trim(),
    telefono_norm: normalizarTelefono(entrada.telefonoRaw),
    capacitacion: entrada.capacitacion,
    manual: entrada.manual,
    acreditacion: entrada.acreditacion,
    registrado_por: usuario?.id ?? null,
  };

  return uno<RepresentanteCasilla>(
    db()
      .from("representantes_casilla")
      .upsert(fila, { onConflict: "casilla_id,cargo" })
      .select()
      .single(),
  );
}
