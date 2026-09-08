/**
 * Copia la cartografía de data/ a public/datos/ para que el navegador la pueda pedir como archivo
 * estático y cachearla. La fuente de verdad sigue siendo data/: public/datos/ es una copia
 * generada y está en .gitignore.
 *
 * Corre solo antes de `npm run dev` y `npm run build`.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
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
