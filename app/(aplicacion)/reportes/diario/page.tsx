"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Footprints,
  ListChecks,
  MapPinned,
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
import { puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import { fechaLocalIso } from "@/lib/utils";
import { descargarXlsx, type Hoja } from "@/lib/xlsx";
import { cargarPdf, compartirPdf, nombreArchivoPdf, pdfReporteDiario } from "@/lib/pdf-reporte-diario";
import {
  reporteDiario,
  reporteVacio,
  type Categorias,
  type ReporteDiario,
} from "@/lib/datos/reporte-diario";

/** 'AAAA-MM-DD' movida `dias` días. */
function moverFecha(fecha: string, dias: number): string {
  const f = new Date(`${fecha}T00:00:00`);
  f.setDate(f.getDate() + dias);
  return fechaLocalIso(f);
}

function fechaLarga(fecha: string): string {
  const texto = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const formato = (n: number) => n.toLocaleString("es-MX");

/** Porcentaje entero de las alcanzadas, para escribirlo junto a cada categoría. */
function pct(n: number, de: number): string {
  return de > 0 ? `${Math.round((n / de) * 100)}%` : "—";
}

/** Las columnas de categorías que comparten las tablas y el Excel, en el mismo orden. */
const COLUMNAS_CATEGORIAS: { llave: keyof Categorias; titulo: string; corto: string }[] = [
  { llave: "alcanzadas", titulo: "Alcanzadas", corto: "Alcanzadas" },
  { llave: "nuevas", titulo: "Nuevas", corto: "Nuevas" },
  { llave: "promovidos", titulo: "Promovidos", corto: "Promov." },
  { llave: "quierenInfo", titulo: "Quieren información", corto: "Info" },
  { llave: "quierenParticipar", titulo: "Quieren participar", corto: "Particip." },
  { llave: "representantes", titulo: "Quieren ser representante", corto: "Repres." },
  { llave: "bardaLona", titulo: "Barda o lona", corto: "Barda" },
  { llave: "urgentes", titulo: "Urgente contactar", corto: "Urgentes" },
];

export default function ReporteDelDia() {
  const { actuante } = useActuante();
  const hoy = fechaLocalIso();
  const [fecha, setFecha] = useState(hoy);
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null);

  // La librería del PDF se trae desde ya: al tocar el botón el archivo tiene que salir sin
  // esperar a la red, o el teléfono ya no deja abrir el menú de compartir.
  useEffect(() => {
    void cargarPdf().catch(() => undefined);
  }, []);

  const reporte = useConsulta<ReporteDiario>(
    () => reporteDiario(actuante, fecha),
    reporteVacio(fecha),
    [actuante.id, fecha],
  );
  const r = reporte.datos;
  const cargando = reporte.cargando;
  const t = r.total;
  const recorridos = r.actividades.filter((a) => a.tipo === "recorrido").length;
  const sinNada = !cargando && t.alcanzadas === 0 && r.actividades.length === 0;

  async function abrirPdf() {
    setAvisoPdf(null);
    try {
      const blob = pdfReporteDiario(await cargarPdf(), r);
      await compartirPdf(blob, nombreArchivoPdf(fecha), `Reporte del día ${fecha}`);
    } catch {
      setAvisoPdf("No se pudo armar el PDF. Revisa la conexión y vuelve a intentar.");
    }
  }

  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Reporte del día" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Reporte del día"
        apoyo={fechaLarga(fecha)}
        volver={{ href: "/reportes", etiqueta: "Reportes" }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="boton px-3"
          onClick={() => setFecha((f) => moverFecha(f, -1))}
          aria-label="Día anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
          aria-label="Fecha del reporte"
          className="campo cifras w-auto"
        />
        <button
          type="button"
          className="boton px-3"
          onClick={() => setFecha((f) => moverFecha(f, 1))}
          disabled={fecha >= hoy}
          aria-label="Día siguiente"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        {fecha !== hoy && (
          <button type="button" className="boton" onClick={() => setFecha(hoy)}>
            Hoy
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
            onClick={() => descargarXlsx(`reporte-del-dia-${fecha}`, hojasDelReporte(r))}
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
          pie={`${formato(r.promovidasEseDia)} marcadas como promovidas este día`}
          cargando={cargando}
        />
        <TarjetaCifra
          icono={Footprints}
          etiqueta="Actividades"
          valor={r.actividades.length}
          apoyo={`${formato(recorridos)} ${recorridos === 1 ? "recorrido" : "recorridos"}`}
          pie={`${formato(r.secciones.length)} ${r.secciones.length === 1 ? "sección" : "secciones"} con gente alcanzada`}
          cargando={cargando}
        />
        <TarjetaCifra
          icono={TriangleAlert}
          etiqueta="Urgente contactar"
          valor={t.urgentes}
          pie={`${formato(r.seguimientos)} seguimientos anotados este día`}
          cargando={cargando}
        />
      </div>

      {sinNada ? (
        <Caja icono={CalendarDays} titulo="Sin movimiento">
          <p className="text-sm text-tinta-suave">
            Este día no hay actividades ni personas alcanzadas en lo que te toca ver.
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
                <p className="text-sm text-tinta-suave">No se anotaron problemáticas este día.</p>
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

          <Caja icono={Footprints} titulo="Recorridos y actividades">
            {r.actividades.length === 0 ? (
              <p className="text-sm text-tinta-suave">
                Ninguna actividad programada ni con capturas este día.
              </p>
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
                          <span className="block text-xs text-tinta-suave">
                            {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
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
                <p className="text-sm text-tinta-suave">Nadie marcado como urgente este día.</p>
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

function seccionesDe(a: ReporteDiario["actividades"][number]): string {
  if (a.seccionesAlcanzadas.length > 0) {
    const primeras = a.seccionesAlcanzadas.slice(0, 4).join(", ");
    const resto = a.seccionesAlcanzadas.length - 4;
    return resto > 0 ? `${primeras} y ${resto} más` : primeras;
  }
  return a.seccion ?? "—";
}

/** La tabla llega a los bordes de la caja y se desliza de lado en el teléfono. */
function TablaDesbordada({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-[1.125rem] -mb-[1.125rem] overflow-x-auto [&_td:first-child]:pl-[1.125rem] [&_td:last-child]:pr-[1.125rem] [&_th:first-child]:pl-[1.125rem] [&_th:last-child]:pr-[1.125rem]">
      {children}
    </div>
  );
}

function TablaCategorias({
  primera,
  filas,
  compacta = false,
}: {
  primera: string;
  filas: { llave: string; titulo: string; apoyo: string | null; datos: Categorias }[];
  /** Solo alcanzadas, promovidos, info y urgentes: para la columna angosta. */
  compacta?: boolean;
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-tinta-suave">Sin personas alcanzadas este día.</p>;
  }
  const columnas = compacta
    ? COLUMNAS_CATEGORIAS.filter((c) =>
        ["alcanzadas", "promovidos", "quierenInfo", "urgentes"].includes(c.llave),
      )
    : COLUMNAS_CATEGORIAS;
  return (
    <TablaDesbordada>
      <table className={compacta ? "tabla min-w-[24rem]" : "tabla min-w-[46rem]"}>
        <thead>
          <tr>
            <th>{primera}</th>
            {columnas.map((c) => (
              <th key={c.llave} className="num" title={c.titulo}>
                {c.corto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.llave}>
              <td>
                <span className="cifras text-tinta">{f.titulo}</span>
                {f.apoyo && <span className="block text-xs text-tinta-suave">{f.apoyo}</span>}
              </td>
              {columnas.map((c) => (
                <td
                  key={c.llave}
                  className={
                    c.llave === "alcanzadas" ? "num font-semibold text-tinta" : "num text-tinta-suave"
                  }
                >
                  {f.datos[c.llave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDesbordada>
  );
}

/** El mismo reporte en un libro: una hoja por corte. */
function hojasDelReporte(r: ReporteDiario): Hoja[] {
  const titulos = COLUMNAS_CATEGORIAS.map((c) => ({ titulo: c.titulo }));
  const valores = (c: Categorias) => COLUMNAS_CATEGORIAS.map((col) => c[col.llave]);
  return [
    {
      nombre: "Resumen",
      columnas: [{ titulo: "Dato", ancho: 44 }, { titulo: "Cantidad" }],
      filas: [
        ["Fecha", fechaLarga(r.fecha)],
        ...COLUMNAS_CATEGORIAS.map((c) => [`Personas: ${c.titulo.toLowerCase()}`, r.total[c.llave]]),
        ["Marcadas como promovidas este día", r.promovidasEseDia],
        ["Actividades", r.actividades.length],
        ["Recorridos", r.actividades.filter((a) => a.tipo === "recorrido").length],
        ["Secciones con gente alcanzada", r.secciones.length],
        ["Seguimientos anotados", r.seguimientos],
      ],
    },
    {
      nombre: "Actividades",
      columnas: [
        { titulo: "Tipo" },
        { titulo: "Actividad", ancho: 36 },
        { titulo: "Hora" },
        { titulo: "Estatus" },
        { titulo: "Responsable", ancho: 24 },
        { titulo: "Sección programada" },
        { titulo: "Secciones alcanzadas", ancho: 30 },
        { titulo: "Asistentes aprox." },
        ...titulos,
      ],
      filas: r.actividades.map((a) => [
        ETIQUETA_TIPO_ACTIVIDAD[a.tipo],
        a.nombre,
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
