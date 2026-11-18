"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Download,
  FileText,
  Footprints,
  ListChecks,
  MapPinned,
  Megaphone,
  MessageSquareText,
  TriangleAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { PortonAgenda } from "@/components/porton-agenda";
import { useActuante } from "@/components/proveedor-actuante";
import { Caja } from "@/components/sistema/caja";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { TarjetaCifra } from "@/components/sistema/tarjeta-cifra";
import { BarrasProporcion } from "@/components/tablero/micrograficas";
import {
  COLUMNAS_CATEGORIAS,
  formato,
  pct,
  seccionesDe,
  TablaCategorias,
  TablaDesbordada,
} from "@/components/reportes/piezas";
import { puedeVerListadosGenerales } from "@/lib/puertas-ui";
import {
  BRIGADA_INFORME,
  ETIQUETA_BRIGADA,
  ETIQUETA_ESTATUS,
  ETIQUETA_TIPO_ACTIVIDAD,
} from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import { fechaLocalIso } from "@/lib/utils";
import { descargarXlsx, type Hoja } from "@/lib/xlsx";
import { cargarPdf, compartirPdf, pdfReporteDiario } from "@/lib/pdf-reporte-diario";
import {
  reporteInforme,
  reporteInformeVacio,
  type Categorias,
  type ReporteInforme,
} from "@/lib/datos/reporte-diario";

const NOMBRE = ETIQUETA_BRIGADA[BRIGADA_INFORME];

function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Del 3 nov 2026 al 18 nov 2026", o "Todas las actividades" si no hay periodo. */
function periodo(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  if (desde) return `Desde el ${fechaCorta(desde)}`;
  if (hasta) return `Hasta el ${fechaCorta(hasta)}`;
  return "Todas las actividades";
}

/**
 * Reporte de la Brigada informe. Solo cuenta lo capturado en actividades de ese tipo, que van
 * por aparte del resto. Mismas categorías y mismos cortes que el reporte del día, sobre un
 * periodo que se mide con la fecha de cada actividad.
 */
