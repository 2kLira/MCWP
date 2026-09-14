/**
 * Siembra la base con datos de prueba: usuarios, asignaciones, personas, actividades,
 * participaciones, menciones de problemáticas, solicitudes y seguimientos.
 *
 *   npx tsx scripts/sembrar.ts             genera, imprime el informe y escribe a la base
 *   npx tsx scripts/sembrar.ts --simular   genera e imprime el informe, no escribe nada
 *
 * REGLA QUE NO SE NEGOCIA: ningún dato personal real. Todo aquí es sembrado. Los teléfonos
 * siempre caen en el rango 951 100 0000 a 951 100 9999 (spec/modelo-datos.md, CLAUDE.md), sin
 * repetirse, tomados de una baraja determinista del rango completo.
 *
 * DETERMINISMO: todo el sembrado sale de un único generador pseudoaleatorio (mulberry32) con
 * semilla fija, incluidos los uuid, que se derivan de ese generador en vez de crypto.randomUUID.
 * El script no toca Math.random ni Date.now dentro de la generación: la única lectura del reloj
 * es HOY, tomada una sola vez al arranque, para anclar "hoy" y las ventanas de fechas relativas.
 * Mientras se corra el mismo día, dos corridas producen exactamente los mismos datos. El orden
 * de recorrido de todo lo leído de la base se reordena explícitamente en memoria (por clave, por
 * id) para no depender del orden en que Postgres devuelva las filas.
 *
 * Este script solo escribe usuarios, asignaciones_responsable, personas, actividades,
 * actividad_brigadistas, participaciones, menciones_problematica, solicitudes y seguimientos.
 * No toca demarcaciones, secciones, secciones_geom, colonias ni colonia_seccion: esas las carga
 * scripts/importar.ts y este script solo las lee.
 *
 * Igual que scripts/importar.ts: sin conexión directa a Postgres (no tenemos la contraseña de
 * la base), todo por @supabase/supabase-js con la llave secreta, que salta Row Level Security y
 * por eso nunca debe usarse fuera de scripts como este.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { ACTUANTES } from "../lib/actuantes";
import { MUNICIPIO } from "../lib/demarcaciones";
import type { RolUsuario } from "../lib/tipos";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const llaveSecreta = process.env.SUPABASE_SECRET_KEY;

if (!url || !llaveSecreta) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY. Cópialas de .env.example a\n" +
      ".env.local con los valores de Settings → API keys del proyecto de Supabase.",
  );
  process.exit(1);
}

// La llave secreta salta Row Level Security: es la que corresponde para un script de sembrado
// que corre fuera del navegador, nunca la anon key.
const supabase = createClient(url, llaveSecreta, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SIMULAR = process.argv.includes("--simular");
const TAMANO_LOTE = 200;
const HOY = new Date();

/* ============================================================================================
 * Generador pseudoaleatorio determinista (mulberry32) y uuid derivados de él
 * ============================================================================================ */

const SEMILLA = 9511000; // fija a propósito: dos corridas del mismo día deben coincidir exacto.

