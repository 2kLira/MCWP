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
import { Tarjeta } from "@/components/tablero/tarjeta";
import { useActuante } from "@/components/proveedor-actuante";
import { descargarCsv } from "@/lib/csv";
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

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl">Reportes</h1>
        <p className="text-sm text-tinta-suave">Calculados en vivo sobre lo capturado.</p>
      </header>

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
          <div className="h-64 animate-pulse rounded-control bg-superficie-hundida" />
        ) : (
          <GraficaSemanal datos={semanal.datos} />
        )}
      </Tarjeta>

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
          <div className="h-64 animate-pulse rounded-control bg-superficie-hundida" />
        ) : (
          <Grafica
            datos={conDatos.map((d) => ({ nombre: d.demarcacion, valor: d.personas }))}
          />
        )}
      </Tarjeta>

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
          <div className="h-64 animate-pulse rounded-control bg-superficie-hundida" />
        ) : (
          <Grafica datos={porProblematica.map((p) => ({ nombre: p.problematica, valor: p.total }))} />
        )}
      </Tarjeta>

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="py-2 font-medium">Demarcación</th>
                <th className="py-2 font-medium">Personas alcanzadas</th>
                <th className="py-2 font-medium">Participan</th>
                <th className="py-2 font-medium">Reuniones</th>
                <th className="py-2 font-medium">Activismo</th>
                <th className="py-2 font-medium">Recorridos</th>
              </tr>
            </thead>
            <tbody>
              {demarcaciones.datos.map((d) => (
                <tr key={d.demarcacion_id} className="border-t border-borde">
                  <td className="py-2 text-tinta">{d.demarcacion}</td>
                  <td className="py-2">{d.personas}</td>
                  <td className="py-2 text-tinta-suave">{d.quieren_participar}</td>
                  <td className="py-2 text-tinta-suave">{d.reuniones}</td>
                  <td className="py-2 text-tinta-suave">{d.activismo}</td>
                  <td className="py-2 text-tinta-suave">{d.recorridos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
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
      className="transicion-ui inline-flex items-center gap-1.5 rounded-control border border-borde px-2.5 text-xs text-tinta-suave transition-colors hover:text-tinta"
      style={{ minHeight: 36 }}
    >
      <Download className="size-3.5" aria-hidden />
      CSV
    </button>
  );
}
