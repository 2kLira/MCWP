/**
 * Carga la cartografía de data/ a la base, por la API REST de Supabase.
 *
 *   npm run db:importar    carga demarcaciones, secciones, geometría, colonias y traslapes
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
  console.log("Vaciando las tablas…");
  await vaciar("colonia_seccion", "colonia_id", "gte");
  await vaciar("secciones_geom", "clave", "neq");
  await vaciar("colonias", "id", "gte");
  await vaciar("secciones", "clave", "neq");
  await vaciar("demarcaciones", "id", "gte");

  const filasDemarcaciones = catalogo.demarcaciones.map((d, i) => ({
    id: i + 1,
    nombre: d.demarcacion,
    slug: aSlug(d.demarcacion),
    centro_lat: d.centro.lat,
    centro_lng: d.centro.lon,
  }));
  await insertarPorLotes("demarcaciones", filasDemarcaciones, 200);
  console.log(`Demarcaciones: ${catalogo.demarcaciones.length}`);

  // --- Secciones. Las 157 que tienen geometría, incluidas las 6 sustitutas.
  const filasSecciones = secciones.map((rasgo) => {
    const p = rasgo.properties;
    const demarcacionId = idPorDemarcacion.get(p.demarcacion);
    if (!demarcacionId) {
      throw new Error(
        `La sección ${p.clave} trae la demarcación "${p.demarcacion}", que no está en el catálogo.`,
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
      es_sustituta: p.sustituta === true,
      nota: p.nota ?? null,
    };
  });
  await insertarPorLotes("secciones", filasSecciones, 200);
  const sustitutas = secciones.filter((s) => s.properties.sustituta).length;
  console.log(`Secciones: ${secciones.length} (${sustitutas} sustitutas)`);

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
  await insertarPorLotes("colonias", filasColonias, 200);
  console.log(`Colonias: ${colonias.length}`);

  // --- Traslape colonia-sección. Umbral de corte ya aplicado en el archivo. -
  const filasTraslapes = traslapes.map((fila) => ({
    colonia_id: Number(fila.colonia_id),
    seccion_clave: fila.seccion,
    traslape_pct: Number(fila.traslape_pct),
  }));
  await insertarPorLotes("colonia_seccion", filasTraslapes, 200);
  console.log(`Traslapes colonia-sección: ${filasTraslapes.length} de ${traslapes.length}`);

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

  // --- Conteo final. ----------------------------------------------------------
  const tablas = ["demarcaciones", "secciones", "secciones_geom", "colonias", "colonia_seccion"];
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
