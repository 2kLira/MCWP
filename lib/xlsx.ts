/**
 * Libro de Excel (.xlsx) armado en el navegador, sin librerías.
 *
 * Un .xlsx es un ZIP con unos cuantos XML. Para exportar tablas basta con el subconjunto mínimo:
 * una hoja por tabla, texto en línea (sin tabla de cadenas compartidas), números, fechas con
 * formato, encabezado en negritas y congelado, y autofiltro. El ZIP va sin compresión (método
 * "store"), que Excel, Numbers, LibreOffice y Google Sheets abren igual.
 *
 * Por qué no CSV: Excel en español abre el CSV con acentos rotos si falta el BOM, convierte
 * teléfonos y claves de sección en números, no deja varias tablas en un archivo y no trae filtros.
 *
 * Seguridad: aquí no hace falta el apóstrofo contra inyección de fórmulas que necesita lib/csv.ts.
 * Toda celda de texto se escribe como `inlineStr`, y Excel nunca evalúa un `inlineStr` como
 * fórmula, empiece con lo que empiece.
 */

export type Celda = string | number | boolean | Date | null | undefined;

export type Columna = {
  titulo: string;
  /** Ancho en caracteres. Si falta, se calcula del contenido. */
  ancho?: number;
  /** `fecha` = solo día; `fechaHora` = día y hora. Solo aplica a celdas Date. */
  formato?: "fecha" | "fechaHora";
};

export type Hoja = {
  nombre: string;
  columnas: Columna[];
  filas: Celda[][];
};

/* ---------------------------------------------------------------------------
 * Celdas
 * ------------------------------------------------------------------------- */

const ESTILO_ENCABEZADO = 1;
const ESTILO_FECHA = 2;
const ESTILO_FECHA_HORA = 3;

function escaparXml(texto: string): string {
  return (
    texto
      // XML 1.0 no admite caracteres de control salvo tabulador y saltos de línea.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function letraColumna(indice: number): string {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

/**
 * Número de serie de Excel a partir de la hora local del navegador. Excel no guarda zona horaria:
 * lo que se ve en la celda es lo que se veía en la pantalla de quien exportó.
 */
function serieExcel(fecha: Date): number {
  const local = Date.UTC(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate(),
    fecha.getHours(),
    fecha.getMinutes(),
    fecha.getSeconds(),
  );
  return local / 86_400_000 + 25_569;
}

function celdaXml(valor: Celda, ref: string, columna: Columna, estilo?: number): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const s = estilo ? ` s="${estilo}"` : "";

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return "";
    const estiloFecha = columna.formato === "fecha" ? ESTILO_FECHA : ESTILO_FECHA_HORA;
    return `<c r="${ref}" s="${estiloFecha}"><v>${serieExcel(valor)}</v></c>`;
  }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  }
  const texto = typeof valor === "boolean" ? (valor ? "Sí" : "No") : valor;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
}

function largoVisible(valor: Celda, columna: Columna): number {
  if (valor === null || valor === undefined) return 0;
  if (valor instanceof Date) return columna.formato === "fecha" ? 10 : 16;
  if (typeof valor === "boolean") return 2;
  return String(valor).length;
}

function hojaXml(hoja: Hoja): string {
  const { columnas, filas } = hoja;

  const anchos = columnas.map((col, i) => {
    if (col.ancho) return col.ancho;
    let maximo = col.titulo.length;
    for (const fila of filas.slice(0, 500)) maximo = Math.max(maximo, largoVisible(fila[i], col));
    return Math.min(60, Math.max(8, maximo + 2));
  });

  const cols = anchos
    .map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`)
    .join("");

  const encabezado = `<row r="1">${columnas
    .map((col, i) => celdaXml(col.titulo, `${letraColumna(i)}1`, col, ESTILO_ENCABEZADO))
    .join("")}</row>`;

  const cuerpo = filas
    .map((fila, f) => {
      const r = f + 2;
      const celdas = columnas
        .map((col, i) => celdaXml(fila[i], `${letraColumna(i)}${r}`, col))
        .join("");
      return `<row r="${r}">${celdas}</row>`;
    })
    .join("");

  const ultima = `${letraColumna(Math.max(0, columnas.length - 1))}${filas.length + 1}`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${encabezado}${cuerpo}</sheetData>` +
    (columnas.length > 0 ? `<autoFilter ref="A1:${ultima}"/>` : "") +
    `</worksheet>`
  );
}

