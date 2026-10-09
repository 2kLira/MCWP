/**
 * Copia la cartografía de data/ a public/datos/ para que el navegador la pueda pedir como archivo
 * estático y cachearla. La fuente de verdad sigue siendo data/: public/datos/ es una copia
 * generada y está en .gitignore.
 *
 * Corre solo antes de `npm run dev` y `npm run build`.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ARCHIVOS = ["secciones.geojson", "colonias.geojson"];
const origen = join(process.cwd(), "data");
const destino = join(process.cwd(), "public", "datos");

mkdirSync(destino, { recursive: true });

for (const archivo of ARCHIVOS) {
  const de = join(origen, archivo);
  const a = join(destino, archivo);
  if (!existsSync(de)) {
    console.error(`Falta data/${archivo}. La cartografía no se regenera, se versiona.`);
    process.exit(1);
  }
  // Solo copia si cambió, para no invalidar la caché del navegador en cada arranque.
  if (existsSync(a) && statSync(de).mtimeMs <= statSync(a).mtimeMs) continue;
  copyFileSync(de, a);
  console.log(`Publicado public/datos/${archivo}`);
}

/* ---------------------------------------------------------------------------
 * Catálogo de secciones, derivado
 * ---------------------------------------------------------------------------
 * secciones.geojson trae 157 polígonos, pero el catálogo del cliente son 169 secciones: 18 no
 * tienen geometría publicada en este marco. En esas 18, el GPS no resuelve (el punto no cae en
 * ningún polígono) y el toque en el mapa tampoco las ofrece, así que sin esto una captura ahí se
 * queda sin sección — y la sección es la única unidad territorial exacta del sistema.
 *
 * Se deriva de data/secciones-catalogo.csv y se publica con DOS campos y nada más: clave y
 * demarcación. La lista nominal y la prioridad son dato estratégico y no tienen por qué quedar
 * en un archivo que cualquiera puede pedir.
 * ------------------------------------------------------------------------- */

const CSV_CATALOGO = "secciones-catalogo.csv";
const SALIDA_CATALOGO = "secciones-catalogo.json";

const deCsv = join(origen, CSV_CATALOGO);
const aJson = join(destino, SALIDA_CATALOGO);

if (!existsSync(deCsv)) {
  console.error(`Falta data/${CSV_CATALOGO}. El catálogo no se regenera, se versiona.`);
  process.exit(1);
}

if (!existsSync(aJson) || statSync(deCsv).mtimeMs > statSync(aJson).mtimeMs) {
  const texto = readFileSync(deCsv, "utf8").trim();
  const [encabezado, ...renglones] = texto.split(/\r?\n/);
  const columnas = encabezado.split(",");
  const iSeccion = columnas.indexOf("seccion");
  const iDemarcacion = columnas.indexOf("demarcacion");
  const iGeometria = columnas.indexOf("tiene_geometria");

  if (iSeccion < 0 || iDemarcacion < 0) {
    console.error(`data/${CSV_CATALOGO} no trae las columnas seccion y demarcacion.`);
    process.exit(1);
  }

  const catalogo = renglones
    .filter((r) => r.trim() !== "")
    .map((r) => {
      const c = r.split(",");
      return {
        clave: c[iSeccion].trim(),
        demarcacion: c[iDemarcacion].trim(),
        // Para que la interfaz pueda avisar que esa sección no se va a dibujar en el mapa.
        conGeometria: iGeometria >= 0 ? c[iGeometria].trim() === "si" : true,
      };
    })
    .sort((a, b) => a.clave.localeCompare(b.clave));

  writeFileSync(aJson, JSON.stringify(catalogo));
  const sinGeo = catalogo.filter((s) => !s.conGeometria).length;
  console.log(
    `Publicado public/datos/${SALIDA_CATALOGO}: ${catalogo.length} secciones, ${sinGeo} sin geometría`,
  );
}

/* ---------------------------------------------------------------------------
 * Catálogo de colonias, derivado
 * ---------------------------------------------------------------------------
 * El formulario de registro solo necesita nombre, CP y a qué secciones pertenece cada colonia,
 * pero colonias.geojson pesa 220 KB porque arrastra los polígonos. Esto publica las mismas 286
 * colonias sin geometría, para que la captura en campo no baje un cuarto de mega por un
 * desplegable — y para que funcione sin red, como el resto de la resolución territorial.
 *
 * Nota de precisión: aquí no viene el porcentaje de traslape, que sí está en la base. El
 * desplegable del registro queda alfabético en vez de "primero la colonia que ocupa más de la
 * sección". La ficha de sección, que sí necesita el traslape, sigue leyéndolo de la base.
 * ------------------------------------------------------------------------- */

const SALIDA_COLONIAS = "colonias-catalogo.json";
const deColonias = join(origen, "colonias.geojson");
const aColonias = join(destino, SALIDA_COLONIAS);

if (!existsSync(aColonias) || statSync(deColonias).mtimeMs > statSync(aColonias).mtimeMs) {
  const geo = JSON.parse(readFileSync(deColonias, "utf8"));
  const colonias = geo.features
    .map((f) => ({
      id: f.properties.colonia_id,
      nombre: f.properties.nombre,
      cp: f.properties.cp == null ? null : String(f.properties.cp),
      demarcacion: f.properties.demarcacion_principal ?? null,
      secciones: f.properties.secciones ?? [],
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  writeFileSync(aColonias, JSON.stringify(colonias));
  console.log(
    `Publicado public/datos/${SALIDA_COLONIAS}: ${colonias.length} colonias, sin geometría`,
  );
}
