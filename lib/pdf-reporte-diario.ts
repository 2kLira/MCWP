/**
 * El reporte del día en PDF, para mandarlo por WhatsApp o correo sin abrir el sistema.
 *
 * Se arma en el navegador con jsPDF (ver PENDIENTES.md). Las dos librerías se cargan aparte, la
 * primera vez que se abre el reporte, para no engordar el resto de la aplicación; `cargarPdf` se
 * llama al montar la pantalla y así, al tocar el botón, el archivo sale sin esperar a la red. Eso
 * importa: el menú de compartir del teléfono solo se abre si se pide justo después del toque.
 *
 * Lleva solo cifras y nombres de quienes capturaron, nunca nombres de personas alcanzadas: un PDF
 * que se reenvía por WhatsApp ya no se puede recoger.
 */

import type { jsPDF as JsPDF } from "jspdf";
import type { ReporteDiario } from "@/lib/datos/reporte-diario";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";

type Modulos = {
  jsPDF: typeof JsPDF;
  autoTable: typeof import("jspdf-autotable").default;
};

let modulos: Promise<Modulos> | null = null;

export function cargarPdf(): Promise<Modulos> {
  modulos ??= Promise.all([import("jspdf"), import("jspdf-autotable")]).then(([a, b]) => ({
    jsPDF: a.jsPDF,
    autoTable: b.default,
  }));
  return modulos;
}

const NARANJA: [number, number, number] = [255, 130, 0];
const TINTA: [number, number, number] = [33, 29, 26];
const SUAVE: [number, number, number] = [110, 103, 97];
const LINEA: [number, number, number] = [226, 220, 214];
const FONDO: [number, number, number] = [248, 245, 242];

const MARGEN = 40;

type CeldaAutoTable = import("jspdf-autotable").CellHookData;

const formato = (n: number) => n.toLocaleString("es-MX");
const pct = (n: number, de: number) => (de > 0 ? `${Math.round((n / de) * 100)}%` : "-");

