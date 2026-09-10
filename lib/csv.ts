/** Exportación a CSV desde cualquier tabla. Cuesta poco y en juntas siempre lo preguntan. */
export function descargarCsv(
  nombreArchivo: string,
  columnas: { llave: string; etiqueta: string }[],
  filas: Record<string, unknown>[],
): void {
  const escapar = (valor: unknown) => {
    const texto = valor === null || valor === undefined ? "" : String(valor);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const contenido = [
    columnas.map((c) => escapar(c.etiqueta)).join(","),
    ...filas.map((f) => columnas.map((c) => escapar(f[c.llave])).join(",")),
  ].join("\n");

  // El BOM hace que Excel abra los acentos bien.
  const blob = new Blob([`﻿${contenido}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${nombreArchivo}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

export type CsvLeido = {
  encabezados: string[];
  /** Una entrada por renglón, con el encabezado normalizado como llave. */
  filas: Record<string, string>[];
  /** El separador que se detectó, para poder decirlo si algo sale mal. */
  separador: string;
};

/**
 * Normaliza un encabezado para poder compararlo: minúsculas, sin acentos, sin espacios de sobra.
 * Así "Teléfono" y "telefono" son la misma columna, que es lo que la gente espera.
 */
export function normalizarEncabezado(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/**
 * Detecta el separador mirando el primer renglón. Excel en español exporta con punto y coma cuando
 * la configuración regional usa la coma como decimal, y esa es la mitad de los archivos que llegan.
 */
function detectarSeparador(primerRenglon: string): string {
  const candidatos = [",", ";", "\t", "|"];
  let mejor = ",";
  let maximo = 0;
  for (const sep of candidatos) {
    const cuantos = primerRenglon.split(sep).length - 1;
    if (cuantos > maximo) {
      maximo = cuantos;
      mejor = sep;
    }
  }
  return mejor;
}

/**
 * Lee un CSV completo. Respeta comillas, comas dentro de comillas y comillas escapadas dobles.
 * Quita el BOM que mete Excel y acepta finales de línea de Windows.
 *
 * No usa librería: el formato que llega de Excel cabe en estas cuarenta líneas y traer un
 * analizador entero para esto contradice la regla de no agregar dependencias.
 */
export function leerCsv(texto: string): CsvLeido {
  const limpio = texto.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  if (limpio.trim() === "") return { encabezados: [], filas: [], separador: "," };

  const separador = detectarSeparador(limpio.split("\n", 1)[0] ?? "");

  const renglones: string[][] = [];
  let campo = "";
  let renglon: string[] = [];
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];

    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      renglon.push(campo);
      campo = "";
    } else if (c === "\n") {
      renglon.push(campo);
      renglones.push(renglon);
      renglon = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  renglon.push(campo);
  renglones.push(renglon);

  const crudos = renglones.shift() ?? [];
  const encabezados = crudos.map(normalizarEncabezado);

  const filas = renglones
    // Excel deja un renglón vacío al final de casi todos los archivos.
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const fila: Record<string, string> = {};
      encabezados.forEach((llave, i) => {
        fila[llave] = (r[i] ?? "").trim();
      });
      return fila;
    });

  return { encabezados, filas, separador };
}