export default function ReporteDelInforme() {
  const { actuante } = useActuante();
  const hoy = fechaLocalIso();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null);

  // Igual que en el reporte del día: la librería del PDF se trae desde ya para que el menú de
  // compartir del teléfono abra sin esperar a la red.
  useEffect(() => {
    void cargarPdf().catch(() => undefined);
  }, []);

  const reporte = useConsulta<ReporteInforme>(
    () => reporteInforme(actuante, desde || null, hasta || null),
    reporteInformeVacio(desde || null, hasta || null),
    [actuante.id, desde, hasta],
  );
  const r = reporte.datos;
  const cargando = reporte.cargando;
  const t = r.total;
  const realizadas = r.actividades.filter((a) => a.estatus === "realizada").length;
  const sinNada = !cargando && t.alcanzadas === 0 && r.actividades.length === 0;
  const textoPeriodo = periodo(r.desde, r.hasta);

  async function abrirPdf() {
    setAvisoPdf(null);
    try {
      const blob = pdfReporteDiario(
        await cargarPdf(),
        { ...r, fecha: "", promovidasEseDia: 0, seguimientos: 0 },
        {
          titulo: `Reporte ${NOMBRE}`,
          subtitulo: `${textoPeriodo} · Oaxaca de Juárez`,
          apoyoActividades: `${formato(realizadas)} ${realizadas === 1 ? "realizada" : "realizadas"}`,
          apoyoUrgentes: `${pct(t.urgentes, t.alcanzadas)} de las alcanzadas`,
        },
      );
      await compartirPdf(blob, `${nombreArchivo(r)}.pdf`, `Reporte ${NOMBRE}`);
    } catch {
      setAvisoPdf("No se pudo armar el PDF. Revisa la conexión y vuelve a intentar.");
    }
  }

  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo={`Reporte ${NOMBRE}`} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo={`Reporte ${NOMBRE}`}
        apoyo={textoPeriodo}
        volver={{ href: "/informe", etiqueta: NOMBRE }}
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-tinta-suave">Desde</span>
          <input
            type="date"
            value={desde}
            max={hasta || hoy}
            onChange={(e) => setDesde(e.target.value)}
            className="campo cifras w-auto"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-tinta-suave">Hasta</span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className="campo cifras w-auto"
          />
        </label>
        {(desde || hasta) && (
          <button
            type="button"
            className="boton"
            onClick={() => {
              setDesde("");
              setHasta("");
            }}
          >
            Todo
          </button>
        )}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <button
            type="button"
            className="boton-primario flex-1 sm:flex-none"
            disabled={cargando || !!reporte.aviso}
            onClick={() => void abrirPdf()}
          >
            <FileText className="size-4" aria-hidden />
            Compartir PDF
          </button>
          <button
            type="button"
            className="boton"
            disabled={cargando || sinNada}
            onClick={() => descargarXlsx(nombreArchivo(r), hojasDelReporte(r))}
          >
            <Download className="size-4" aria-hidden />
            Excel
          </button>
        </div>
      </div>

      {reporte.aviso && <p className="text-sm text-alerta">{reporte.aviso}</p>}
      {avisoPdf && <p className="text-sm text-alerta">{avisoPdf}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra
          icono={Users}
          etiqueta="Personas alcanzadas"
          valor={t.alcanzadas}
          apoyo={`${formato(t.nuevas)} nuevas`}
          cargando={cargando}
        />
        <TarjetaCifra
          icono={UserCheck}
          etiqueta="Promovidos"
          valor={t.promovidos}
          apoyo={pct(t.promovidos, t.alcanzadas)}
          cargando={cargando}
        />
        <TarjetaCifra
          icono={Megaphone}
          etiqueta="Actividades"
          valor={r.actividades.length}
          apoyo={`${formato(realizadas)} ${realizadas === 1 ? "realizada" : "realizadas"}`}
          pie={`${formato(r.secciones.length)} ${r.secciones.length === 1 ? "sección" : "secciones"} con gente alcanzada`}
          cargando={cargando}
        />
        <TarjetaCifra
          icono={TriangleAlert}
          etiqueta="Urgente contactar"
          valor={t.urgentes}
          apoyo={pct(t.urgentes, t.alcanzadas)}
          cargando={cargando}
        />
      </div>

      {sinNada ? (
        <Caja icono={Megaphone} titulo="Sin movimiento">
          <p className="text-sm text-tinta-suave">
            No hay actividades de la {NOMBRE} en este periodo, o no te toca verlas. Se abren
            desde{" "}
            <Link href={"/informe" as never} className="text-tinta underline underline-offset-4">
              {NOMBRE}
            </Link>
            .
          </p>
        </Caja>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Caja icono={ListChecks} titulo="Categorías de las personas alcanzadas">
              {cargando ? (
                <div className="esqueleto h-48 rounded-control" />
              ) : (
                <BarrasProporcion
                  descripcion="Personas alcanzadas por categoría"
                  maximo={t.alcanzadas}
                  filas={COLUMNAS_CATEGORIAS.filter((c) => c.llave !== "alcanzadas").map((c) => ({
                    clave: c.llave,
                    etiqueta: c.titulo,
                    valor: t[c.llave],
                    texto: `${formato(t[c.llave])} · ${pct(t[c.llave], t.alcanzadas)}`,
                    resaltar: c.llave === "promovidos",
                  }))}
                />
              )}
            </Caja>

            <Caja icono={MessageSquareText} titulo="Lo que pidió la gente">
              {cargando ? (
                <div className="esqueleto h-48 rounded-control" />
              ) : r.problematicas.length === 0 ? (
                <p className="text-sm text-tinta-suave">No se anotaron problemáticas.</p>
              ) : (
                <BarrasProporcion
                  descripcion="Menciones por problemática"
                  filas={r.problematicas.slice(0, 8).map((p, i) => ({
                    clave: p.problematica,
                    etiqueta: p.problematica,
                    valor: p.menciones,
                    resaltar: i === 0,
                  }))}
                />
              )}
            </Caja>
          </div>

          <Caja icono={Footprints} titulo={`Actividades de la ${NOMBRE}`}>
            {r.actividades.length === 0 ? (
              <p className="text-sm text-tinta-suave">Ninguna actividad en este periodo.</p>
            ) : (
              <TablaDesbordada>
                <table className="tabla min-w-[52rem]">
                  <thead>
                    <tr>
                      <th>Actividad</th>
                      <th>Responsable</th>
                      <th>Secciones</th>
                      <th className="num">Alcanzadas</th>
                      <th className="num">Promov.</th>
                      <th className="num">Info</th>
                      <th className="num">Urgentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.actividades.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link
                            href={`/actividades/${a.id}` as never}
                            className="font-medium text-tinta underline-offset-4 hover:underline"
                          >
                            {a.nombre}
                          </Link>
                          <span className="cifras block text-xs text-tinta-suave">
                            {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]} · {fechaCorta(a.fecha)}
                            {a.hora ? ` · ${a.hora.slice(0, 5)}` : ""} · {ETIQUETA_ESTATUS[a.estatus]}
                          </span>
                        </td>
                        <td className="text-tinta-suave">{a.responsable ?? "—"}</td>
                        <td className="cifras text-tinta-suave">{seccionesDe(a)}</td>
                        <td className="num font-semibold text-tinta">{a.categorias.alcanzadas}</td>
                        <td className="num">{a.categorias.promovidos}</td>
                        <td className="num text-tinta-suave">{a.categorias.quierenInfo}</td>
                        <td className="num text-tinta-suave">{a.categorias.urgentes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablaDesbordada>
            )}
          </Caja>

          <Caja icono={MapPinned} titulo="Por sección">
            <TablaCategorias
              primera="Sección"
              vacio="Sin personas alcanzadas en este periodo."
              filas={r.secciones.map((s) => ({
                llave: s.seccion,
                titulo: s.seccion,
                apoyo: s.demarcacion,
                datos: s,
              }))}
            />
          </Caja>

          <div className="grid gap-4 lg:grid-cols-2">
            <Caja icono={Users} titulo="Quién capturó">
              <TablaCategorias
                primera="Capturista"
                compacta
                vacio="Sin personas alcanzadas en este periodo."
                filas={r.capturistas.map((c) => ({
                  llave: c.nombre,
                  titulo: c.nombre,
                  apoyo: null,
                  datos: c,
                }))}
              />
            </Caja>

            <Caja icono={TriangleAlert} titulo="Urgente contactar">
              {r.urgentes.length === 0 ? (
                <p className="text-sm text-tinta-suave">Nadie marcado como urgente.</p>
              ) : (
                <ul className="-mx-[1.125rem] -mb-[1.125rem]">
                  {r.urgentes.map((u) => (
                    <li key={u.id} className="border-t border-separador">
                      <Link
                        href={`/personas/${u.id}` as never}
                        className="renglon-activo flex flex-col gap-0.5 px-[1.125rem] py-2.5"
                      >
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium text-tinta">{u.nombre}</span>
                          <span className="cifras shrink-0 text-xs text-tinta-suave">
                            {u.seccion ? `Sección ${u.seccion}` : "Sin sección"}
                          </span>
                        </span>
                        {u.motivo && (
                          <span className="line-clamp-2 text-xs text-tinta-suave [overflow-wrap:anywhere]">
                            {u.motivo}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Caja>
          </div>
        </>
      )}
    </div>
  );
}

function nombreArchivo(r: ReporteInforme): string {
  const rango = [r.desde, r.hasta].filter(Boolean).join("-a-");
  return `reporte-brigada-informe${rango ? `-${rango}` : ""}`;
}

/** El reporte en un libro: una hoja por corte, igual que el del día. */
function hojasDelReporte(r: ReporteInforme): Hoja[] {
  const titulos = COLUMNAS_CATEGORIAS.map((c) => ({ titulo: c.titulo }));
  const valores = (c: Categorias) => COLUMNAS_CATEGORIAS.map((col) => c[col.llave]);
  return [
    {
      nombre: "Resumen",
      columnas: [{ titulo: "Dato", ancho: 44 }, { titulo: "Cantidad" }],
      filas: [
        ["Periodo", periodo(r.desde, r.hasta)],
        ...COLUMNAS_CATEGORIAS.map((c) => [`Personas: ${c.titulo.toLowerCase()}`, r.total[c.llave]]),
        ["Actividades", r.actividades.length],
        ["Realizadas", r.actividades.filter((a) => a.estatus === "realizada").length],
        ["Recorridos", r.actividades.filter((a) => a.tipo === "recorrido").length],
        ["Secciones con gente alcanzada", r.secciones.length],
      ],
    },
    {
      nombre: "Actividades",
      columnas: [
        { titulo: "Actividad", ancho: 36 },
        { titulo: "Tipo" },
        { titulo: "Fecha" },
        { titulo: "Hora" },
        { titulo: "Estatus" },
        { titulo: "Responsable", ancho: 24 },
        { titulo: "Sección programada" },
        { titulo: "Secciones alcanzadas", ancho: 30 },
        { titulo: "Asistentes aprox." },
        ...titulos,
      ],
      filas: r.actividades.map((a) => [
        a.nombre,
        ETIQUETA_TIPO_ACTIVIDAD[a.tipo],
        a.fecha,
        a.hora?.slice(0, 5) ?? "",
        ETIQUETA_ESTATUS[a.estatus],
        a.responsable ?? "",
        a.seccion ?? "",
        a.seccionesAlcanzadas.join(", "),
        a.asistentesAprox,
        ...valores(a.categorias),
      ]),
    },
    {
      nombre: "Secciones",
      columnas: [{ titulo: "Sección" }, { titulo: "Demarcación", ancho: 24 }, ...titulos],
      filas: r.secciones.map((s) => [s.seccion, s.demarcacion ?? "", ...valores(s)]),
    },
    {
      nombre: "Capturistas",
      columnas: [{ titulo: "Capturista", ancho: 28 }, ...titulos],
      filas: r.capturistas.map((c) => [c.nombre, ...valores(c)]),
    },
    {
      nombre: "Problemáticas",
      columnas: [{ titulo: "Problemática", ancho: 32 }, { titulo: "Menciones" }],
      filas: r.problematicas.map((p) => [p.problematica, p.menciones]),
    },
    {
      nombre: "Urgentes",
      columnas: [{ titulo: "Nombre", ancho: 32 }, { titulo: "Sección" }, { titulo: "Por qué es urgente", ancho: 60 }],
      filas: r.urgentes.map((u) => [u.nombre, u.seccion ?? "", u.motivo ?? ""]),
    },
  ];
}
