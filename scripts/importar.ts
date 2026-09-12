/**
 * Carga la cartografía de data/ a la base, por la API REST de Supabase.
 *
 *   npm run db:importar    carga demarcaciones, secciones (catálogo + sustitutas), geometría,
 *                         colonias, traslapes y casillas
 *
 * El esquema no lo aplica este script: se aplica aparte, pegando el contenido de
 * supabase/schema.sql en el editor SQL de Supabase (SQL Editor → Run). No tenemos la
 * contraseña de la base, solo las llaves de API, así que no hay conexión directa a Postgres:
 * todo se escribe con @supabase/supabase-js y la llave secreta (SUPABASE_SECRET_KEY), que
 * salta las políticas de Row Level Security y por eso solo debe usarse desde scripts como
 * este, nunca en el navegador.
 *
 * Los archivos de data/ ya vienen limpios, en EPSG:4326. Este script no los reproyecta, no los
 * simplifica y no los corrige: los lee tal cual y los manda a la base.
 *
 * Los identificadores de demarcación se asignan explícitamente en el orden de demarcaciones.json,
 * el mismo que declara lib/demarcaciones.ts. Si ese orden cambia, cambian los dos.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const RAIZ = process.cwd();
const DATA = join(RAIZ, "data");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const llaveSecreta = process.env.SUPABASE_SECRET_KEY;

if (!url || !llaveSecreta) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY. Cópialas de .env.example a\n" +
      ".env.local con los valores de Settings → API keys del proyecto de Supabase.",
  );
  process.exit(1);
}

// La llave secreta salta Row Level Security: es la que corresponde para un script de carga
// que corre fuera del navegador, nunca la anon key.
const supabase = createClient(url, llaveSecreta, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* --------------------------------------------------------------------------
 * Lectura de los archivos
 * ------------------------------------------------------------------------ */

type Rasgo<P> = {
  type: "Feature";
  properties: P;
  geometry: { type: string; coordinates: unknown };
};

type PropsSeccion = {
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

type PropsColonia = {
  colonia_id: number;
  nombre: string;
  cp: number | string | null;
  demarcacion_principal: string;
  partida: boolean;
  secciones: string[];
};

type Catalogo = {
  meta: Record<string, unknown>;
  demarcaciones: {
    demarcacion: string;
    centro: { lon: number; lat: number };
  }[];
};

function leerJson<T>(archivo: string): T {
  return JSON.parse(readFileSync(join(DATA, archivo), "utf8")) as T;
}

/** Parte una línea de CSV respetando las comillas: hay colonias con coma en el nombre. */
function partirLinea(linea: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i];
    if (caracter === '"') {
      // Dos comillas seguidas dentro de un campo entrecomillado son una comilla literal.
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === "," && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += caracter;
    }
  }
  celdas.push(actual);
  return celdas;
}

function leerCsv(archivo: string): Record<string, string>[] {
  const texto = readFileSync(join(DATA, archivo), "utf8").replace(/^﻿/, "");
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const encabezado = partirLinea(lineas[0]);
  return lineas.slice(1).map((linea) => {
    const celdas = partirLinea(linea);
    return Object.fromEntries(
      encabezado.map((columna, i) => [columna, celdas[i] ?? ""]),
    );
  });
}

function aSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* --------------------------------------------------------------------------
 * Conversión de GeoJSON a EWKT
 *
 * La API REST no puede llamar funciones de PostGIS como st_geomfromgeojson: la geometría hay
 * que mandarla ya como texto que Postgres entienda directo al insertar. La columna
 * secciones_geom.geom es geometry(MultiPolygon, 4326), pero los archivos de data/ traen
 * polígonos sueltos (type: "Polygon"), así que cada uno se envuelve aquí en un MultiPolygon de
 * un solo elemento; si algún día llegara ya como MultiPolygon, se respeta tal cual. Las
 * coordenadas se escriben en el mismo orden y con los mismos decimales del archivo, sin
 * redondear ni recalcular nada.
 * ------------------------------------------------------------------------ */