function mulberry32(semilla: number): () => number {
  let estado = semilla | 0;
  return function siguiente(): number {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEMILLA);

/** uuid v4 determinista: los 16 bytes salen del mismo generador con semilla fija. */
function uuidDeterminista(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(rng() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Baraja Fisher-Yates in situ, determinista con el generador dado. */
function barajar<T>(arreglo: T[]): T[] {
  for (let i = arreglo.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arreglo[i], arreglo[j]] = [arreglo[j], arreglo[i]];
  }
  return arreglo;
}

function elegirUno<T>(opciones: readonly T[]): T {
  return opciones[Math.floor(rng() * opciones.length)];
}

function entero(desde: number, hasta: number): number {
  return desde + Math.floor(rng() * (hasta - desde + 1));
}

/** Sorteo ponderado: cada opción trae su peso relativo (no hace falta que sumen 1). */
function elegirPonderado<T>(opciones: { valor: T; peso: number }[]): T {
  const total = opciones.reduce((suma, o) => suma + o.peso, 0);
  let r = rng() * total;
  for (const o of opciones) {
    if (r < o.peso) return o.valor;
    r -= o.peso;
  }
  return opciones[opciones.length - 1].valor;
}

/** true con probabilidad p (0..1). */
function conProbabilidad(p: number): boolean {
  return rng() < p;
}

/* ============================================================================================
 * Reparto proporcional con resto más grande: convierte pesos en enteros que suman exactamente
 * el total pedido, sin perder ni sobrar unidades por el redondeo.
 * ============================================================================================ */

function repartirEntero(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const crudo = pesos.map((p) => (sumaPesos > 0 ? (p / sumaPesos) * total : 0));
  const base = crudo.map(Math.floor);
  const asignado = base.reduce((a, b) => a + b, 0);
  const restos = crudo
    .map((v, i) => ({ i, resto: v - base[i] }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  let sobra = total - asignado;
  for (let k = 0; k < restos.length && sobra > 0; k++) {
    base[restos[k].i] += 1;
    sobra--;
  }
  return base;
}

/** Igual que repartirEntero, pero garantiza al menos 1 por elemento cuando total >= pesos.length. */
function repartirConMinimoUno(total: number, pesos: number[]): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  if (total < n) return repartirEntero(total, pesos);
  const extra = repartirEntero(total - n, pesos);
  return extra.map((e) => e + 1);
}

/* ============================================================================================
 * Distancia entre centroides (haversine, en kilómetros) — usada para armar el vacío contiguo
 * de secciones en cero y para concentrar los recorridos en las zonas con más gente.
 * ============================================================================================ */

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const aRad = (g: number) => (g * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Punto al azar dentro del entorno de un centroide, en un radio corto (grados). */
function jitter(lat: number, lng: number, radioGrados = 0.0025): { lat: number; lng: number } {
  const angulo = rng() * 2 * Math.PI;
  const radio = rng() * radioGrados;
  return { lat: lat + radio * Math.sin(angulo), lng: lng + radio * Math.cos(angulo) };
}

function formatearFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumarDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

function fechaConHoraAlAzar(base: Date): Date {
  const d = new Date(base);
  d.setHours(entero(8, 20), elegirUno([0, 15, 30, 45]), 0, 0);
  return d;
}

/* ============================================================================================
 * Nombres, calles y textos verosímiles de la región. Nada de esto es información real.
 * ============================================================================================ */

const NOMBRES_MASCULINOS = [
  "José", "Juan", "Miguel", "Pedro", "Francisco", "Antonio", "Manuel", "Jesús", "Alberto",
  "Rogelio", "Eduardo", "Rubén", "Fernando", "Gerardo", "Sergio", "Ricardo", "Arturo",
  "Salvador", "Guillermo", "Ignacio", "Rodrigo", "Cuauhtémoc", "Filemón", "Abel", "Timoteo",
  "Marcelino", "Prisciliano", "Higinio", "Anselmo", "Wilfrido", "Baltazar", "Eleazar",
] as const;

const NOMBRES_FEMENINOS = [
  "María", "Guadalupe", "Rosa", "Juana", "Josefina", "Petra", "Soledad", "Reyna", "Elvira",
  "Yolanda", "Silvia", "Leticia", "Bertha", "Alicia", "Consuelo", "Dolores", "Esperanza",
  "Herminia", "Herlinda", "Aurelia", "Eufrosina", "Crescencia", "Otilia", "Modesta", "Cirila",
  "Filomena", "Refugio", "Trinidad", "Epifania", "Casimira", "Anastasia", "Hermelinda",
] as const;

const APELLIDOS = [
  "García", "Martínez", "Hernández", "López", "Ramírez", "Cruz", "Jiménez", "Vásquez", "Gómez",
  "Pérez", "Sánchez", "Morales", "Reyes", "Aquino", "Cortés", "Santiago", "Bautista", "Matías",
  "Mendoza", "Zárate", "Guzmán", "Ruiz", "Toledo", "Sosa", "Vera", "Ortiz", "Nolasco", "Chávez",
  "Aragón", "Feria", "Regalado", "Pacheco", "Antonio", "Cabrera", "Contreras", "Villalobos",
  "Juárez", "Hipólito", "Robles", "Ramos", "Solano", "Ortega", "Altamirano", "Escobar",
  "Manzano", "Marcial", "Osorio", "Palacios", "Velasco", "Luis",
] as const;

function nombreVerosimil(): string {
  const nombre = conProbabilidad(0.5) ? elegirUno(NOMBRES_MASCULINOS) : elegirUno(NOMBRES_FEMENINOS);
  const apellidoPaterno = elegirUno(APELLIDOS);
  const apellidoMaterno = elegirUno(APELLIDOS);
  return `${nombre} ${apellidoPaterno} ${apellidoMaterno}`;
}

const TIPOS_VIA = ["Calle", "Avenida", "Andador", "Privada", "Callejón", "Cerrada"] as const;
const NOMBRES_VIA = [
  "Independencia", "Morelos", "Hidalgo", "Juárez", "Guerrero", "Allende", "Matamoros", "Colón",
  "5 de Mayo", "Niños Héroes", "Flores Magón", "Revolución", "Insurgentes", "Reforma",
  "Constitución", "Libertad", "Progreso", "Emiliano Zapata", "Venustiano Carranza",
  "Ignacio Zaragoza", "Vicente Guerrero", "Benito Juárez", "Melchor Ocampo", "Vicente Suárez",
  "20 de Noviembre", "16 de Septiembre", "Lázaro Cárdenas", "Aldama", "Bravo", "Galeana", "Mina",
] as const;

function calleVerosimil(): string {
  return `${elegirUno(TIPOS_VIA)} ${elegirUno(NOMBRES_VIA)} #${entero(4, 340)}`;
}

/* ============================================================================================
 * Baraja de teléfonos: los 10 000 números del rango 951 100 0000–951 100 9999, barajados una
 * sola vez con el generador determinista y repartidos sin repetirse ni a usuarios ni a personas.
 * ============================================================================================ */

const PREFIJO_TELEFONO = "951100";
const bolsaTelefonos = barajar(Array.from({ length: 10000 }, (_, i) => i));
let cursorTelefono = 0;

function siguienteTelefono(): { norm: string; raw: string } {
  const sufijo = bolsaTelefonos[cursorTelefono++].toString().padStart(4, "0");
  const norm = `${PREFIJO_TELEFONO}${sufijo}`;
  const raw = `951 100 ${sufijo}`;
  return { norm, raw };
}

/* ============================================================================================
 * Lectura de la base: territorio y catálogos que carga scripts/importar.ts
 * ============================================================================================ */

type FilaDemarcacion = { id: number; nombre: string };
type FilaSeccion = {
  clave: string;
  demarcacion_id: number;
  centro_lat: number;
  centro_lng: number;
  en_catalogo: boolean;
  prioridad: "A" | "B" | null;
};
type FilaColonia = { id: number; nombre: string };
type FilaColoniaSeccion = { colonia_id: number; seccion_clave: string; traslape_pct: number };
type FilaProblematica = { id: number; nombre: string };
// Catálogo de scripts/importar.ts, igual que secciones/colonias: este script solo lo lee, nunca
// lo borra ni lo modifica.
type FilaCasilla = { id: number; seccion_clave: string };

async function seleccionarTodo<T>(tabla: string, columnas: string, orden: string): Promise<T[]> {
  const filas: T[] = [];
  const tamanoPagina = 1000;
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .order(orden)
      .range(desde, desde + tamanoPagina - 1);
    if (error) {
      console.error(`No se pudo leer la tabla ${tabla}:`, error);
      process.exit(1);
    }
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < tamanoPagina) break;
    desde += tamanoPagina;
  }
  return filas;
}

/* ============================================================================================
 * Utilidades de escritura (mismo patrón que scripts/importar.ts)
 * ============================================================================================ */

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
  console.log(`  ${tabla}: ${filas.length} filas`);
}

async function vaciarUuid(tabla: string, columna = "id"): Promise<void> {
  const { error } = await supabase
    .from(tabla)
    .delete()
    .neq(columna, "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error(`No se pudo vaciar ${tabla}:`, error);
    process.exit(1);
  }
}

async function vaciarSerial(tabla: string, columna = "id"): Promise<void> {
  const { error } = await supabase.from(tabla).delete().gte(columna, 0);
  if (error) {
    console.error(`No se pudo vaciar ${tabla}:`, error);
    process.exit(1);
  }
}

/* ============================================================================================
 * main
 * ============================================================================================ */

async function main() {
  console.log(SIMULAR ? "Modo --simular: solo se genera y se imprime, no se escribe nada.\n" : "");

  /* ------------------------------------------------------------------------------------------
   * 1. Lectura del territorio ya cargado por scripts/importar.ts
   * ------------------------------------------------------------------------------------------ */

  const filasDemarcaciones = await seleccionarTodo<FilaDemarcacion>("demarcaciones", "id,nombre", "id");
  // Solo las 169 del catálogo. Las 6 sustitutas siguen en la tabla para no perder su geometría,
  // pero el cliente pidió que no se cuenten, así que tampoco se les siembra gente: una persona
  // colgada de una sección que nadie cuenta desaparece de todos los resúmenes por sección y deja
  // los totales sin cuadrar.
  const filasSecciones = (
    await seleccionarTodo<FilaSeccion>(
      "secciones",
      "clave,demarcacion_id,centro_lat,centro_lng,en_catalogo,prioridad",
      "clave",
    )
  ).filter((s) => s.en_catalogo);

  if (filasSecciones.length === 0) {
    console.error(
      "La tabla secciones está vacía. Corre primero la importación de cartografía:\n" +
        "  npm run db:esquema && npm run db:importar\n" +
        "y vuelve a correr este script.",
    );
    process.exit(1);
  }

  const filasColonias = await seleccionarTodo<FilaColonia>("colonias", "id,nombre", "id");
  const filasColoniaSeccion = await seleccionarTodo<FilaColoniaSeccion>(
    "colonia_seccion",
    "colonia_id,seccion_clave,traslape_pct",
    "seccion_clave",
  );
  const filasProblematicas = await seleccionarTodo<FilaProblematica>("problematicas", "id,nombre", "id");
  if (filasProblematicas.length === 0) {
    console.error(
      "La tabla problematicas está vacía. Aplica primero supabase/schema.sql (ya trae el catálogo\n" +
        "de problemáticas) y vuelve a correr este script.",
    );
    process.exit(1);
  }

  // Catálogo de casillas: lo carga scripts/importar.ts y este script solo lo lee, nunca lo toca.
  const filasCasillas = await seleccionarTodo<FilaCasilla>("casillas", "id,seccion_clave", "id");
  if (filasCasillas.length === 0) {
    console.error(
      "La tabla casillas está vacía. Corre primero la importación de casillas\n" +
        "(scripts/importar.ts) y vuelve a correr este script.",
    );
    process.exit(1);
  }

  // Re-ordenamos en memoria por clave/id: no dependemos del orden en que Postgres devuelva filas.
  filasSecciones.sort((a, b) => a.clave.localeCompare(b.clave));
  filasDemarcaciones.sort((a, b) => a.id - b.id);
  filasCasillas.sort((a, b) => a.id - b.id);

  const nombrePorDemarcacion = new Map(filasDemarcaciones.map((d) => [d.id, d.nombre]));
  const idsDemarcaciones = filasDemarcaciones.map((d) => d.id);

  const seccionesPorDemarcacion = new Map<number, FilaSeccion[]>();
  for (const s of filasSecciones) {
    const lista = seccionesPorDemarcacion.get(s.demarcacion_id) ?? [];
    lista.push(s);
    seccionesPorDemarcacion.set(s.demarcacion_id, lista);
  }
  const seccionPorClave = new Map(filasSecciones.map((s) => [s.clave, s]));

  const coloniasPorSeccion = new Map<string, FilaColoniaSeccion[]>();
  for (const fila of filasColoniaSeccion) {
    const lista = coloniasPorSeccion.get(fila.seccion_clave) ?? [];
    lista.push(fila);
    coloniasPorSeccion.set(fila.seccion_clave, lista);
  }
  const nombreColonia = new Map(filasColonias.map((c) => [c.id, c.nombre]));
  const idProblematica = new Map(filasProblematicas.map((p) => [p.nombre, p.id]));

  function coloniaParaSeccion(clave: string): number | null {
    const opciones = coloniasPorSeccion.get(clave);
    if (!opciones || opciones.length === 0) return null;
    return elegirPonderado(opciones.map((o) => ({ valor: o.colonia_id, peso: Math.max(o.traslape_pct, 0.1) })));
  }

  console.log(
    `Territorio leído: ${filasDemarcaciones.length} demarcaciones, ${filasSecciones.length} secciones, ` +
      `${filasColonias.length} colonias, ${filasColoniaSeccion.length} traslapes colonia-sección, ` +
      `${filasCasillas.length} casillas.\n`,
  );

  /* ------------------------------------------------------------------------------------------
   * 2. Los cuatro actuantes fijos de lib/actuantes.ts: id, rol y territorio deben coincidir.
   * ------------------------------------------------------------------------------------------ */

  const [ACT_ADMIN, ACT_RESP_DEMARCACION, ACT_RESP_SECCION, ACT_BRIGADISTA] = ACTUANTES;
  const DEMARCACION_RESP_FIJO = ACT_RESP_DEMARCACION.demarcacionId as number;
  const SECCION_RESP_FIJA = ACT_RESP_SECCION.seccionClave as string;
  const DEMARCACION_BRIGADISTA_FIJO = ACT_BRIGADISTA.demarcacionId as number;

  /* ------------------------------------------------------------------------------------------
   * 3. Cuántos responsables de sección por demarcación (40 en total). Se concentran en Cabecera
   *    Municipal y en las demarcaciones con más gente; el resto se queda sin ninguno, que es el
   *    contraste que el mapa debe mostrar. La sección fija del conmutador de rol (0473, Santa
   *    Rosa Panzacola) va garantizada dentro del cupo de su demarcación.
   * ------------------------------------------------------------------------------------------ */

  const RESP_SECCION_POR_DEMARCACION: Record<number, number> = {
    1: 18, // Cabecera Municipal
    13: 8, // Santa Rosa Panzacola (incluye la 0473, fija del conmutador de rol)
    12: 6, // San Martín Mexicapam de Cárdenas
    8: 4, // Pueblo Nuevo
    10: 4, // San Juan Chapultepec
  };
  const TOTAL_RESP_SECCION = Object.values(RESP_SECCION_POR_DEMARCACION).reduce((a, b) => a + b, 0);

  function elegirSeccionesConResponsable(): string[] {
    const elegidas: string[] = [];
    for (const [clave, cantidad] of Object.entries(RESP_SECCION_POR_DEMARCACION)) {
      const demarcacionId = Number(clave);
      const disponibles = [...(seccionesPorDemarcacion.get(demarcacionId) ?? [])]
        .map((s) => s.clave)
        .sort();
      barajar(disponibles);
      let seleccion: string[];
      if (demarcacionId === DEMARCACION_RESP_FIJO && disponibles.includes(SECCION_RESP_FIJA)) {
        const resto = disponibles.filter((c) => c !== SECCION_RESP_FIJA);
        seleccion = [SECCION_RESP_FIJA, ...resto.slice(0, cantidad - 1)];
      } else {
        seleccion = disponibles.slice(0, cantidad);
      }
      elegidas.push(...seleccion);
    }
    return elegidas.sort();
  }

  const clavesConResponsable = elegirSeccionesConResponsable();
  if (clavesConResponsable.length !== TOTAL_RESP_SECCION) {
    throw new Error(
      `Se esperaban ${TOTAL_RESP_SECCION} secciones con responsable y se eligieron ` +
        `${clavesConResponsable.length}. Revisa RESP_SECCION_POR_DEMARCACION contra las secciones ` +
        "disponibles de cada demarcación.",
    );
  }
  const clavesConResponsableSet = new Set(clavesConResponsable);

  /* ------------------------------------------------------------------------------------------
   * 4. Secciones en cero (~25), concentradas en una sola zona contigua. Se arranca en la
   *    sección permitida más periférica (más lejos del centro del municipio) y, en cada vuelta,
   *    se agrega la sección permitida más cercana a cualquier miembro ya elegido del grupo —
   *    así el conjunto crece pegado a sí mismo en vez de saltar al azar por el mapa. Nunca se
   *    elige una sección con responsable asignado, y nunca se vacía una demarcación completa.
   * ------------------------------------------------------------------------------------------ */

  const OBJETIVO_SECCIONES_CERO = 25;
  const centroMunicipio = { lat: MUNICIPIO.centro[1], lon: MUNICIPIO.centro[0] };

  function elegirSeccionesEnCero(): { claves: string[]; distanciaMaxKm: number } {
    const totalPorDemarcacion = new Map<number, number>();
    for (const s of filasSecciones) {
      totalPorDemarcacion.set(s.demarcacion_id, (totalPorDemarcacion.get(s.demarcacion_id) ?? 0) + 1);
    }
    const zeroPorDemarcacion = new Map<number, number>();
    const candidatas = filasSecciones
      .filter((s) => !clavesConResponsableSet.has(s.clave))
      .sort((a, b) => a.clave.localeCompare(b.clave));
    const grupo: FilaSeccion[] = [];

    const cabePermitir = (s: FilaSeccion) => {
      const total = totalPorDemarcacion.get(s.demarcacion_id) ?? 0;
      const actual = zeroPorDemarcacion.get(s.demarcacion_id) ?? 0;
      return actual + 1 < total; // deja al menos una sección con gente en su demarcación
    };
    const agregar = (s: FilaSeccion) => {
      grupo.push(s);
      zeroPorDemarcacion.set(s.demarcacion_id, (zeroPorDemarcacion.get(s.demarcacion_id) ?? 0) + 1);
    };

    const permitidasIniciales = candidatas.filter(cabePermitir);
    if (permitidasIniciales.length === 0) return { claves: [], distanciaMaxKm: 0 };
    const semilla = permitidasIniciales
      .map((s) => ({ s, d: distanciaKm(s.centro_lat, s.centro_lng, centroMunicipio.lat, centroMunicipio.lon) }))
      .sort((a, b) => b.d - a.d || a.s.clave.localeCompare(b.s.clave))[0].s;
    agregar(semilla);

    while (grupo.length < OBJETIVO_SECCIONES_CERO) {
      const enGrupo = new Set(grupo.map((s) => s.clave));
      const restantes = candidatas.filter((s) => !enGrupo.has(s.clave) && cabePermitir(s));
      if (restantes.length === 0) break;
      let mejor = restantes[0];
      let mejorDist = Infinity;
      for (const cand of restantes) {
        let dMin = Infinity;
        for (const g of grupo) {
          const d = distanciaKm(g.centro_lat, g.centro_lng, cand.centro_lat, cand.centro_lng);
          if (d < dMin) dMin = d;
        }
        if (dMin < mejorDist || (dMin === mejorDist && cand.clave < mejor.clave)) {
          mejorDist = dMin;
          mejor = cand;
        }
      }
      agregar(mejor);
    }

    let distanciaMaxKm = 0;
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const d = distanciaKm(
          grupo[i].centro_lat,
          grupo[i].centro_lng,
          grupo[j].centro_lat,
          grupo[j].centro_lng,
        );
        if (d > distanciaMaxKm) distanciaMaxKm = d;
      }
    }
    return { claves: grupo.map((s) => s.clave).sort(), distanciaMaxKm };
  }

  const { claves: clavesEnCero, distanciaMaxKm: distanciaMaxCeroKm } = elegirSeccionesEnCero();
  const clavesEnCeroSet = new Set(clavesEnCero);

  /* ------------------------------------------------------------------------------------------
   * 5. Reparto de las 2000 personas: primero por demarcación (pesos explícitos del spec), luego
   *    dentro de cada demarcación por sección, de forma desigual, excluyendo las secciones en
   *    cero. Cada sección no-cero recibe al menos 1 persona.
   * ------------------------------------------------------------------------------------------ */

  const NUM_PERSONAS = 2000;

  // Cabecera Municipal 45 %, Santa Rosa Panzacola 12 %, San Martín Mexicapam 10 %, Pueblo Nuevo
  // 8 % y San Juan Chapultepec 7 % son los valores que pide el spec al pie de la letra (82 % en
  // total). El 18 % restante se reparte, también de forma desigual, entre las otras nueve
  // demarcaciones, con algo más de peso para las que tienen más secciones en el catálogo.
  const PESO_POBLACION_POR_DEMARCACION: Record<number, number> = {
    1: 45, // Cabecera Municipal
    13: 12, // Santa Rosa Panzacola
    12: 10, // San Martín Mexicapam de Cárdenas
    8: 8, // Pueblo Nuevo
    10: 7, // San Juan Chapultepec
    2: 3, // Candiani
    3: 2.5, // Cinco Señores
    5: 2.5, // Donají
    6: 2, // Guadalupe Victoria
    7: 2, // Montoya
    9: 2, // San Felipe del Agua
    11: 1.5, // San Luis Beltrán
    14: 1.5, // Trinidad de Viguera
    4: 1, // Dolores
  };

  const pesosPoblacion = idsDemarcaciones.map((id) => PESO_POBLACION_POR_DEMARCACION[id] ?? 0);
  const cantidadesPoblacion = repartirEntero(NUM_PERSONAS, pesosPoblacion);
  const personasPorDemarcacion = new Map<number, number>();
  idsDemarcaciones.forEach((id, i) => personasPorDemarcacion.set(id, cantidadesPoblacion[i]));

  const personasPorSeccion = new Map<string, number>();
  const seccionesNoCeroPorDemarcacion = new Map<number, string[]>();
  for (const id of idsDemarcaciones) {
    const todas = [...(seccionesPorDemarcacion.get(id) ?? [])].sort((a, b) => a.clave.localeCompare(b.clave));
    const noCero = todas.filter((s) => !clavesEnCeroSet.has(s.clave));
    seccionesNoCeroPorDemarcacion.set(id, noCero.map((s) => s.clave));
    if (noCero.length === 0) continue;
    // Reparto desigual dentro de la demarcación: el producto de dos sorteos uniformes concentra
    // el peso en pocas secciones en vez de repartir parejo.
    const pesos = noCero.map(() => 0.05 + rng() * rng());
    const cantidades = repartirConMinimoUno(personasPorDemarcacion.get(id) ?? 0, pesos);
    noCero.forEach((s, i) => personasPorSeccion.set(s.clave, cantidades[i]));
  }

  /* ------------------------------------------------------------------------------------------
   * 6. Usuarios: 1 admin, 14 responsables de demarcación, 40 responsables de sección y 25
   *    brigadistas. Los cuatro fijos de lib/actuantes.ts entran con su id, rol y territorio
   *    exactos; el resto se genera con nombre y teléfono verosímiles.
   * ------------------------------------------------------------------------------------------ */

  type FilaUsuario = {
    id: string;
    nombre: string;
    telefono: string;
    rol: RolUsuario;
    demarcacion_id: number | null;
    seccion_clave: string | null;
    activo: boolean;
    created_at: string;
  };

  function creadoHaceDias(minDias: number, maxDias: number): string {
    return fechaConHoraAlAzar(sumarDias(HOY, -entero(minDias, maxDias))).toISOString();
  }

  const usuarios: FilaUsuario[] = [];

  usuarios.push({
    id: ACT_ADMIN.id,
    nombre: nombreVerosimil(),
    telefono: siguienteTelefono().raw,
    rol: "admin",
    demarcacion_id: null,
    seccion_clave: null,
    activo: true,
    created_at: creadoHaceDias(200, 400),
  });

  const usuarioPorDemarcacion = new Map<number, string>();
  for (const id of idsDemarcaciones) {
    const fijo = id === DEMARCACION_RESP_FIJO;
    const usuarioId = fijo ? ACT_RESP_DEMARCACION.id : uuidDeterminista();
    usuarios.push({
      id: usuarioId,
      nombre: nombreVerosimil(),
      telefono: siguienteTelefono().raw,
      rol: "resp_demarcacion",
      demarcacion_id: id,
      seccion_clave: null,
      activo: true,
      created_at: creadoHaceDias(120, 350),
    });
    usuarioPorDemarcacion.set(id, usuarioId);
  }

  const usuarioPorSeccion = new Map<string, string>();
  for (const clave of clavesConResponsable) {
    const seccion = seccionPorClave.get(clave)!;
    const fija = clave === SECCION_RESP_FIJA;
    const usuarioId = fija ? ACT_RESP_SECCION.id : uuidDeterminista();
    usuarios.push({
      id: usuarioId,
      nombre: nombreVerosimil(),
      telefono: siguienteTelefono().raw,
      rol: "resp_seccion",
      demarcacion_id: seccion.demarcacion_id,
      seccion_clave: clave,
      activo: true,
      created_at: creadoHaceDias(60, 300),
    });
    usuarioPorSeccion.set(clave, usuarioId);
  }

  const NUM_BRIGADISTAS = 25;
  const brigadistaIds: string[] = [];
  usuarios.push({
    id: ACT_BRIGADISTA.id,
    nombre: nombreVerosimil(),
    telefono: siguienteTelefono().raw,
    rol: "brigadista",
    demarcacion_id: DEMARCACION_BRIGADISTA_FIJO,
    seccion_clave: null,
    activo: true,
    created_at: creadoHaceDias(30, 250),
  });
  brigadistaIds.push(ACT_BRIGADISTA.id);
  for (let i = 1; i < NUM_BRIGADISTAS; i++) {
    const id = uuidDeterminista();
    usuarios.push({
      id,
      nombre: nombreVerosimil(),
      telefono: siguienteTelefono().raw,
      rol: "brigadista",
      demarcacion_id: null,
      seccion_clave: null,
      activo: true,
      created_at: creadoHaceDias(10, 250),
    });
    brigadistaIds.push(id);
  }

  /** Usuario real para registrada_por / responsable_id: prioriza el territorio exacto. */
  function usuarioLocal(demarcacionId: number, seccionClave: string | null): string {
    if (seccionClave) {
      const r = usuarioPorSeccion.get(seccionClave);
      if (r) return r;
    }
    const rd = usuarioPorDemarcacion.get(demarcacionId);
    if (rd) return rd;
    return elegirUno(brigadistaIds);
  }

  /* ------------------------------------------------------------------------------------------
   * 7. Asignaciones vigentes: una por responsable de demarcación (ámbito demarcación) y una por
   *    responsable de sección (ámbito sección). 157 secciones − 40 con responsable = secciones
   *    sin responsable.
   * ------------------------------------------------------------------------------------------ */

  type FilaAsignacion = {
    usuario_id: string;
    ambito: "demarcacion" | "seccion";
    demarcacion_id: number | null;
    seccion_clave: string | null;
    desde: string;
    hasta: null;
  };

  const asignaciones: FilaAsignacion[] = [];
  for (const id of idsDemarcaciones) {
    asignaciones.push({
      usuario_id: usuarioPorDemarcacion.get(id)!,
      ambito: "demarcacion",
      demarcacion_id: id,
      seccion_clave: null,
      desde: formatearFecha(sumarDias(HOY, -entero(120, 350))),
      hasta: null,
    });
  }
  for (const clave of clavesConResponsable) {
    const seccion = seccionPorClave.get(clave)!;
    asignaciones.push({
      usuario_id: usuarioPorSeccion.get(clave)!,
      ambito: "seccion",
      demarcacion_id: seccion.demarcacion_id,
      seccion_clave: clave,
      desde: formatearFecha(sumarDias(HOY, -entero(60, 300))),
      hasta: null,
    });
  }

  const seccionesSinResponsable = filasSecciones.length - clavesConResponsable.length;

  /* ------------------------------------------------------------------------------------------
   * 8. Personas
   * ------------------------------------------------------------------------------------------ */

  type Genero = "mujer" | "hombre" | "otro" | "no_especifica" | null;

  type FilaPersona = {
    id: string;
    nombre: string;
    telefono_norm: string;
    telefono_raw: string;
    calle: string;
    colonia_id: number | null;
    seccion_clave: string;
    demarcacion_id: number;
    lat: number;
    lng: number;
    origen_ubicacion: "gps" | "mapa" | "manual";
    quiere_participar: boolean;
    quiere_info: boolean;
    aviso_version: string;
    consentimiento_en: string;
    registrada_por: string;
    actividad_origen: string | null;
    genero: Genero;
    fecha_nacimiento: string | null;
    es_promovido: boolean;
    promovido_en: string | null;
    promovido_por: string | null;
    quiere_ser_representante: boolean;
    created_at: string;
  };

  /* ----------------------------------------------------------------------------------------
   * 8a. Género, fecha de nacimiento, promovidos y aspirantes a representante. Van aparte de la
   *     ficha base porque cada uno tiene su propia distribución verosímil (spec/PLAN-ELECTORAL.md,
   *     fase 1).
   * ---------------------------------------------------------------------------------------- */

  // Reparto cercano al padrón real: ~52 % mujeres, ~46 % hombres, un resto chico entre "otro" y
  // "no_especifica", y un 5 % adicional en null porque en la calle no siempre se captura todo —
  // una base con el campo lleno al 100 % se ve sembrada.
  function generoAlAzar(): Genero {
    return elegirPonderado<Genero>([
      { valor: null, peso: 5 },
      { valor: "mujer", peso: 52 },
      { valor: "hombre", peso: 46 },
      { valor: "otro", peso: 1 },
      { valor: "no_especifica", peso: 1 },
    ]);
  }

  // Curva de edad de padrón: más gente entre 30 y 55, menos en los extremos, siempre mayor de
  // edad. Se sortea primero un bloque de edad (con más peso en el centro) y luego un año dentro
  // del bloque, en vez de una edad uniforme entre 18 y 95 que se vería pareja y falsa.
  const BLOQUES_EDAD: { desde: number; hasta: number; peso: number }[] = [
    { desde: 18, hasta: 29, peso: 15 },
    { desde: 30, hasta: 40, peso: 28 },
    { desde: 41, hasta: 55, peso: 32 },
    { desde: 56, hasta: 70, peso: 18 },
    { desde: 71, hasta: 95, peso: 7 },
  ];

  function edadAlAzar(): number {
    const bloque = elegirPonderado(BLOQUES_EDAD.map((b) => ({ valor: b, peso: b.peso })));
    return entero(bloque.desde, bloque.hasta);
  }

  // Fecha de nacimiento a partir de una edad: se resta la edad en días (con variación dentro del
  // año) en vez de restar años de calendario, para no tener que lidiar con años bisiestos ni con
  // el riesgo de que el resultado caiga después de HOY. 15 % se queda en null, igual de verosímil
  // que el género sin capturar.
  function fechaNacimientoAlAzar(): string | null {
    if (conProbabilidad(0.15)) return null;
    const edad = edadAlAzar();
    const diasEdad = edad * 365 + entero(0, 364);
    return formatearFecha(sumarDias(HOY, -diasEdad));
  }

  // Fecha de nacimiento con mes y día forzados a los de HOY (para el cumpleaños de hoy) y una
  // edad verosímil: como el mes y el día coinciden exactamente con HOY, la persona cumple años
  // hoy sin importar qué año le toque.
  function fechaNacimientoHoyConEdad(edad: number): string {
    const anioNacimiento = HOY.getFullYear() - edad;
    const mes = (HOY.getMonth() + 1).toString().padStart(2, "0");
    const dia = HOY.getDate().toString().padStart(2, "0");
    return `${anioNacimiento}-${mes}-${dia}`;
  }

  // Promovidos: ~20 % en total, con dos correlaciones que lo hacen creíble. Primera: quien ya
  // dijo que quiere participar tiene bastante más probabilidad de ser promovido que quien solo
  // pidió información, y quien no pidió nada casi no aparece. Segunda: las secciones que ya
  // tienen responsable concentran algo más de promovidos que las que no.
  function probabilidadPromovido(quiereParticipar: boolean, quiereInfo: boolean, seccionClave: string): number {
    const base = quiereParticipar ? 0.4 : quiereInfo ? 0.09 : 0.04;
    const factorZona = clavesConResponsableSet.has(seccionClave) ? 1.2 : 0.85;
    return Math.min(base * factorZona, 0.85);
  }

  // promovido_en: posterior a created_at de la persona y anterior a HOY. Si el azar de horas
  // dejara created_at pegado a HOY (persona registrada hoy mismo), el rango se acota a un
  // milisegundo como salvaguarda en vez de generar un delta negativo.
  function promovidoEnAlAzar(creadoEn: string): string {
    const creado = new Date(creadoEn).getTime();
    const rango = Math.max(HOY.getTime() - creado, 1);
    return new Date(creado + entero(1, rango)).toISOString();
  }

  // Representante de casilla: fracción chica (~6 % del total) y nunca sin haber levantado antes
  // la mano. Por eso la probabilidad solo se sortea entre quienes ya son promovidos o ya dijeron
  // que quieren participar; el resto queda en false sin sorteo.
  const PROB_REPRESENTANTE_ELEGIBLE = 0.16;
  function quiereSerRepresentanteAlAzar(esPromovido: boolean, quiereParticipar: boolean): boolean {
    if (!esPromovido && !quiereParticipar) return false;
    return conProbabilidad(PROB_REPRESENTANTE_ELEGIBLE);
  }

  const personas: FilaPersona[] = [];
  const personasPorSeccionClave = new Map<string, FilaPersona[]>();
  const personasPorDemarcacionId = new Map<number, FilaPersona[]>();

  const clavesOrdenadas = [...personasPorSeccion.keys()].sort();
  for (const clave of clavesOrdenadas) {
    const cantidad = personasPorSeccion.get(clave)!;
    const seccion = seccionPorClave.get(clave)!;
    for (let i = 0; i < cantidad; i++) {
      const telefono = siguienteTelefono();
      const punto = jitter(seccion.centro_lat, seccion.centro_lng);
      const createdAt = fechaConHoraAlAzar(sumarDias(HOY, -entero(0, 69))).toISOString();
      const quiereParticipar = conProbabilidad(0.3);
      const quiereInfo = conProbabilidad(0.65);
      const esPromovido = conProbabilidad(probabilidadPromovido(quiereParticipar, quiereInfo, clave));
      const promovidoPor = esPromovido ? usuarioLocal(seccion.demarcacion_id, clave) : null;

      const persona: FilaPersona = {
        id: uuidDeterminista(),
        nombre: nombreVerosimil(),
        telefono_norm: telefono.norm,
        telefono_raw: telefono.raw,
        calle: calleVerosimil(),
        colonia_id: coloniaParaSeccion(clave),
        seccion_clave: clave,
        demarcacion_id: seccion.demarcacion_id,
        lat: punto.lat,
        lng: punto.lng,
        origen_ubicacion: elegirPonderado([
          { valor: "gps" as const, peso: 55 },
          { valor: "mapa" as const, peso: 25 },
          { valor: "manual" as const, peso: 20 },
        ]),
        quiere_participar: quiereParticipar,
        quiere_info: quiereInfo,
        aviso_version: "provisional-1",
        consentimiento_en: createdAt,
        registrada_por: usuarioLocal(seccion.demarcacion_id, clave),
        actividad_origen: null,
        genero: generoAlAzar(),
        fecha_nacimiento: fechaNacimientoAlAzar(),
        es_promovido: esPromovido,
        promovido_en: esPromovido ? promovidoEnAlAzar(createdAt) : null,
        promovido_por: promovidoPor,
        quiere_ser_representante: quiereSerRepresentanteAlAzar(esPromovido, quiereParticipar),
        created_at: createdAt,
      };
      personas.push(persona);
      const lista1 = personasPorSeccionClave.get(clave) ?? [];
      lista1.push(persona);
      personasPorSeccionClave.set(clave, lista1);
      const lista2 = personasPorDemarcacionId.get(seccion.demarcacion_id) ?? [];
      lista2.push(persona);
      personasPorDemarcacionId.set(seccion.demarcacion_id, lista2);
    }
  }

  /* ------------------------------------------------------------------------------------------
   * 8b. Cumpleaños de hoy, forzados. El tablero tiene una zona de "cumplen años hoy" que se
   *     oculta si está vacía, y en la demostración importa que se vea: con la fecha de
   *     nacimiento repartida al azar día por día entre ~1700 personas, lo esperable es que ronde
   *     4 o 5 el día que se corre el sembrado, y algunas corridas caerían en cero o uno, que es
   *     justo lo que no se puede mostrar en la junta. Por eso se fuerza a que entre 6 y 12
   *     personas cumplan años en el mes y día de HOY. Se reparten en
   *     demarcaciones distintas para que un responsable de demarcación también las vea en su
   *     propio tablero y no sea un dato que solo el administrador nota. El conteo y la elección
   *     de personas salen del mismo generador con semilla fija: dos corridas el mismo día
   *     producen exactamente el mismo grupo.
   * ------------------------------------------------------------------------------------------ */

  const CANTIDAD_CUMPLEANOS_HOY = entero(6, 12);
  const demarcacionesParaCumpleanos = barajar([...idsDemarcaciones]).slice(0, CANTIDAD_CUMPLEANOS_HOY);
  let personasCumpleanosHoy = 0;
  for (const demarcacionId of demarcacionesParaCumpleanos) {
    const candidatas = personasPorDemarcacionId.get(demarcacionId) ?? [];
    if (candidatas.length === 0) continue;
    const persona = elegirUno(candidatas);
    persona.fecha_nacimiento = fechaNacimientoHoyConEdad(edadAlAzar());
    personasCumpleanosHoy++;
  }

  /* ------------------------------------------------------------------------------------------
   * 9. Actividades: 55 en total — 46 realizadas en las últimas 10 semanas, 2 en curso hoy y 7
   *    programadas en los próximos 14 días. Reparto de tipo aproximado a un tercio cada uno entre
   *    reunión, activismo y recorrido, y un puñado de cruceros aparte para que el tipo no se vea
   *    vacío en la presentación; los recorridos se concentran en las cinco demarcaciones con más
   *    personas registradas.
   * ------------------------------------------------------------------------------------------ */

  type TipoActividad = "reunion" | "activismo" | "recorrido" | "crucero";
  type EstatusActividad = "programada" | "en_curso" | "realizada" | "cancelada";

  type FilaActividad = {
    id: string;
    tipo: TipoActividad;
    nombre: string;
    fecha: string;
    hora: string;
    direccion: string;
    colonia_id: number | null;
    seccion_clave: string;
    demarcacion_id: number;
    lat: number;
    lng: number;
    responsable_id: string;
    objetivo: string;
    notas: string | null;
    estatus: EstatusActividad;
    asistentes_aprox: number | null;
    conclusion: string | null;
    cerrada_en: string | null;
    cerrada_por: string | null;
    created_by: string;
    created_at: string;
  };

  // Ya no hay subtipo: lo que antes era un campo aparte (vecinal, volanteo, limpieza...) ahora
  // vive directo en el nombre de la actividad, que es donde de verdad se lee.
  const NOMBRES_POR_TIPO: Record<TipoActividad, readonly string[]> = {
    reunion: [
      "Reunión vecinal",
      "Reunión comunitaria",
      "Reunión de seguimiento",
      "Reunión informativa",
      "Reunión con líderes de colonia",
    ],
    activismo: [
      "Activismo domiciliario",
      "Volanteo",
      "Perifoneo",
      "Brigada informativa",
      "Censo casa por casa",
    ],
    recorrido: [
      "Recorrido de limpieza",
      "Recorrido de reforestación",
      "Supervisión de obra",
      "Recorrido vecinal",
      "Bacheo comunitario",
    ],
    crucero: ["Crucero informativo", "Crucero de volanteo", "Plantón en crucero"],
  };

  const OBJETIVOS_POR_TIPO: Record<TipoActividad, readonly string[]> = {
    reunion: [
      "Presentar el plan de trabajo del mes a los vecinos",
      "Escuchar las principales inquietudes de la colonia",
      "Dar seguimiento a compromisos de la reunión anterior",
    ],
    activismo: [
      "Difundir el trabajo territorial casa por casa",
      "Actualizar el padrón de contactos de la zona",
      "Invitar a la próxima actividad comunitaria",
    ],
    recorrido: [
      "Levantar un diagnóstico de necesidades en la zona",
      "Dar mantenimiento a espacios públicos de la colonia",
      "Verificar el avance de obras solicitadas por vecinos",
    ],
    crucero: [
      "Difundir el mensaje en horas de mayor tránsito",
      "Repartir material informativo a automovilistas y peatones",
      "Dar visibilidad a la campaña en un punto de alto flujo",
    ],
  };


  /**
   * Peso extra de una sección prioritaria cuando se reparte un recorrido. El mapa de prioritarias
   * pinta en naranja pleno lo ya recorrido, así que si los recorridos cayeran solo por población,
   * ese mapa saldría todo pendiente y no enseñaría nada. Aquí las A pesan seis veces y las B tres,
   * sobre el mismo peso de población: el avance se ve, y sigue saliendo de actividades reales y no
   * de una bandera puesta a mano.
   */
  const PESO_PRIORIDAD: Record<string, number> = { A: 6, B: 3 };

  function elegirSeccionParaRecorrido(): FilaSeccion {
    const opciones: { valor: string; peso: number }[] = [];
    for (const claves of seccionesNoCeroPorDemarcacion.values()) {
      for (const clave of claves) {
        const seccion = seccionPorClave.get(clave);
        if (!seccion) continue;
        const base = personasPorSeccion.get(clave) ?? 1;
        opciones.push({
          valor: clave,
          peso: base * (seccion.prioridad ? PESO_PRIORIDAD[seccion.prioridad] : 1),
        });
      }
    }
    return seccionPorClave.get(elegirPonderado(opciones))!;
  }

  function elegirSeccionPonderadaPorPoblacion(demarcacionesPermitidas: number[]): FilaSeccion {
    const opciones: { valor: string; peso: number }[] = [];
    for (const id of demarcacionesPermitidas) {
      for (const clave of seccionesNoCeroPorDemarcacion.get(id) ?? []) {
        opciones.push({ valor: clave, peso: personasPorSeccion.get(clave) ?? 1 });
      }
    }
    const clave = elegirPonderado(opciones);
    return seccionPorClave.get(clave)!;
  }

  function nombreLugar(seccion: FilaSeccion): string {
    const coloniaId = coloniaParaSeccion(seccion.clave);
    const colonia = coloniaId != null ? nombreColonia.get(coloniaId) : undefined;
    return colonia ?? `sección ${seccion.clave}`;
  }

  function construirActividad(
    tipo: TipoActividad,
    fecha: Date,
    estatus: EstatusActividad,
  ): FilaActividad {
    const seccion =
      tipo === "recorrido"
        ? elegirSeccionParaRecorrido()
        : elegirSeccionPonderadaPorPoblacion(idsDemarcaciones);
    const lugar = nombreLugar(seccion);
    const punto = jitter(seccion.centro_lat, seccion.centro_lng);
    const responsable = usuarioLocal(seccion.demarcacion_id, seccion.clave);
    const realizada = estatus === "realizada";
    const asistentes = realizada || estatus === "en_curso" ? entero(8, 45) : null;

    return {
      id: uuidDeterminista(),
      tipo,
      nombre: `${elegirUno(NOMBRES_POR_TIPO[tipo])} en ${lugar}`,
      fecha: formatearFecha(fecha),
      hora: `${entero(8, 19).toString().padStart(2, "0")}:${elegirUno(["00", "15", "30", "45"])}:00`,
      direccion: calleVerosimil(),
      colonia_id: coloniaParaSeccion(seccion.clave),
      seccion_clave: seccion.clave,
      demarcacion_id: seccion.demarcacion_id,
      lat: punto.lat,
      lng: punto.lng,
      responsable_id: responsable,
      objetivo: elegirUno(OBJETIVOS_POR_TIPO[tipo]),
      notas: null,
      estatus,
      asistentes_aprox: realizada ? asistentes : null,
      conclusion: realizada
        ? `Actividad realizada sin incidentes, con ${asistentes} asistentes aproximados. Se dará seguimiento a los compromisos tomados.`
        : null,
      cerrada_en: realizada ? fechaConHoraAlAzar(fecha).toISOString() : null,
      cerrada_por: realizada ? responsable : null,
      created_by: responsable,
      created_at: sumarDias(fecha, -entero(1, 5)).toISOString(),
    };
  }

  const NUM_REALIZADAS = 46;
  const NUM_EN_CURSO = 2;
  const NUM_PROGRAMADAS = 7;
  const TOTAL_ACTIVIDADES = NUM_REALIZADAS + NUM_EN_CURSO + NUM_PROGRAMADAS; // 55

  // Un tercio de cada tipo para reunión, activismo y recorrido, y un puñado de cruceros aparte
  // (peso menor a propósito) para que el tipo nuevo aparezca sin competir con los otros tres.
  const [numReunion, numActivismo, numRecorrido, numCrucero] = repartirEntero(
    TOTAL_ACTIVIDADES,
    [1, 1, 1, 0.4],
  );
  const bolsaTipos = barajar([
    ...Array(numReunion).fill("reunion" as TipoActividad),
    ...Array(numActivismo).fill("activismo" as TipoActividad),
    ...Array(numRecorrido).fill("recorrido" as TipoActividad),
    ...Array(numCrucero).fill("crucero" as TipoActividad),
  ]);

  const actividades: FilaActividad[] = [];
  let cursorTipo = 0;

  for (let i = 0; i < NUM_REALIZADAS; i++) {
    const fecha = sumarDias(HOY, -entero(1, 69));
    actividades.push(construirActividad(bolsaTipos[cursorTipo++], fecha, "realizada"));
  }
  for (let i = 0; i < NUM_EN_CURSO; i++) {
    actividades.push(construirActividad(bolsaTipos[cursorTipo++], HOY, "en_curso"));
  }
  for (let i = 0; i < NUM_PROGRAMADAS; i++) {
    const fecha = sumarDias(HOY, entero(1, 14));
    actividades.push(construirActividad(bolsaTipos[cursorTipo++], fecha, "programada"));
  }
  actividades.sort((a, b) => a.fecha.localeCompare(b.fecha));

  /* ------------------------------------------------------------------------------------------
   * 10. Brigadistas por actividad
   * ------------------------------------------------------------------------------------------ */

  const actividadBrigadistas: { actividad_id: string; usuario_id: string }[] = [];
  for (const actividad of actividades) {
    const cantidad = entero(0, 3);
    const elegidos = new Set<string>();
    for (let i = 0; i < cantidad; i++) elegidos.add(elegirUno(brigadistaIds));
    for (const usuarioId of elegidos) {
      actividadBrigadistas.push({ actividad_id: actividad.id, usuario_id: usuarioId });
    }
  }

  /* ------------------------------------------------------------------------------------------
   * 11. Participaciones: cada actividad realizada o en curso reúne participantes. 'registro' es
   *     la actividad donde se dio de alta a la persona (como mucho una por persona, y entonces
   *     personas.actividad_origen apunta ahí); 'asistencia' es gente que ya existía y volvió a
   *     aparecer. Se cuida la restricción unique (persona_id, actividad_id).
   * ------------------------------------------------------------------------------------------ */

  type FilaParticipacion = {
    id: string;
    persona_id: string;
    actividad_id: string;
    tipo: "registro" | "asistencia";
    registrada_por: string;
    created_at: string;
  };

  const participaciones: FilaParticipacion[] = [];
  const usadoRegistro = new Set<string>();
  const paresUsados = new Set<string>();
  const origenPorPersona = new Map<string, string>();

  function candidatosPara(demarcacionId: number, seccionClave: string): FilaPersona[] {
    const local = personasPorSeccionClave.get(seccionClave) ?? [];
    if (local.length >= 6) return local;
    return personasPorDemarcacionId.get(demarcacionId) ?? local;
  }

  const actividadesConAsistencia = actividades.filter((a) => a.estatus === "realizada" || a.estatus === "en_curso");

  for (const actividad of actividadesConAsistencia) {
    const candidatos = candidatosPara(actividad.demarcacion_id, actividad.seccion_clave);
    if (candidatos.length === 0) continue;
    const cantidadParticipantes = Math.min(candidatos.length, entero(10, 30));

    // Baraja local determinista de índices, para no repetir persona en la misma actividad.
    const indices = barajar([...candidatos.keys()]).slice(0, cantidadParticipantes);

    for (const idx of indices) {
      const persona = candidatos[idx];
      const par = `${persona.id}|${actividad.id}`;
      if (paresUsados.has(par)) continue;

      const puedeRegistro = !usadoRegistro.has(persona.id);
      const esRegistro = puedeRegistro && conProbabilidad(0.35);
      const tipo: "registro" | "asistencia" = esRegistro ? "registro" : "asistencia";

      paresUsados.add(par);
      if (tipo === "registro") {
        usadoRegistro.add(persona.id);
        origenPorPersona.set(persona.id, actividad.id);
      }

      participaciones.push({
        id: uuidDeterminista(),
        persona_id: persona.id,
        actividad_id: actividad.id,
        tipo,
        registrada_por: usuarioLocal(actividad.demarcacion_id, actividad.seccion_clave),
        created_at: fechaConHoraAlAzar(new Date(actividad.fecha)).toISOString(),
      });
    }
  }

  // personas.actividad_origen se fija después de armar las participaciones, mutando en memoria
  // los mismos objetos que ya están en el arreglo `personas` (todavía no se ha escrito nada).
  for (const persona of personas) {
    const actividadOrigen = origenPorPersona.get(persona.id);
    if (actividadOrigen) persona.actividad_origen = actividadOrigen;
  }

  /* ------------------------------------------------------------------------------------------
   * 12. Menciones de problemáticas: cuelgan de la participación, correlacionadas por zona. Tabla
   *     de pesos explícita y comentada, nada de números mágicos sueltos en medio del código.
   * ------------------------------------------------------------------------------------------ */

  const NOMBRES_PROBLEMATICAS = [
    "Agua",
    "Seguridad",
    "Alumbrado",
    "Basura",
    "Baches y calles",
    "Transporte y movilidad",
    "Parques y espacios públicos",
    "Servicios públicos",
    "Servicios de salud",
    "Otro",
  ] as const;

  const PESO_BASE = 1; // variedad mínima: toda problemática puede aparecer en cualquier zona.
  const PESO_BACHES_BASE = 4; // "Baches y calles aparece parejo en todas partes": arranca alto en todas.
  const REFUERZO_DOMINANTE = 9; // lo que separa a la problemática que domina una zona del resto.
  const REFUERZO_SECUNDARIO = 6; // un segundo tema notorio en la misma zona, sin llegar a dominar.

  // Zonas de refuerzo, tal como las describe spec/modelo-datos.md:
  const ZONAS_AGUA = [8, 12, 5, 7, 14]; // Pueblo Nuevo, San Martín Mexicapam, Donají, Montoya, Trinidad de Viguera
  const ZONAS_SEGURIDAD_TRANSPORTE = [1, 2]; // Cabecera Municipal, Candiani
  const ZONAS_ALUMBRADO = [9, 6, 11]; // periferia alta: San Felipe del Agua, Guadalupe Victoria, San Luis Beltrán

  function pesosProblematicaPorDemarcacion(demarcacionId: number): Record<string, number> {
    const pesos: Record<string, number> = {};
    for (const nombre of NOMBRES_PROBLEMATICAS) pesos[nombre] = PESO_BASE;
    pesos["Baches y calles"] = PESO_BACHES_BASE;
    if (ZONAS_AGUA.includes(demarcacionId)) pesos["Agua"] = PESO_BASE + REFUERZO_DOMINANTE;
    if (ZONAS_SEGURIDAD_TRANSPORTE.includes(demarcacionId)) {
      pesos["Seguridad"] = PESO_BASE + REFUERZO_DOMINANTE;
      pesos["Transporte y movilidad"] = PESO_BASE + REFUERZO_SECUNDARIO;
    }
    if (ZONAS_ALUMBRADO.includes(demarcacionId)) pesos["Alumbrado"] = PESO_BASE + REFUERZO_DOMINANTE;
    return pesos;
  }

  const COMENTARIOS_POR_PROBLEMATICA: Record<string, readonly string[]> = {
    "Servicios de salud": [
      "La clínica más cercana queda muy lejos y no hay transporte directo.",
      "Piden jornadas de salud en la colonia, sobre todo para adultos mayores.",
      "El centro de salud abre pocas horas y casi nunca hay medicamento.",
    ],
    Agua: [
      "Llevamos varios días sin agua en la calle.",
      "La presión baja mucho por las tardes.",
      "Hay una fuga desde hace semanas que nadie atiende.",
    ],
    Seguridad: [
      "Piden más rondines nocturnos en la zona.",
      "Ha habido asaltos cerca de la esquina.",
      "Falta alumbrado que ayude con la seguridad también.",
    ],
    Alumbrado: [
      "Varias luminarias llevan meses apagadas.",
      "La calle se queda muy oscura de noche.",
      "Piden revisar el cableado del poste de la esquina.",
    ],
    Basura: [
      "El camión no pasa con regularidad.",
      "Se acumula basura en el lote de la esquina.",
      "Piden un contenedor comunitario.",
    ],
    "Baches y calles": [
      "La calle principal tiene baches grandes.",
      "Piden repavimentar antes de las lluvias.",
      "El bache de la esquina ya dañó varios coches.",
    ],
    "Transporte y movilidad": [
      "El transporte pasa muy espaciado.",
      "Falta una parada techada.",
      "Piden más unidades en hora pico.",
    ],
    "Parques y espacios públicos": [
      "El parque necesita mantenimiento.",
      "Piden más juegos infantiles.",
      "Falta poda en el área verde.",
    ],
    "Servicios públicos": [
      "Piden revisar el drenaje de la cuadra.",
      "Falta mantenimiento a la red de agua.",
      "Solicitan una revisión general de servicios.",
    ],
    Otro: ["Comentario general sobre la colonia.", "Duda sobre trámites municipales."],
  };

  type FilaMencion = {
    id: string;
    participacion_id: string;
    problematica_id: number;
    comentario: string | null;
  };

  const menciones: FilaMencion[] = [];
  const personaPorId = new Map(personas.map((p) => [p.id, p]));

  for (const participacion of participaciones) {
    const persona = personaPorId.get(participacion.persona_id)!;
    const r = rng();
    const cantidadMenciones = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
    if (cantidadMenciones === 0) continue;

    const pesos = pesosProblematicaPorDemarcacion(persona.demarcacion_id);
    const usadasEnEstaParticipacion = new Set<string>();
    for (let i = 0; i < cantidadMenciones; i++) {
      const opciones = NOMBRES_PROBLEMATICAS.filter((n) => !usadasEnEstaParticipacion.has(n)).map((n) => ({
        valor: n,
        peso: pesos[n],
      }));
      if (opciones.length === 0) break;
      const problematica = elegirPonderado(opciones);
      usadasEnEstaParticipacion.add(problematica);
      menciones.push({
        id: uuidDeterminista(),
        participacion_id: participacion.id,
        problematica_id: idProblematica.get(problematica)!,
        comentario: conProbabilidad(0.5) ? elegirUno(COMENTARIOS_POR_PROBLEMATICA[problematica]) : null,
      });
    }
  }

  /* ------------------------------------------------------------------------------------------
   * 13. Solicitudes: unas cuantas colgadas de participaciones.
   * ------------------------------------------------------------------------------------------ */

  const TEMAS_SOLICITUD = [
    "Bacheo de calle",
    "Falta de alumbrado público",
    "Fuga de agua",
    "Poda de árboles",
    "Recolección de basura",
    "Rehabilitación de banqueta",
    "Instalación de reductores de velocidad",
    "Apoyo para evento comunitario",
    "Limpieza de lote baldío",
    "Mantenimiento de parque",
  ] as const;

  type FilaSolicitud = {
    id: string;
    persona_id: string;
    participacion_id: string;
    tema: string;
    descripcion: string;
    requiere_seguimiento: boolean;
    created_at: string;
  };

  const NUM_SOLICITUDES = 60;
  const solicitudes: FilaSolicitud[] = [];
  const participacionesParaSolicitud = barajar([...participaciones]).slice(
    0,
    Math.min(NUM_SOLICITUDES, participaciones.length),
  );
  for (const participacion of participacionesParaSolicitud) {
    const tema = elegirUno(TEMAS_SOLICITUD);
    solicitudes.push({
      id: uuidDeterminista(),
      persona_id: participacion.persona_id,
      participacion_id: participacion.id,
      tema,
      descripcion: `Vecino solicita seguimiento sobre: ${tema.toLowerCase()}.`,
      requiere_seguimiento: conProbabilidad(0.4),
      created_at: participacion.created_at,
    });
  }

  /* ------------------------------------------------------------------------------------------
   * 14. Seguimientos: 300, sobre personas con quiere_participar o quiere_info, más pendientes
   *     que atendidos.
   * ------------------------------------------------------------------------------------------ */

  type TipoSeguimiento = "llamada" | "whatsapp" | "invitacion" | "reunion" | "otro";
  type EstadoSeguimiento = "pendiente" | "en_seguimiento" | "atendido";

  type FilaSeguimiento = {
    id: string;
    persona_id: string;
    fecha: string;
    tipo: TipoSeguimiento;
    nota: string;
    responsable_id: string;
    estado: EstadoSeguimiento;
    created_at: string;
  };

  const NOTAS_SEGUIMIENTO = [
    "Se contactó y quedó de confirmar.",
    "Pendiente de una segunda llamada.",
    "Mostró interés en participar.",
    "Solicitó más información por escrito.",
    "No contestó, se reintentará.",
    "Confirmó su asistencia a la próxima actividad.",
  ] as const;

  const NUM_SEGUIMIENTOS = 300;
  const elegiblesSeguimiento = personas.filter((p) => p.quiere_participar || p.quiere_info);
  const seguimientos: FilaSeguimiento[] = [];

  if (elegiblesSeguimiento.length > 0) {
    for (let i = 0; i < NUM_SEGUIMIENTOS; i++) {
      const persona = elegirUno(elegiblesSeguimiento);
      const estado = elegirPonderado<EstadoSeguimiento>([
        { valor: "pendiente", peso: 45 },
        { valor: "en_seguimiento", peso: 30 },
        { valor: "atendido", peso: 25 },
      ]);
      const fecha = sumarDias(HOY, -entero(0, 69));
      seguimientos.push({
        id: uuidDeterminista(),
        persona_id: persona.id,
        fecha: formatearFecha(fecha),
        tipo: elegirUno<TipoSeguimiento>(["llamada", "whatsapp", "invitacion", "reunion", "otro"]),
        nota: elegirUno(NOTAS_SEGUIMIENTO),
        responsable_id: usuarioLocal(persona.demarcacion_id, persona.seccion_clave),
        estado,
        created_at: fechaConHoraAlAzar(fecha).toISOString(),
      });
    }
  }

  /* ------------------------------------------------------------------------------------------
   * 15. Representantes de casilla: titular y suplente por casilla, con sus tres estados y con
   *     quién los capturó. Es lo que llena el mapa de casillas y sus barras de avance.
   * ------------------------------------------------------------------------------------------ */

  type CargoRepresentante = "titular" | "suplente";
  type EstadoCapacitacion = "capacitado" | "por_capacitar";
  type EstadoManual = "entregado" | "pendiente";
  type EstadoAcreditacion = "acreditado" | "pendiente";

  type FilaRepresentante = {
    id: string;
    casilla_id: number;
    cargo: CargoRepresentante;
    persona_id: string | null;
    nombre: string;
    telefono_norm: string;
    capacitacion: EstadoCapacitacion;
    manual: EstadoManual;
    acreditacion: EstadoAcreditacion;
    registrado_por: string;
    created_at: string;
  };

  // Cobertura por prioridad de sección (spec de esta tarea): A alta, B media, sin prioridad baja.
  // "suplente" es la tasa MARGINAL sobre el total de casillas, no condicionada al titular; como
  // nunca hay suplente sin titular, la probabilidad condicionada se deriva dividiendo entre la
  // tasa de titular (p. ej. A: 0.70 / 0.85 ≈ 82 % de los titulares también tienen suplente).
  const COBERTURA_POR_PRIORIDAD: Record<"A" | "B" | "sin_prioridad", { titular: number; suplenteMarginal: number }> = {
    A: { titular: 0.85, suplenteMarginal: 0.7 },
    B: { titular: 0.6, suplenteMarginal: 0.4 },
    sin_prioridad: { titular: 0.3, suplenteMarginal: 0.15 },
  };

  function claveCobertura(prioridad: "A" | "B" | null): "A" | "B" | "sin_prioridad" {
    return prioridad ?? "sin_prioridad";
  }

  // Los tres estados, correlacionados a propósito: capacitación primero, manual entregado
  // condicionado a la capacitación (algo más probable si ya se capacitó, pero el manual se
  // reparte casi aparte porque es el trámite más fácil de los tres), y acreditación al final,
  // que solo despega de verdad cuando ya se está capacitado y con manual entregado — así casi
  // nunca sale un acreditado sin capacitar. El residuo pequeño fuera de ese grupo es ruido de
  // captura, no la regla.
  function estadosAlAzar(): { capacitacion: EstadoCapacitacion; manual: EstadoManual; acreditacion: EstadoAcreditacion } {
    const capacitado = conProbabilidad(0.6);
    const manualEntregado = conProbabilidad(capacitado ? 0.85 : 0.475);
    const puedeAcreditar = capacitado && manualEntregado;
    const acreditado = conProbabilidad(puedeAcreditar ? 0.65 : 0.03);
    return {
      capacitacion: capacitado ? "capacitado" : "por_capacitar",
      manual: manualEntregado ? "entregado" : "pendiente",
      acreditacion: acreditado ? "acreditado" : "pendiente",
    };
  }

  // Quién es el representante: ~45 % ya están en el padrón sembrado. Se prioriza, en este orden,
  // a quien levantó la mano (quiere_ser_representante) de la propia sección, luego de la misma
  // demarcación, y solo si no hay nadie con la mano levantada se cae a cualquier persona local
  // (primero de la sección, luego de la demarcación) antes de generar un nombre nuevo. Cada
  // persona del padrón se usa como máximo una vez: nadie cuida dos casillas a la vez.
  const personaUsadaComoRepresentante = new Set<string>();

  function candidatoPadronPara(seccionClave: string, demarcacionId: number): FilaPersona | null {
    const disponible = (p: FilaPersona) => !personaUsadaComoRepresentante.has(p.id);
    const enSeccion = (personasPorSeccionClave.get(seccionClave) ?? []).filter(disponible);
    const enDemarcacion = (personasPorDemarcacionId.get(demarcacionId) ?? []).filter(disponible);

    const enSeccionConMano = enSeccion.filter((p) => p.quiere_ser_representante);
    if (enSeccionConMano.length > 0) return elegirUno(enSeccionConMano);
    const enDemarcacionConMano = enDemarcacion.filter((p) => p.quiere_ser_representante);
    if (enDemarcacionConMano.length > 0) return elegirUno(enDemarcacionConMano);
    if (enSeccion.length > 0) return elegirUno(enSeccion);
    if (enDemarcacion.length > 0) return elegirUno(enDemarcacion);
    return null;
  }

  const PROB_DESDE_PADRON = 0.45;

  function construirRepresentante(
    casilla: FilaCasilla,
    seccion: FilaSeccion,
    cargo: CargoRepresentante,
  ): FilaRepresentante {
    const usarPadron = conProbabilidad(PROB_DESDE_PADRON);
    const persona = usarPadron ? candidatoPadronPara(seccion.clave, seccion.demarcacion_id) : null;
    if (persona) personaUsadaComoRepresentante.add(persona.id);

    const telefono = persona ? null : siguienteTelefono();
    const estados = estadosAlAzar();

    return {
      id: uuidDeterminista(),
      casilla_id: casilla.id,
      cargo,
      persona_id: persona?.id ?? null,
      nombre: persona?.nombre ?? nombreVerosimil(),
      telefono_norm: persona?.telefono_norm ?? telefono!.norm,
      ...estados,
      registrado_por: usuarioLocal(seccion.demarcacion_id, seccion.clave),
      // Levantamiento reciente y en curso: la estructura arma casillas en las últimas semanas,
      // no de una sola vez.
      created_at: fechaConHoraAlAzar(sumarDias(HOY, -entero(0, 45))).toISOString(),
    };
  }

  const representantes: FilaRepresentante[] = [];
  // casilla_id -> qué cargos quedaron cubiertos, para el informe de cobertura por casilla.
  const coberturaPorCasilla = new Map<number, { titular: boolean; suplente: boolean }>();

  for (const casilla of filasCasillas) {
    const seccion = seccionPorClave.get(casilla.seccion_clave);
    if (!seccion) {
      // No debería pasar: las 169 secciones de casillas.csv están todas en el catálogo. Si
      // llegara a faltar una, se salta la casilla en vez de reventar el sembrado completo.
      console.error(
        `Aviso: la casilla ${casilla.id} apunta a la sección ${casilla.seccion_clave}, que no está ` +
          "en el catálogo leído. Se deja sin representantes.",
      );
      continue;
    }
    const { titular: probTitular, suplenteMarginal } = COBERTURA_POR_PRIORIDAD[claveCobertura(seccion.prioridad)];

    const hayTitular = conProbabilidad(probTitular);
    // Nunca suplente sin titular: la probabilidad condicionada sale de dividir la tasa marginal
    // entre la de titular.
    const haySuplente = hayTitular && conProbabilidad(suplenteMarginal / probTitular);

    if (hayTitular) representantes.push(construirRepresentante(casilla, seccion, "titular"));
    if (haySuplente) representantes.push(construirRepresentante(casilla, seccion, "suplente"));
    coberturaPorCasilla.set(casilla.id, { titular: hayTitular, suplente: haySuplente });
  }

  /* ============================================================================================
   * Informe de verificación
   * ============================================================================================ */

  console.log("========================================================================");
  console.log("INFORME DE VERIFICACIÓN");
  console.log("========================================================================\n");

  console.log("Personas por demarcación (mayor a menor):");
  const filasInformePersonas = idsDemarcaciones
    .map((id) => ({
      demarcación: nombrePorDemarcacion.get(id) ?? String(id),
      personas: personasPorDemarcacion.get(id) ?? 0,
      "%": (((personasPorDemarcacion.get(id) ?? 0) / NUM_PERSONAS) * 100).toFixed(1),
    }))
    .sort((a, b) => b.personas - a.personas);
  console.table(filasInformePersonas);

  console.log(`\nSecciones en cero personas: ${clavesEnCero.length} (objetivo: unas ${OBJETIVO_SECCIONES_CERO}).`);
  console.log(`Distancia máxima entre centroides del grupo: ${distanciaMaxCeroKm.toFixed(2)} km (grupo contiguo).`);
  console.log(`Claves: ${clavesEnCero.join(", ")}`);

  console.log(
    `\nSecciones sin responsable: ${seccionesSinResponsable} de ${filasSecciones.length} ` +
      `(con responsable: ${clavesConResponsable.length}).`,
  );

  console.log("\nActividades por tipo:");
  console.table(
    (["reunion", "activismo", "recorrido", "crucero"] as TipoActividad[]).map((tipo) => ({
      tipo,
      cantidad: actividades.filter((a) => a.tipo === tipo).length,
    })),
  );
  console.log("Actividades por estatus:");
  console.table(
    (["realizada", "en_curso", "programada"] as EstatusActividad[]).map((estatus) => ({
      estatus,
      cantidad: actividades.filter((a) => a.estatus === estatus).length,
    })),
  );

  console.log("\nParticipaciones por tipo:");
  console.table(
    (["registro", "asistencia"] as const).map((tipo) => ({
      tipo,
      cantidad: participaciones.filter((p) => p.tipo === tipo).length,
    })),
  );

  console.log("\nMenciones por demarcación y problemática (con la dominante aparte):");
  const conteoMenciones = new Map<string, number>();
  for (const mencion of menciones) {
    const participacion = participaciones.find((p) => p.id === mencion.participacion_id)!;
    const persona = personaPorId.get(participacion.persona_id)!;
    const nombreProblematica = filasProblematicas.find((p) => p.id === mencion.problematica_id)!.nombre;
    const llave = `${persona.demarcacion_id}|${nombreProblematica}`;
    conteoMenciones.set(llave, (conteoMenciones.get(llave) ?? 0) + 1);
  }
  const filasInformeMenciones = idsDemarcaciones.map((id) => {
    const fila: Record<string, string | number> = { demarcación: nombrePorDemarcacion.get(id) ?? String(id) };
    let max = -1;
    let dominante = "—";
    for (const nombreProblematica of NOMBRES_PROBLEMATICAS) {
      const c = conteoMenciones.get(`${id}|${nombreProblematica}`) ?? 0;
      fila[nombreProblematica] = c;
      if (c > max) {
        max = c;
        dominante = nombreProblematica;
      }
    }
    fila["dominante"] = max > 0 ? dominante : "—";
    return fila;
  });
  console.table(filasInformeMenciones);

  console.log("\nSeguimientos por estado:");
  console.table(
    (["pendiente", "en_seguimiento", "atendido"] as EstadoSeguimiento[]).map((estado) => ({
      estado,
      cantidad: seguimientos.filter((s) => s.estado === estado).length,
    })),
  );

  console.log("\nFicha de persona (fase 1 · PLAN-ELECTORAL.md):");
  console.table([
    {
      "con género": personas.filter((p) => p.genero !== null).length,
      "con fecha de nacimiento": personas.filter((p) => p.fecha_nacimiento !== null).length,
      "cumplen hoy": personasCumpleanosHoy,
      promovidas: personas.filter((p) => p.es_promovido).length,
      "aspiran a representante": personas.filter((p) => p.quiere_ser_representante).length,
    },
  ]);

  console.log("\nRepresentantes de casilla:");
  const titulares = representantes.filter((r) => r.cargo === "titular");
  const suplentes = representantes.filter((r) => r.cargo === "suplente");
  const casillasCompletas = [...coberturaPorCasilla.values()].filter((c) => c.titular && c.suplente).length;
  console.table([
    {
      casillas: filasCasillas.length,
      "con titular": titulares.length,
      "con suplente": suplentes.length,
      completas: casillasCompletas,
      "desde padrón": representantes.filter((r) => r.persona_id !== null).length,
      "nombre nuevo": representantes.filter((r) => r.persona_id === null).length,
    },
  ]);

  console.log("Representantes por estado:");
  console.table([
    {
      capacitados: representantes.filter((r) => r.capacitacion === "capacitado").length,
      "manual entregado": representantes.filter((r) => r.manual === "entregado").length,
      acreditados: representantes.filter((r) => r.acreditacion === "acreditado").length,
      total: representantes.length,
    },
  ]);

  console.log("Cobertura de casillas por prioridad de su sección:");
  const filasCoberturaPrioridad = (["A", "B", "sin_prioridad"] as const).map((clave) => {
    const casillasDeEstaPrioridad = filasCasillas.filter(
      (c) => claveCobertura(seccionPorClave.get(c.seccion_clave)?.prioridad ?? null) === clave,
    );
    const conTitular = casillasDeEstaPrioridad.filter((c) => coberturaPorCasilla.get(c.id)?.titular).length;
    const conSuplente = casillasDeEstaPrioridad.filter((c) => coberturaPorCasilla.get(c.id)?.suplente).length;
    const total = casillasDeEstaPrioridad.length;
    return {
      prioridad: clave,
      casillas: total,
      "% con titular": total > 0 ? ((conTitular / total) * 100).toFixed(1) : "—",
      "% con suplente": total > 0 ? ((conSuplente / total) * 100).toFixed(1) : "—",
    };
  });
  console.table(filasCoberturaPrioridad);

  console.log(
    `\nResumen: ${usuarios.length} usuarios, ${asignaciones.length} asignaciones, ${personas.length} personas, ` +
      `${actividades.length} actividades, ${actividadBrigadistas.length} actividad_brigadistas, ` +
      `${participaciones.length} participaciones, ${menciones.length} menciones, ${solicitudes.length} solicitudes, ` +
      `${seguimientos.length} seguimientos, ${representantes.length} representantes_casilla.`,
  );

  if (SIMULAR) {
    console.log("\n--simular: no se escribió nada a la base.");
    return;
  }

  /* ============================================================================================
   * Escritura a la base: primero se borra, en el orden que respeta las llaves foráneas.
   * ============================================================================================ */

  console.log("\nBorrando datos sembrados previos, en el orden que respeta las llaves foráneas…");
  await vaciarUuid("menciones_problematica");
  await vaciarUuid("solicitudes");
  await vaciarUuid("seguimientos");
  await vaciarUuid("participaciones");
  await vaciarUuid("actividad_brigadistas", "usuario_id");
  await vaciarUuid("fotos");
  // representantes_casilla apunta a personas (persona_id) y a usuarios (registrado_por): se borra
  // antes de llegar a esas dos tablas, más abajo. No se toca casillas —no es de este script y
  // además, por el cascade de casilla_id, borrarla se llevaría estos renglones de todos modos.
  await vaciarUuid("representantes_casilla");
  {
    // Antes de borrar actividades hay que limpiar personas.actividad_origen: si quedara alguna
    // fila apuntando a una actividad que estamos por borrar, la llave foránea lo rechazaría.
    const { error } = await supabase
      .from("personas")
      .update({ actividad_origen: null })
      .not("actividad_origen", "is", null);
    if (error) {
      console.error("No se pudo limpiar personas.actividad_origen:", error);
      process.exit(1);
    }
  }
  await vaciarUuid("actividades");
  await vaciarUuid("personas");
  await vaciarSerial("asignaciones_responsable");
  await vaciarUuid("usuarios");

  console.log("\nInsertando…");
  await insertarPorLotes("usuarios", usuarios, TAMANO_LOTE);
  await insertarPorLotes("asignaciones_responsable", asignaciones, TAMANO_LOTE);
  await insertarPorLotes("actividades", actividades, TAMANO_LOTE);
  await insertarPorLotes("actividad_brigadistas", actividadBrigadistas, TAMANO_LOTE);
  await insertarPorLotes("personas", personas, TAMANO_LOTE);
  await insertarPorLotes("participaciones", participaciones, TAMANO_LOTE);
  await insertarPorLotes("menciones_problematica", menciones, TAMANO_LOTE);
  await insertarPorLotes("solicitudes", solicitudes, TAMANO_LOTE);
  await insertarPorLotes("seguimientos", seguimientos, TAMANO_LOTE);
  // Va al final: depende de personas y de usuarios, ya insertados arriba, y de casillas, que ya
  // estaba cargada desde antes de correr este script.
  await insertarPorLotes("representantes_casilla", representantes, TAMANO_LOTE);

  console.log("\nSembrado terminado.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