function fechaLarga(fecha: string): string {
  const texto = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function nombreArchivoPdf(fecha: string): string {
  return `reporte-del-dia-${fecha}.pdf`;
}

export function pdfReporteDiario({ jsPDF, autoTable }: Modulos, r: ReporteDiario): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  const util = ancho - MARGEN * 2;
  const t = r.total;
  const recorridos = r.actividades.filter((a) => a.tipo === "recorrido").length;

  /** Dónde terminó la última tabla, para encimar la siguiente debajo. */
  const finDeTabla = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Encabezado
  doc.setFillColor(...NARANJA);
  doc.rect(0, 0, ancho, 6, "F");
  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Reporte del día", MARGEN, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...SUAVE);
  doc.text(`${fechaLarga(r.fecha)} · Oaxaca de Juárez`, MARGEN, 70);

  // Cuatro cifras
  const cifras: [string, string, string][] = [
    ["Personas alcanzadas", formato(t.alcanzadas), `${formato(t.nuevas)} nuevas`],
    ["Promovidos", formato(t.promovidos), `${pct(t.promovidos, t.alcanzadas)} de las alcanzadas`],
    [
      "Actividades",
      formato(r.actividades.length),
      `${formato(recorridos)} ${recorridos === 1 ? "recorrido" : "recorridos"}`,
    ],
    ["Urgente contactar", formato(t.urgentes), `${formato(r.seguimientos)} seguimientos`],
  ];
  const separacion = 8;
  const anchoCifra = (util - separacion * 3) / 4;
  cifras.forEach(([etiqueta, valor, apoyo], i) => {
    const x = MARGEN + i * (anchoCifra + separacion);
    const y = 88;
    doc.setFillColor(...FONDO);
    doc.setDrawColor(...LINEA);
    doc.roundedRect(x, y, anchoCifra, 66, 6, 6, "FD");
    if (i === 1) {
      doc.setFillColor(...NARANJA);
      doc.rect(x, y + 10, 3, 46, "F");
    }
    doc.setFontSize(8.5);
    doc.setTextColor(...SUAVE);
    doc.text(etiqueta, x + 12, y + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...TINTA);
    doc.text(valor, x + 12, y + 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SUAVE);
    doc.text(apoyo, x + 12, y + 56, { maxWidth: anchoCifra - 20 });
  });

  const estilos = {
    theme: "plain" as const,
    margin: { left: MARGEN, right: MARGEN },
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: TINTA,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
      lineColor: LINEA,
    },
    headStyles: { textColor: SUAVE, fontStyle: "normal" as const, fontSize: 8 },
    bodyStyles: { lineWidth: { top: 0.5 } },
    // El título de una columna numérica se alinea con sus números.
    didParseCell: (d: CeldaAutoTable) => {
      if (d.section !== "head") return;
      const columna = d.table.styles.columnStyles[d.column.index];
      if (columna?.halign) d.cell.styles.halign = columna.halign;
    },
  };

  let y = 176;
  function titulo(texto: string) {
    // Si el título queda al pie de la hoja, se pasa a la siguiente junto con su tabla.
    if (y > doc.internal.pageSize.getHeight() - 110) {
      doc.addPage();
      y = MARGEN + 10;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...TINTA);
    doc.text(texto, MARGEN, y);
    doc.setFont("helvetica", "normal");
    y += 6;
  }

  // Categorías
  titulo("Categorías de las personas alcanzadas");
  autoTable(doc, {
    ...estilos,
    startY: y,
    head: [["Categoría", "Personas", "% de alcanzadas"]],
    body: [
      ["Promovidos", t.promovidos, pct(t.promovidos, t.alcanzadas)],
      ["Quieren información", t.quierenInfo, pct(t.quierenInfo, t.alcanzadas)],
      ["Quieren participar", t.quierenParticipar, pct(t.quierenParticipar, t.alcanzadas)],
      ["Quieren ser representante", t.representantes, pct(t.representantes, t.alcanzadas)],
      ["Barda o lona", t.bardaLona, pct(t.bardaLona, t.alcanzadas)],
      ["Urgente contactar", t.urgentes, pct(t.urgentes, t.alcanzadas)],
    ].map((f) => f.map(String)),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right", textColor: SUAVE } },
    didParseCell: (d) => {
      estilos.didParseCell(d);
      if (d.section === "body" && d.row.index === 0) d.cell.styles.fontStyle = "bold";
    },
  });
  y = finDeTabla() + 26;

  // Actividades
  titulo("Recorridos y actividades");
  if (r.actividades.length === 0) {
    y += 10;
    doc.setFontSize(9);
    doc.setTextColor(...SUAVE);
    doc.text("Ninguna actividad programada ni con capturas este día.", MARGEN, y);
    y += 30;
  } else {
    autoTable(doc, {
      ...estilos,
      startY: y,
      head: [["Actividad", "Responsable", "Secciones", "Alcanz.", "Promov.", "Info", "Urg."]],
      body: r.actividades.map((a) => [
        `${a.nombre}\n${ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}${a.hora ? ` · ${a.hora.slice(0, 5)}` : ""} · ${ETIQUETA_ESTATUS[a.estatus]}`,
        a.responsable ?? "-",
        a.seccionesAlcanzadas.length > 0 ? a.seccionesAlcanzadas.join(", ") : (a.seccion ?? "-"),
        String(a.categorias.alcanzadas),
        String(a.categorias.promovidos),
        String(a.categorias.quierenInfo),
        String(a.categorias.urgentes),
      ]),
      columnStyles: {
        0: { cellWidth: 150 },
        2: { cellWidth: 90 },
        3: { halign: "right", fontStyle: "bold" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
      },
    });
    y = finDeTabla() + 26;
  }

  // Secciones
  titulo("Por sección");
  autoTable(doc, {
    ...estilos,
    startY: y,
    head: [["Sección", "Demarcación", "Alcanz.", "Nuevas", "Promov.", "Info", "Particip.", "Urg."]],
    body:
      r.secciones.length > 0
        ? r.secciones.map((s) => [
            s.seccion,
            s.demarcacion ?? "-",
            ...[s.alcanzadas, s.nuevas, s.promovidos, s.quierenInfo, s.quierenParticipar, s.urgentes].map(
              String,
            ),
          ])
        : [["Sin personas alcanzadas este día.", "", "", "", "", "", "", ""]],
    columnStyles: {
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
  });
  y = finDeTabla() + 26;

  // Capturistas
  if (r.capturistas.length > 0) {
    titulo("Quién capturó");
    autoTable(doc, {
      ...estilos,
      startY: y,
      head: [["Capturista", "Alcanzadas", "Promovidos", "Quieren info", "Urgentes"]],
      body: r.capturistas.map((c) => [
        c.nombre,
        ...[c.alcanzadas, c.promovidos, c.quierenInfo, c.urgentes].map(String),
      ]),
      columnStyles: {
        1: { halign: "right", fontStyle: "bold" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });
    y = finDeTabla() + 26;
  }

  // Problemáticas
  if (r.problematicas.length > 0) {
    titulo("Lo que pidió la gente");
    autoTable(doc, {
      ...estilos,
      startY: y,
      head: [["Problemática", "Menciones"]],
      body: r.problematicas.map((p) => [p.problematica, String(p.menciones)]),
      columnStyles: { 1: { halign: "right" } },
    });
  }

  // Pie en todas las hojas
  const paginas = doc.getNumberOfPages();
  const generado = new Date().toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const alto = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(...SUAVE);
    doc.text(`Generado el ${generado} · Información confidencial`, MARGEN, alto - 22);
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, alto - 22, { align: "right" });
  }

  return doc.output("blob");
}

/**
 * En el teléfono abre el menú de compartir con el archivo adjunto; en la computadora lo abre en
 * otra pestaña. Si el navegador bloquea la pestaña, lo descarga.
 */
export async function compartirPdf(blob: Blob, nombre: string, titulo: string): Promise<void> {
  const archivo = new File([blob], nombre, { type: "application/pdf" });
  const tactil = window.matchMedia("(pointer: coarse)").matches;
  if (tactil && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo });
      return;
    } catch (e) {
      // Cerrar el menú sin elegir nada no es un error.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, "_blank");
  if (!ventana) {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