type Posicion = [number, number];
type Anillo = Posicion[];
type CoordsPoligono = Anillo[];
type CoordsMultiPoligono = CoordsPoligono[];

function anilloAEwkt(anillo: Anillo): string {
  return "(" + anillo.map(([lon, lat]) => `${lon} ${lat}`).join(",") + ")";
}

function poligonoAEwkt(poligono: CoordsPoligono): string {
  // El primer anillo es el borde exterior; los siguientes, si los hay, son huecos. EWKT no
  // distingue la sintaxis entre uno y otro: todos se escriben igual, en el orden en que vienen.
  return "(" + poligono.map(anilloAEwkt).join(",") + ")";
}

function geometriaAEwkt(geometry: { type: string; coordinates: unknown }): string {
  let poligonos: CoordsMultiPoligono;

  if (geometry.type === "Polygon") {
    poligonos = [geometry.coordinates as CoordsPoligono];
  } else if (geometry.type === "MultiPolygon") {
    poligonos = geometry.coordinates as CoordsMultiPoligono;
  } else {
    throw new Error(`Tipo de geometría no soportado en secciones.geojson: ${geometry.type}`);
  }

  const cuerpo = poligonos.map(poligonoAEwkt).join(",");
  return `SRID=4326;MULTIPOLYGON(${cuerpo})`;
}

/* --------------------------------------------------------------------------
 * Utilidades de carga
 * ------------------------------------------------------------------------ */

/** Inserta en lotes de a lo más `tamanoLote` filas. Si un lote falla, imprime el error y sale. */
async function insertarPorLotes(
  tabla: string,
  filas: Record<string, unknown>[],
  tamanoLote: number,
): Promise<void> {
  for (let inicio = 0; inicio < filas.length; inicio += tamanoLote) {
    const lote = filas.slice(inicio, inicio + tamanoLote);
    const { error } = await supabase.from(tabla).insert(lote);
    if (error) {
      console.error(`Error al insertar en ${tabla}:`, error);
      process.exit(1);
    }
  }
}

/**
 * Sube en lotes de a lo más `tamanoLote` filas, con upsert contra `llaveConflicto` (una columna o,
 * para llaves compuestas, varias separadas por coma). A diferencia de `insertarPorLotes`, no borra
 * nada antes: fila que ya existe se actualiza en su lugar, fila nueva se inserta. Se usa donde otras
 * tablas cuelgan de la que se carga por llave foránea (secciones, demarcaciones, casillas), porque
 * ahí borrar-y-recrear tronaría contra esas llaves o, en el caso de casillas, correría abajo el id
 * serial y arrastraría en cascada a representantes_casilla.
 */
async function subirPorLotes(
  tabla: string,
  filas: Record<string, unknown>[],
  tamanoLote: number,
  llaveConflicto: string,
): Promise<void> {
  for (let inicio = 0; inicio < filas.length; inicio += tamanoLote) {
    const lote = filas.slice(inicio, inicio + tamanoLote);
    const { error } = await supabase.from(tabla).upsert(lote, { onConflict: llaveConflicto });
    if (error) {
      console.error(`Error al subir (upsert) en ${tabla}:`, error);
      process.exit(1);
    }
  }
}

/**
 * Borra todas las filas de una tabla. supabase-js exige un filtro en todo delete, así que se
 * usa uno que siempre se cumple: comparación contra la llave primaria de cada tabla.
 */
async function vaciar(tabla: string, columna: string, modo: "gte" | "neq"): Promise<void> {
  const base = supabase.from(tabla).delete();
  const { error } = modo === "gte" ? await base.gte(columna, 0) : await base.neq(columna, "");
  if (error) {
    console.error(`No se pudo vaciar la tabla ${tabla}:`, error);
    process.exit(1);
  }
}

/* --------------------------------------------------------------------------
 * Carga
 * ------------------------------------------------------------------------ */

