/**
 * Territorio: carga de secciones.geojson, punto en polígono en el cliente, y normalización de
 * teléfono para deduplicación.
 *
 * `seccionPorPunto` es la contraparte en el cliente de la función `seccion_por_punto` de
 * supabase/schema.sql (st_contains contra secciones_geom, primer resultado). Ambas rutas deben
 * dar el mismo resultado; la comprobación cruzada contra la base queda pendiente porque el
 * esquema y los datos todavía no existen ahí.
 */

export type PropiedadesSeccion = {
  seccion: number;
  clave: string;
  demarcacion: string;
  distrito_local: number | null;
  distrito_federal: number | null;
  area_km2: number | null;
  lon: number;
  lat: number;
  sustituta?: boolean;
  confianza?: string;
  secciones_sucesoras?: number[];
  nota?: string;
};

export type RasgoSeccion = {
  type: "Feature";
  properties: PropiedadesSeccion;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

export type ColeccionSecciones = {
  type: "FeatureCollection";
  features: RasgoSeccion[];
};

/* ---------------------------------------------------------------------------
 * Carga y caché
 * ------------------------------------------------------------------------- */

let coleccionCacheada: ColeccionSecciones | null = null;
let promesaEnCurso: Promise<ColeccionSecciones> | null = null;

/**
 * Pide `/datos/secciones.geojson` y lo guarda en caché de módulo. Llamadas concurrentes
 * comparten la misma promesa en lugar de disparar varias peticiones.
 */
export async function cargarSecciones(): Promise<ColeccionSecciones> {
  if (coleccionCacheada) return coleccionCacheada;
  if (promesaEnCurso) return promesaEnCurso;

  promesaEnCurso = (async () => {
    let respuesta: Response;
    try {
      respuesta = await fetch("/datos/secciones.geojson");
    } catch {
      promesaEnCurso = null;
      throw new Error(
        "No se pudo cargar el mapa de secciones: falló la petición de red a /datos/secciones.geojson.",
      );
    }
    if (!respuesta.ok) {
      promesaEnCurso = null;
      throw new Error(
        `No se pudo cargar el mapa de secciones: el servidor respondió ${respuesta.status}.`,
      );
    }
    const datos = (await respuesta.json()) as ColeccionSecciones;
    coleccionCacheada = datos;
    promesaEnCurso = null;
    return datos;
  })();

  return promesaEnCurso;
}

/** Lo que ya esté en caché, o null si `cargarSecciones` no se ha resuelto todavía. */
export function seccionesCargadas(): ColeccionSecciones | null {
  return coleccionCacheada;
}

/* ---------------------------------------------------------------------------
 * Punto en polígono
 * ------------------------------------------------------------------------- */

type Bbox = [number, number, number, number]; // oeste, sur, este, norte

// Cajas envolventes precalculadas por colección, para no recorrer coordenadas en cada consulta.
const bboxPorColeccion = new WeakMap<ColeccionSecciones, Map<string, Bbox>>();

function bboxDeAnillo(anillo: number[][], caja: Bbox): void {
  for (const [lng, lat] of anillo) {
    if (lng < caja[0]) caja[0] = lng;
    if (lat < caja[1]) caja[1] = lat;
    if (lng > caja[2]) caja[2] = lng;
    if (lat > caja[3]) caja[3] = lat;
  }
}

/** Caja envolvente [oeste, sur, este, norte] de un rasgo, sin usar caché. */
export function bboxDeRasgo(rasgo: RasgoSeccion): Bbox {
  const caja: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const { geometry } = rasgo;
  if (geometry.type === "Polygon") {
    for (const anillo of geometry.coordinates as number[][][]) {
      bboxDeAnillo(anillo, caja);
    }
  } else {
    for (const poligono of geometry.coordinates as number[][][][]) {
      for (const anillo of poligono) {
        bboxDeAnillo(anillo, caja);
      }
    }
  }
  return caja;
}

function bboxPorClaveDe(coleccion: ColeccionSecciones): Map<string, Bbox> {
  let mapa = bboxPorColeccion.get(coleccion);
  if (mapa) return mapa;
  mapa = new Map<string, Bbox>();
  for (const rasgo of coleccion.features) {
    mapa.set(rasgo.properties.clave, bboxDeRasgo(rasgo));
  }
  bboxPorColeccion.set(coleccion, mapa);
  return mapa;
}

function puntoEnCaja(lng: number, lat: number, caja: Bbox): boolean {
  return lng >= caja[0] && lng <= caja[2] && lat >= caja[1] && lat <= caja[3];
}

/** Cruce de rayos sobre un solo anillo. No decide agujero vs. exterior, solo pertenencia al anillo. */
function puntoEnAnillo(lng: number, lat: number, anillo: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Un polígono (anillo exterior + agujeros) contiene al punto si está en el exterior y en ningún agujero. */
function puntoEnPoligono(lng: number, lat: number, anillos: number[][][]): boolean {
  const [exterior, ...agujeros] = anillos;
  if (!exterior || !puntoEnAnillo(lng, lat, exterior)) return false;
  for (const agujero of agujeros) {
    if (puntoEnAnillo(lng, lat, agujero)) return false;
  }
  return true;
}

function rasgoContienePunto(lng: number, lat: number, rasgo: RasgoSeccion): boolean {
  const { geometry } = rasgo;
  if (geometry.type === "Polygon") {
    return puntoEnPoligono(lng, lat, geometry.coordinates as number[][][]);
  }
  for (const poligono of geometry.coordinates as number[][][][]) {
    if (puntoEnPoligono(lng, lat, poligono)) return true;
  }
  return false;
}

/**
 * Punto en polígono contra el GeoJSON cacheado, sin llamar a la base y sin librerías. Recorre los
 * rasgos en el orden del archivo y devuelve la clave del primero que contenga el punto, igual que
 * el `limit 1` de `seccion_por_punto` en supabase/schema.sql. Devuelve null si el punto no cae en
 * ninguna sección (hay huecos entre polígonos y el municipio tiene frontera) o si no hay colección
 * disponible.
 */
export function seccionPorPunto(
  lng: number,
  lat: number,
  coleccion?: ColeccionSecciones,
): string | null {
  const datos = coleccion ?? coleccionCacheada;
  if (!datos) return null;

  const bboxPorClave = bboxPorClaveDe(datos);

  for (const rasgo of datos.features) {
    const caja = bboxPorClave.get(rasgo.properties.clave);
    if (caja && !puntoEnCaja(lng, lat, caja)) continue;
    if (rasgoContienePunto(lng, lat, rasgo)) return rasgo.properties.clave;
  }
  return null;
}

/** Rasgo de una sección por su clave, o null si no existe en la colección. */
export function rasgoPorClave(
  clave: string,
  coleccion?: ColeccionSecciones,
): RasgoSeccion | null {
  const datos = coleccion ?? coleccionCacheada;
  if (!datos) return null;
  return datos.features.find((rasgo) => rasgo.properties.clave === clave) ?? null;
}

/** Centro [lon, lat] de una sección, tomado de sus propiedades. No se calcula aquí. */
export function centroDeSeccion(
  clave: string,
  coleccion?: ColeccionSecciones,
): [number, number] | null {
  const rasgo = rasgoPorClave(clave, coleccion);
  if (!rasgo) return null;
  return [rasgo.properties.lon, rasgo.properties.lat];
}

/* ---------------------------------------------------------------------------
 * Teléfono: normalización y deduplicación
 * ------------------------------------------------------------------------- */

const INICIO_RANGO_SEMBRADO = 9511000000;
const FIN_RANGO_SEMBRADO = 9511009999;

/**
 * Normaliza un teléfono a sus últimos 10 dígitos, o null si no queda nada. Esta es la llave de
 * deduplicación de personas (personas.telefono_norm). Debe coincidir exactamente con la función
 * SQL `normalizar_telefono` de supabase/schema.sql:
 *
 *   select nullif(right(regexp_replace(coalesce(t,''), '\D', '', 'g'), 10), '');
 *
 * Si cambias esta función, cambia también la de schema.sql, o la deduplicación del cliente y la
 * del servidor van a divergir.
 */
export function normalizarTelefono(entrada: string | null | undefined): string | null {
  const soloDigitos = (entrada ?? "").replace(/\D/g, "");
  const ultimosDiez = soloDigitos.slice(-10);
  return ultimosDiez === "" ? null : ultimosDiez;
}

/** Formato legible "951 100 4821" a partir de los diez dígitos normalizados. */
export function formatearTelefono(normalizado: string | null | undefined): string {
  if (!normalizado) return "";
  return `${normalizado.slice(0, 3)} ${normalizado.slice(3, 6)} ${normalizado.slice(6, 10)}`;
}

/**
 * True si el número cae en el rango sembrado 951 100 0000 a 951 100 9999. Ningún dato personal
 * real entra a este proyecto: sirve para advertir en la interfaz si alguien captura un teléfono
 * que no es de prueba.
 */
export function esTelefonoSembrado(normalizado: string | null | undefined): boolean {
  if (!normalizado || normalizado.length !== 10) return false;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return false;
  return numero >= INICIO_RANGO_SEMBRADO && numero <= FIN_RANGO_SEMBRADO;
}

/* ---------------------------------------------------------------------------
 * Teléfono: validación de número mexicano
 * ------------------------------------------------------------------------- */

/**
 * Las cuatro ladas de dos dígitos que existen en México. Todo lo demás usa lada de tres.
 * El catálogo completo del IFT tiene cientos de claves y cambia; aquí se valida la forma, no la
 * existencia exacta de la clave. Anotado en PENDIENTES.md.
 */
const LADAS_DE_DOS_DIGITOS = ["33", "55", "56", "81"] as const;

export type ResultadoTelefono =
  | { valido: true; normalizado: string }
  | { valido: false; motivo: string };

/**
 * Valida que lo capturado pueda ser un teléfono mexicano de diez dígitos. Devuelve el motivo en
 * español, listo para mostrarse debajo del campo: el capturista tiene que saber qué corregir.
 *
 * No confirma que la línea exista, eso solo lo sabe el operador. Confirma la forma.
 */
export function validarTelefonoMexicano(
  entrada: string | null | undefined,
): ResultadoTelefono {
  const soloDigitos = (entrada ?? "").replace(/\D/g, "");

  if (soloDigitos === "") {
    return { valido: false, motivo: "Falta el teléfono." };
  }

  // Con lada de país: 52 al frente, o 521 del formato viejo de celular.
  let digitos = soloDigitos;
  if (digitos.length === 12 && digitos.startsWith("52")) digitos = digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith("521")) digitos = digitos.slice(3);

  if (digitos.length < 10) {
    const faltan = 10 - digitos.length;
    return {
      valido: false,
      motivo: `Faltan ${faltan} ${faltan === 1 ? "dígito" : "dígitos"}: son diez.`,
    };
  }
  if (digitos.length > 10) {
    return { valido: false, motivo: "Sobran dígitos: son diez." };
  }

  if (digitos[0] === "0" || digitos[0] === "1") {
    return { valido: false, motivo: "Ningún teléfono mexicano empieza con 0 ni con 1." };
  }

  if (/^(\d)\1{9}$/.test(digitos)) {
    return { valido: false, motivo: "Ese número no puede ser real." };
  }

  const esDeDos = (LADAS_DE_DOS_DIGITOS as readonly string[]).includes(
    digitos.slice(0, 2),
  );
  const lada = esDeDos ? digitos.slice(0, 2) : digitos.slice(0, 3);
  const local = digitos.slice(lada.length);

  if (!esDeDos && local[0] === "0") {
    return { valido: false, motivo: "Revisa la lada, no parece una clave válida." };
  }

  return { valido: true, normalizado: digitos };
}

/** True si el teléfono capturado tiene forma de número mexicano. Atajo para la interfaz. */
export function esTelefonoMexicano(entrada: string | null | undefined): boolean {
  return validarTelefonoMexicano(entrada).valido;
}
