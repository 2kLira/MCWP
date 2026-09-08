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