async function main() {
  const catalogo = leerJson<Catalogo>("demarcaciones.json");
  const secciones = leerJson<{ features: Rasgo<PropsSeccion>[] }>(
    "secciones.geojson",
  ).features;
  const colonias = leerJson<{ features: Rasgo<PropsColonia>[] }>(
    "colonias.geojson",
  ).features;
  const traslapes = leerCsv("colonia-seccion-demarcacion.csv");
  const catalogoSecciones = leerCsv("secciones-catalogo.csv");
  const casillasCsv = leerCsv("casillas.csv");

  // --- Antes de cargar, confirma que el esquema ya está aplicado. -----------
  const { error: errorComprobacion } = await supabase
    .from("demarcaciones")
    .select("id")
    .limit(1);
  if (errorComprobacion) {
    console.error(
      "No se pudo leer la tabla demarcaciones. Aplica primero supabase/schema.sql en el editor\n" +
        "SQL de Supabase (SQL Editor → pega el contenido del archivo → Run) y vuelve a correr\n" +
        "este script.",
    );
    process.exit(1);
  }

  // --- Demarcaciones. Id explícito, en el orden del catálogo. ---------------
  const idPorDemarcacion = new Map<string, number>();
  catalogo.demarcaciones.forEach((d, i) => idPorDemarcacion.set(d.demarcacion, i + 1));

  // --- Limpieza previa, en orden inverso a las llaves foráneas. -------------
  // demarcaciones y secciones ya NO se vacían: personas y actividades apuntan a secciones.clave,
  // y secciones apunta a demarcaciones.id, así que borrar cualquiera de las dos sobre una base ya
  // sembrada tronaría contra esas llaves foráneas (o, peor, sí lo dejaría borrar y se llevaría
  // personas e historia con un cascade que no queremos). Las dos se cargan con upsert más abajo:
  // fila que ya existe se actualiza, fila nueva se inserta, y nada se borra nunca de por medio.
  // colonias tampoco se vacía: personas.colonia_id apunta ahí, así que sobre una base ya sembrada
  // el borrado lo rechaza la llave foránea. Va con upsert por id, igual que las otras dos.
  console.log("Vaciando las tablas sin dependientes…");
  await vaciar("colonia_seccion", "colonia_id", "gte");
  await vaciar("secciones_geom", "clave", "neq");

  const filasDemarcaciones = catalogo.demarcaciones.map((d, i) => ({
    id: i + 1,
    nombre: d.demarcacion,
    slug: aSlug(d.demarcacion),
    centro_lat: d.centro.lat,
    centro_lng: d.centro.lon,
  }));
  await subirPorLotes("demarcaciones", filasDemarcaciones, 200, "id");
  console.log(`Demarcaciones: ${catalogo.demarcaciones.length}`);

  // --- Secciones. Ahora 175: las 169 del catálogo del cliente (con lista nominal, prioridad y
  // en_catalogo = true) más las 6 sustitutas que el reseccionamiento del INE dejó fuera del
  // catálogo pero que se siguen pintando en el mapa (en_catalogo = false, sin lista nominal ni
  // prioridad). secciones_geom, más abajo, sigue recibiendo solo las 157 con polígono publicado:
  // 151 del catálogo y las 6 sustitutas. Las 18 del catálogo sin geometría entran a secciones y no
  // al mapa, tal cual pide el encargo.
  const geojsonPorClave = new Map(
    secciones.map((rasgo) => [rasgo.properties.clave, rasgo.properties]),
  );

  const filasSeccionesCatalogo = catalogoSecciones.map((fila) => {
    const clave = fila.seccion.trim();
    const demarcacionId = idPorDemarcacion.get(fila.demarcacion.trim());
    if (!demarcacionId) {
      throw new Error(
        `La sección ${clave} del catálogo trae la demarcación "${fila.demarcacion}", que no está ` +
          "en demarcaciones.json.",
      );
    }
    // Solo las 151 del catálogo con geometría aparecen también en secciones.geojson; de ahí salen
    // distrito, área y centro. Las 18 sin geometría se quedan con esos campos en null: no hay de
    // dónde sacarlos y no es este script el que inventa cartografía.
    const geo = geojsonPorClave.get(clave);
    const prioridad = fila.prioridad.trim() === "" ? null : fila.prioridad.trim();
    return {
      clave,
      numero: Number(clave),
      demarcacion_id: demarcacionId,
      distrito_local: geo?.distrito_local ?? null,
      distrito_federal: geo?.distrito_federal ?? null,
      area_km2: geo?.area_km2 ?? null,
      centro_lat: geo?.lat ?? null,
      centro_lng: geo?.lon ?? null,
      es_sustituta: false,
      nota: geo?.nota ?? null,
      lista_nominal: Number(fila.lista_nominal),
      prioridad,
      en_catalogo: true,
    };
  });

  // Las 6 sustitutas: ya venían en secciones.geojson, no están en el catálogo del cliente.
  const clavesSustitutasFueraCatalogo = ["0471", "0478", "0493", "0500", "0593", "0616"];
  const filasSustitutasFueraCatalogo = secciones
    .filter((rasgo) => clavesSustitutasFueraCatalogo.includes(rasgo.properties.clave))
    .map((rasgo) => {
      const p = rasgo.properties;
      const demarcacionId = idPorDemarcacion.get(p.demarcacion);
      if (!demarcacionId) {
        throw new Error(
          `La sustituta ${p.clave} trae la demarcación "${p.demarcacion}", que no está en el catálogo.`,
        );
      }
      return {
        clave: p.clave,
        numero: p.seccion,
        demarcacion_id: demarcacionId,
        distrito_local: p.distrito_local,
        distrito_federal: p.distrito_federal,
        area_km2: p.area_km2,
        centro_lat: p.lat,
        centro_lng: p.lon,
        es_sustituta: true,
        nota: p.nota ?? null,
        lista_nominal: null,
        prioridad: null,
        en_catalogo: false,
      };
    });
  if (filasSustitutasFueraCatalogo.length !== clavesSustitutasFueraCatalogo.length) {
    throw new Error(
      `Se esperaban ${clavesSustitutasFueraCatalogo.length} sustitutas fuera del catálogo en ` +
        `secciones.geojson y se encontraron ${filasSustitutasFueraCatalogo.length}.`,
    );
  }

  const filasSecciones = [...filasSeccionesCatalogo, ...filasSustitutasFueraCatalogo];
  await subirPorLotes("secciones", filasSecciones, 200, "clave");
  console.log(
    `Secciones: ${filasSecciones.length} (${filasSeccionesCatalogo.length} del catálogo, ` +
      `${filasSustitutasFueraCatalogo.length} sustitutas fuera del catálogo)`,
  );

  // --- Geometría. Los polígonos entran como MultiPolygon en 4326, en EWKT. --
  const filasGeom = secciones.map((rasgo) => ({
    clave: rasgo.properties.clave,
    geom: geometriaAEwkt(rasgo.geometry),
  }));
  await insertarPorLotes("secciones_geom", filasGeom, 25);
  console.log(`Geometría: ${secciones.length} polígonos en secciones_geom`);

  // --- Colonias. Capa de referencia y autocompletado. ------------------------
  const filasColonias = colonias.map((rasgo) => {
    const p = rasgo.properties;
    return {
      id: p.colonia_id,
      nombre: p.nombre,
      cp: p.cp == null ? null : String(p.cp),
      demarcacion_principal_id: idPorDemarcacion.get(p.demarcacion_principal) ?? null,
    };
  });
  await subirPorLotes("colonias", filasColonias, 200, "id");
  console.log(`Colonias: ${colonias.length}`);

  // --- Traslape colonia-sección. Umbral de corte ya aplicado en el archivo. -
  const filasTraslapes = traslapes.map((fila) => ({
    colonia_id: Number(fila.colonia_id),
    seccion_clave: fila.seccion,
    traslape_pct: Number(fila.traslape_pct),
  }));
  await insertarPorLotes("colonia_seccion", filasTraslapes, 200);
  console.log(`Traslapes colonia-sección: ${filasTraslapes.length} de ${traslapes.length}`);

  // --- Casillas. Con upsert, no con borrar-y-recrear: casillas.id es serial y
  // representantes_casilla cuelga de él con on delete cascade, así que vaciar esta tabla en una
  // base ya sembrada se llevaría entre las patas a los representantes ya capturados desde la
  // interfaz, que esta tarea tiene instrucción explícita de no tocar. La llave natural para el
  // upsert es la misma que ya declara el esquema (seccion_clave, tipo, numero).
  let casillasSinCoordenada = 0;
  const filasCasillas = casillasCsv.map((fila) => {
    const lat = Number(fila.lat);
    const lng = Number(fila.lng);
    const tieneCoordenada =
      fila.lat.trim() !== "" &&
      fila.lng.trim() !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);
    if (!tieneCoordenada) casillasSinCoordenada++;
    return {
      seccion_clave: fila.seccion.trim(),
      tipo: fila.tipo.trim(),
      numero: Number(fila.id_casilla),
      domicilio: fila.domicilio || null,
      ubicacion: fila.ubicacion || null,
      referencia: fila.referencia || null,
      lat: tieneCoordenada ? lat : null,
      lng: tieneCoordenada ? lng : null,
    };
  });
  await subirPorLotes("casillas", filasCasillas, 200, "seccion_clave,tipo,numero");
  console.log(
    `Casillas: ${filasCasillas.length} (${casillasSinCoordenada} sin coordenada)`,
  );

  // --- Verificación: las dos rutas de punto en polígono deben coincidir. ----
  const prueba = secciones[0].properties;
  try {
    const { data, error } = await supabase.rpc("seccion_por_punto", {
      lng: prueba.lon,
      lat: prueba.lat,
    });
    if (error) throw error;
    console.log(
      `Prueba de punto en polígono: el centroide de ${prueba.clave} resuelve a ${data ?? "nada"}`,
    );
  } catch (error) {
    console.warn(
      "No se pudo verificar la prueba de punto en polígono (rpc seccion_por_punto), se sigue de todos modos:",
      error,
    );
  }

  // --- Resumen del catálogo y de las casillas. --------------------------------
  const conGeometria = catalogoSecciones.filter((f) => f.tiene_geometria.trim() === "si").length;
  const sinGeometria = catalogoSecciones.filter((f) => f.tiene_geometria.trim() === "no").length;
  const prioridadA = catalogoSecciones.filter((f) => f.prioridad.trim() === "A").length;
  const prioridadB = catalogoSecciones.filter((f) => f.prioridad.trim() === "B").length;
  const listaNominalTotal = catalogoSecciones.reduce(
    (suma, f) => suma + Number(f.lista_nominal),
    0,
  );
  console.log("--- Resumen del catálogo ---");
  console.log(`Secciones del catálogo: ${filasSeccionesCatalogo.length}`);
  console.log(`Sustitutas fuera del catálogo: ${filasSustitutasFueraCatalogo.length}`);
  console.log(`Con geometría: ${conGeometria}  Sin geometría: ${sinGeometria}`);
  console.log(`Prioridad A: ${prioridadA}  Prioridad B: ${prioridadB}`);
  console.log(`Lista nominal total: ${listaNominalTotal}`);
  console.log(`Casillas cargadas: ${filasCasillas.length}  Sin coordenada: ${casillasSinCoordenada}`);

  // --- Conteo final. ----------------------------------------------------------
  const tablas = [
    "demarcaciones",
    "secciones",
    "secciones_geom",
    "colonias",
    "colonia_seccion",
    "casillas",
  ];
  const conteo: { tabla: string; filas: number | null }[] = [];
  for (const tabla of tablas) {
    const { count, error } = await supabase
      .from(tabla)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.error(`No se pudo contar la tabla ${tabla}:`, error);
      process.exit(1);
    }
    conteo.push({ tabla, filas: count });
  }
  console.table(conteo);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
