"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PortonAgenda } from "@/components/porton-agenda";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Tarjeta } from "@/components/tablero/tarjeta";
import { useActuante } from "@/components/proveedor-actuante";
import { descargarCsv } from "@/lib/csv";
import { puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import {
  demarcacionesResumen,
  problematicasPorSeccion,
  type DemarcacionResumen,
  type MencionPorSeccion,
} from "@/lib/datos/catalogos";
import { reporteSemanal, type SemanaReporte } from "@/lib/datos/reportes";

export default function Reportes() {
  const { actuante } = useActuante();

  const demarcaciones = useConsulta<DemarcacionResumen[]>(
    () => demarcacionesResumen(actuante),
    [],
    [actuante.id],
  );
  const semanal = useConsulta<SemanaReporte[]>(
    () => reporteSemanal(actuante),
    [],
    [actuante.id],
  );
  const menciones = useConsulta<MencionPorSeccion[]>(
    () => problematicasPorSeccion(actuante),
    [],
    [actuante.id],
  );

  const porProblematica = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const m of menciones.datos) {
      conteo.set(m.problematica, (conteo.get(m.problematica) ?? 0) + m.menciones);
    }
    return [...conteo.entries()]
      .map(([problematica, total]) => ({ problematica, total }))
      .sort((a, b) => b.total - a.total);
  }, [menciones.datos]);

  const conDatos = demarcaciones.datos.filter((d) => d.personas > 0);

  // Mismo portón que Actividades y Personas. Los reportes se calculan en vivo sobre lo que el
  // usuario alcanza: para el brigadista serían tres gráficas en cero y un botón de exportar un
  // CSV vacío.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Reportes" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Reportes" apoyo="Calculados en vivo sobre lo capturado." />

      {/* Semanal y menciones lado a lado en escritorio; los dos de demarcación a todo el ancho.
          El min-w-0 deja que las gráficas se encojan dentro de la rejilla. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <Tarjeta
            titulo="Semanal: personas nuevas y actividades realizadas"
            accion={
              <BotonCsv
                nombre="reporte-semanal"
                columnas={[
                  { llave: "inicio", etiqueta: "Semana del" },
                  { llave: "personas", etiqueta: "Personas nuevas" },
                  { llave: "actividades", etiqueta: "Actividades realizadas" },
                ]}
                filas={semanal.datos}
              />
            }
          >
            {semanal.cargando ? (
              <div className="h-64 esqueleto rounded-control" />
            ) : (
              <GraficaSemanal datos={semanal.datos} />
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0">
          <Tarjeta
            titulo="Menciones por problemática"
            accion={
              <BotonCsv
                nombre="menciones-por-problematica"
                columnas={[
                  { llave: "problematica", etiqueta: "Problemática" },
                  { llave: "total", etiqueta: "Menciones" },
                ]}
                filas={porProblematica}
              />
            }
          >
            {menciones.cargando ? (
              <div className="h-64 esqueleto rounded-control" />
            ) : (
              <Grafica
                datos={porProblematica.map((p) => ({ nombre: p.problematica, valor: p.total }))}
              />
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Tarjeta
            titulo="Personas alcanzadas por demarcación"
            accion={
              <BotonCsv
                nombre="personas-por-demarcacion"
                columnas={[
                  { llave: "demarcacion", etiqueta: "Demarcación" },
                  { llave: "personas", etiqueta: "Personas alcanzadas" },
                  { llave: "quieren_participar", etiqueta: "Quieren participar" },
                  { llave: "quieren_info", etiqueta: "Quieren información" },
                  { llave: "secciones", etiqueta: "Secciones" },
                  { llave: "secciones_sin_responsable", etiqueta: "Sin responsable" },
                ]}
                filas={demarcaciones.datos}
              />
            }
          >
            {demarcaciones.cargando ? (
              <div className="h-64 esqueleto rounded-control" />
            ) : (
              <Grafica
                datos={conDatos.map((d) => ({ nombre: d.demarcacion, valor: d.personas }))}
              />
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Tarjeta
            titulo="Resumen por demarcación"
            accion={
              <BotonCsv
                nombre="resumen-por-demarcacion"
                columnas={[
                  { llave: "demarcacion", etiqueta: "Demarcación" },
                  { llave: "personas", etiqueta: "Personas alcanzadas" },
                  { llave: "reuniones", etiqueta: "Reuniones" },
                  { llave: "activismo", etiqueta: "Activismo" },
                  { llave: "recorridos", etiqueta: "Recorridos" },
                ]}
                filas={demarcaciones.datos}
              />
            }
          >
            {/* La tabla llega a los bordes de la tarjeta: se come el relleno del cuerpo y alinea
                su primera y última columna con el título. */}
            <div className="-mx-[1.125rem] -mb-[1.125rem] overflow-x-auto">
              <table className="tabla min-w-[34rem] [&_td:first-child]:pl-[1.125rem] [&_td:last-child]:pr-[1.125rem] [&_th:first-child]:pl-[1.125rem] [&_th:last-child]:pr-[1.125rem]">
                <thead>
                  <tr>
                    <th>Demarcación</th>
                    <th className="num">Personas alcanzadas</th>
                    <th className="num">Participan</th>
                    <th className="num">Reuniones</th>
                    <th className="num">Activismo</th>
                    <th className="num">Recorridos</th>
                  </tr>
                </thead>
                <tbody>
                  {demarcaciones.datos.map((d) => (
                    <tr key={d.demarcacion_id}>
                      <td className="text-tinta">{d.demarcacion}</td>
                      <td className="num">{d.personas}</td>
                      <td className="num text-tinta-suave">{d.quieren_participar}</td>
                      <td className="num text-tinta-suave">{d.reuniones}</td>
                      <td className="num text-tinta-suave">{d.activismo}</td>
                      <td className="num text-tinta-suave">{d.recorridos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

/**
 * Semanal: la serie naranja es la que importa (personas nuevas) y la otra va en neutro.
 * Se traza una sola vez al montar, con el escalonado de sesenta milisegundos entre barras.
 */
function GraficaSemanal({ datos }: { datos: SemanaReporte[] }) {
  return (
    <div className="entrada h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid stroke="var(--borde)" vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tick={{ fill: "var(--tinta-suave)", fontSize: 11 }}
            stroke="var(--borde)"
          />
          <YAxis
            tick={{ fill: "var(--tinta-tenue)", fontSize: 11 }}
            stroke="var(--borde)"
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--superficie-hundida)" }}
            contentStyle={{
              background: "var(--superficie)",
              border: "1px solid var(--borde)",
              borderRadius: "var(--radio-control)",
              color: "var(--tinta)",
              fontSize: 13,
            }}
          />
          <Bar
            dataKey="personas"
            name="Personas nuevas"
            fill="var(--naranja)"
            radius={[4, 4, 0, 0]}
            animationDuration={700}
            animationBegin={0}
          />
          <Bar
            dataKey="actividades"
            name="Actividades realizadas"
            fill="var(--tinta-tenue)"
            radius={[4, 4, 0, 0]}
            animationDuration={700}
            animationBegin={60}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Una sola serie naranja y todo lo demás en neutros. */
function Grafica({ datos }: { datos: { nombre: string; valor: number }[] }) {
  return (
    <div className="entrada h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 60, left: 0 }}>
          <CartesianGrid stroke="var(--borde)" vertical={false} />
          <XAxis
            dataKey="nombre"
            angle={-35}
            textAnchor="end"
            interval={0}
            tick={{ fill: "var(--tinta-suave)", fontSize: 11 }}
            stroke="var(--borde)"
          />
          <YAxis
            tick={{ fill: "var(--tinta-tenue)", fontSize: 11 }}
            stroke="var(--borde)"
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--superficie-hundida)" }}
            contentStyle={{
              background: "var(--superficie)",
              border: "1px solid var(--borde)",
              borderRadius: "var(--radio-control)",
              color: "var(--tinta)",
              fontSize: 13,
            }}
          />
          <Bar
            dataKey="valor"
            radius={[4, 4, 0, 0]}
            animationDuration={700}
            animationBegin={60}
          >
            {datos.map((d, i) => (
              <Cell key={d.nombre} fill={i === 0 ? "var(--naranja)" : "var(--tinta-tenue)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BotonCsv({
  nombre,
  columnas,
  filas,
}: {
  nombre: string;
  columnas: { llave: string; etiqueta: string }[];
  filas: Record<string, unknown>[];
}) {
  return (
    <button
      type="button"
      onClick={() => descargarCsv(nombre, columnas, filas)}
      className="boton shrink-0"
    >
      <Download className="size-4" aria-hidden />
      CSV
    </button>
  );
}