/* ---------------------------------------------------------------------------
 * Libro
 * ------------------------------------------------------------------------- */

/** Excel rechaza el libro entero si un nombre de hoja trae []:*?/\, pasa de 31 o se repite. */
function nombresDeHoja(hojas: Hoja[]): string[] {
  const usados = new Set<string>();
  return hojas.map((h) => {
    const base = (h.nombre.replace(/[[\]:*?/\\]/g, " ").trim() || "Hoja").slice(0, 31);
    let nombre = base;
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) {
      const sufijo = ` (${n})`;
      nombre = base.slice(0, 31 - sufijo.length) + sufijo;
    }
    usados.add(nombre.toLowerCase());
    return nombre;
  });
}

const ESTILOS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2">` +
  `<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>` +
  `<numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/>` +
  `</numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function archivosDelLibro(hojas: Hoja[]): { ruta: string; contenido: string }[] {
  const nombres = nombresDeHoja(hojas);
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

  return [
    {
      ruta: "[Content_Types].xml",
      contenido:
        xml +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        hojas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    },
    {
      ruta: "_rels/.rels",
      contenido:
        xml +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      ruta: "xl/workbook.xml",
      contenido:
        xml +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>` +
        nombres
          .map((n, i) => `<sheet name="${escaparXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets>` +
        // El autofiltro necesita su nombre definido por hoja o Excel lo descarta al abrir.
        `<definedNames>` +
        hojas
          .map((h, i) => {
            if (h.columnas.length === 0) return "";
            const ultima = `$${letraColumna(h.columnas.length - 1)}$${h.filas.length + 1}`;
            const nombre = `'${nombres[i].replace(/'/g, "''")}'`;
            return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escaparXml(nombre)}!$A$1:${ultima}</definedName>`;
          })
          .join("") +
        `</definedNames>` +
        `</workbook>`,
    },
    {
      ruta: "xl/_rels/workbook.xml.rels",
      contenido:
        xml +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        hojas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { ruta: "xl/styles.xml", contenido: ESTILOS },
    ...hojas.map((h, i) => ({ ruta: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h) })),
  ];
}

/* ---------------------------------------------------------------------------
 * ZIP sin compresión
 * ------------------------------------------------------------------------- */

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < datos.length; i++) crc = TABLA_CRC[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(archivos: { ruta: string; contenido: string }[]): Blob {
  const codificador = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.ruta);
    const datos = codificador.encode(archivo.contenido);
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versión necesaria
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresión
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1 de enero de 1980: la fecha no le importa a Excel
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);

    const cabecera = new DataView(new ArrayBuffer(46));
    cabecera.setUint32(0, 0x02014b50, true);
    cabecera.setUint16(4, 20, true);
    cabecera.setUint16(6, 20, true);
    cabecera.setUint16(8, 0x0800, true);
    cabecera.setUint16(10, 0, true);
    cabecera.setUint16(12, 0, true);
    cabecera.setUint16(14, 0x21, true);
    cabecera.setUint32(16, crc, true);
    cabecera.setUint32(20, datos.length, true);
    cabecera.setUint32(24, datos.length, true);
    cabecera.setUint16(28, nombre.length, true);
    cabecera.setUint32(42, desplazamiento, true);

    partes.push(new Uint8Array(local.buffer), nombre, datos);
    central.push(new Uint8Array(cabecera.buffer), nombre);
    desplazamiento += 30 + nombre.length + datos.length;
  }

  const tamanoCentral = central.reduce((suma, p) => suma + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamanoCentral, true);
  fin.setUint32(16, desplazamiento, true);

  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ---------------------------------------------------------------------------
 * Descarga
 * ------------------------------------------------------------------------- */

export function libroXlsx(hojas: Hoja[]): Blob {
  return zip(archivosDelLibro(hojas));
}

export function descargarXlsx(nombreArchivo: string, hojas: Hoja[]): void {
  const url = URL.createObjectURL(libroXlsx(hojas));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${nombreArchivo}.xlsx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Safari de iPhone cancela la descarga si la URL se revoca en el mismo tick.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
