"use client";

import {
  ClipboardList,
  HeartHandshake,
  Inbox,
  MessageSquareText,
  Route,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { BarrasProporcion, Columnas, TarjetaIndicador } from "@/components/tablero/micrograficas";
import { esAdmin } from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import type { ResumenTablero } from "@/lib/datos/tablero";
import {
  actividadEquipo,
  avanceCasillas,
  avancePrioritarias,
  capturaPorDia,
  esperaBandeja,
  problematicasPrincipales,
  type ActividadEquipo,
  type AvanceCasillasTablero,
  type AvancePrioritarias,
  type DiaCaptura,
  type EsperaBandeja,
} from "@/lib/datos/indicadores";
import { cn } from "@/lib/utils";

const DIAS = 14;

const formato = (n: number) => n.toLocaleString("es-MX");

/** Porcentaje entero de `parte` sobre `total`; cero si no hay total. */
function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function diaLargo(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * "Cómo vamos": lo que el administrador necesita para saber si el trabajo avanza y dónde
 * atorarse a revisar. Todo sale de lo que ya se captura; nada de metas inventadas: la meta de
 * votos todavía no está cargada, así que no se dibuja contra ella.
 *
 * Las cifras de compromiso vienen del resumen que ya pidió el tablero, para no contar dos veces
 * lo mismo. El resto pide lo suyo, y RLS recorta todo al territorio de quien mira.
 */
export function ComoVamos({
  resumen,
  cargandoResumen,
}: {
  resumen: ResumenTablero;
  cargandoResumen: boolean;
}) {
  const { actuante } = useActuante();
  const admin = esAdmin(actuante);

  const captura = useConsulta<DiaCaptura[]>(() => capturaPorDia(actuante, DIAS), [], [actuante.id]);
  const espera = useConsulta<EsperaBandeja>(
    () => esperaBandeja(actuante),
    { tramos: [], urgentes: 0, sinAtender: 0 },
    [actuante.id],
  );
  const prioritarias = useConsulta<AvancePrioritarias>(
    () => avancePrioritarias(actuante),
    { a: 0, aRecorridas: 0, b: 0, bRecorridas: 0 },
    [actuante.id],
  );
  const casillas = useConsulta<AvanceCasillasTablero>(
    () => avanceCasillas(actuante),
    { casillas: 0, titulares: 0, suplentes: 0 },
    [actuante.id],
  );
  const piden = useConsulta(
    () => problematicasPrincipales(actuante),
    { principales: [], total: 0 },
    [actuante.id],
  );
  const equipo = useConsulta<ActividadEquipo>(
    () => actividadEquipo(actuante),
    { activos: [], sinCapturar: 0 },
    [actuante.id],
  );

  const ritmo = useMemo(() => {
    const dias = captura.datos;
    const semana = dias.slice(-7).reduce((s, d) => s + d.personas, 0);
    const anterior = dias.slice(0, -7).reduce((s, d) => s + d.personas, 0);
    const columnas = dias.map((d, i) => ({
      clave: d.fecha,
      etiqueta: i === dias.length - 1 ? "Hoy" : diaLargo(d.fecha),
      valor: d.personas,
      resaltar: i === dias.length - 1,
    }));
    return { semana, anterior, columnas };
  }, [captura.datos]);

  const personas = resumen.personas ?? 0;
  const enBandeja = espera.datos.tramos.reduce((s, t) => s + t.personas, 0);
  const lugaresCasilla = casillas.datos.casillas * 2;
  const principal = piden.datos.principales[0];

  return (
    <section aria-labelledby="titulo-como-vamos" className="mt-10">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="titulo-como-vamos" className="text-lg font-semibold text-tinta">
          Cómo vamos
        </h2>
        <p className="text-[0.8125rem] text-tinta-suave">
          Calculado en vivo sobre lo capturado · {admin ? "todo el municipio" : "tu territorio"}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* La que manda: el ritmo. Doble de ancho en escritorio porque catorce columnas en un
            tercio de pantalla ya no se distinguen. */}
        <TarjetaIndicador
          icono={TrendingUp}
          titulo="Ritmo de captura"
          cifra={ritmo.semana}
          unidad="personas en los últimos 7 días"
          apoyo={
            ritmo.anterior === 0 && ritmo.semana === 0
              ? "Todavía no hay capturas en estas dos semanas"
              : `${ritmo.semana - ritmo.anterior >= 0 ? "+" : "−"}${formato(Math.abs(ritmo.semana - ritmo.anterior))} contra los 7 días anteriores (${formato(ritmo.anterior)})`
          }
          href="/personas"
          cargando={captura.cargando}
          className="md:col-span-2"
        >
          <Columnas
            datos={ritmo.columnas}
            descripcion={`Personas nuevas por día, últimos ${DIAS} días`}
            unidad="personas"
            etiquetas="extremos"
            alto="h-28"
          />
        </TarjetaIndicador>

        <TarjetaIndicador
          icono={HeartHandshake}
          titulo="Compromiso"
          cifra={`${porcentaje(resumen.promovidos ?? 0, personas)} %`}
          unidad="ya promovidos"
          apoyo={`De ${formato(personas)} personas alcanzadas`}
          href="/personas"
          cargando={cargandoResumen}
        >
          <BarrasProporcion
            descripcion="Personas alcanzadas según su interés"
            maximo={personas}
            filas={[
              {
                clave: "info",
                etiqueta: "Quieren información",
                valor: resumen.quierenInfo ?? 0,
              },
              {
                clave: "participar",
                etiqueta: "Quieren participar",
                valor: resumen.quierenParticipar ?? 0,
              },
              {
                clave: "promovidos",
                etiqueta: "Promovidos",
                valor: resumen.promovidos ?? 0,
                resaltar: true,
              },
              {
                clave: "representantes",
                etiqueta: "Quieren ser representantes",
                valor: resumen.aspirantesRepresentante ?? 0,
              },
            ].map((f) => ({
              ...f,
              texto: `${formato(f.valor)} · ${porcentaje(f.valor, personas)} %`,
            }))}
          />
        </TarjetaIndicador>

        {/* Lo que se atora. El tramo más viejo es el naranja: es el que hay que ir a resolver. */}
        <TarjetaIndicador
          icono={Inbox}
          titulo="Seguimiento pendiente"
          cifra={enBandeja}
          unidad="personas esperando"
          apoyo={
            <>
              {espera.datos.urgentes > 0 && (
                <span className="mr-2 inline-flex items-center gap-1 font-semibold text-alerta">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {formato(espera.datos.urgentes)} urgentes
                </span>
              )}
              {formato(espera.datos.sinAtender)} nunca atendidas
            </>
          }
          href="/seguimiento"
          cargando={espera.cargando}
        >
          <Columnas
            datos={espera.datos.tramos.map((t) => ({
              clave: t.etiqueta,
              etiqueta: t.etiqueta,
              valor: t.personas,
              resaltar: t.hasta === null,
            }))}
            descripcion="Personas en la bandeja de seguimiento según cuántos días llevan esperando"
            unidad="personas"
            valores
          />
        </TarjetaIndicador>

        <TarjetaIndicador
          icono={MessageSquareText}
          titulo="Lo que más piden"
          cifra={piden.datos.total}
          unidad="menciones"
          apoyo={
            principal
              ? `${principal.problematica}: ${porcentaje(principal.menciones, piden.datos.total)} % de todo lo mencionado`
              : "Todavía no hay problemáticas mencionadas"
          }
          href="/reportes"
          cargando={piden.cargando}
        >
          <BarrasProporcion
            descripcion="Las cinco problemáticas más mencionadas"
            filas={piden.datos.principales.map((p, i) => ({
              clave: p.problematica,
              etiqueta: p.problematica,
              valor: p.menciones,
              resaltar: i === 0,
            }))}
          />
        </TarjetaIndicador>

        {admin && (
          <TarjetaIndicador
            icono={Users}
            titulo="Equipo esta semana"
            cifra={equipo.datos.activos.length}
            unidad="capturaron en 7 días"
            apoyo={
              equipo.datos.sinCapturar > 0
                ? `${formato(equipo.datos.sinCapturar)} cuentas de campo sin capturar`
                : "Todo el equipo de campo capturó"
            }
            href="/usuarios"
            cargando={equipo.cargando}
          >
            {equipo.datos.activos.length === 0 ? (
              <p className="text-[0.8125rem] text-tinta-suave">Nadie ha capturado esta semana.</p>
            ) : (
              <BarrasProporcion
                descripcion="Personas capturadas por cada integrante del equipo en los últimos 7 días"
                filas={equipo.datos.activos.slice(0, 5).map((u, i) => ({
                  clave: `${u.nombre}-${i}`,
                  etiqueta: u.nombre,
                  valor: u.personas,
                  resaltar: i === 0,
                }))}
              />
            )}
          </TarjetaIndicador>
        )}

        <TarjetaIndicador
          icono={Route}
          titulo="Secciones prioritarias"
          cifra={prioritarias.datos.aRecorridas}
          unidad={`de ${formato(prioritarias.datos.a)} de prioridad A recorridas`}
          apoyo="Recorrida: con al menos un recorrido realizado"
          href="/territorio"
          cargando={prioritarias.cargando}
        >
          <BarrasProporcion
            descripcion="Secciones prioritarias recorridas, por prioridad"
            filas={[
              {
                clave: "a",
                etiqueta: "Prioridad A",
                valor: prioritarias.datos.aRecorridas,
                total: prioritarias.datos.a,
                texto: `${formato(prioritarias.datos.aRecorridas)} de ${formato(prioritarias.datos.a)}`,
                resaltar: true,
              },
              {
                clave: "b",
                etiqueta: "Prioridad B",
                valor: prioritarias.datos.bRecorridas,
                total: prioritarias.datos.b,
                texto: `${formato(prioritarias.datos.bRecorridas)} de ${formato(prioritarias.datos.b)}`,
              },
            ]}
          />
        </TarjetaIndicador>

        {/* Sin la tarjeta del equipo queda un hueco en la última fila; esta lo ocupa. */}
        <TarjetaIndicador
          icono={ClipboardList}
          titulo="Casillas para el día de la elección"
          cifra={casillas.datos.titulares}
          unidad={`de ${formato(casillas.datos.casillas)} con titular`}
          apoyo={`${formato(resumen.aspirantesRepresentante ?? 0)} personas quieren ser representantes`}
          href="/casillas"
          cargando={casillas.cargando || cargandoResumen}
          className={cn(!admin && "lg:col-span-2")}
        >
          <BarrasProporcion
            descripcion="Representantes de casilla cubiertos y aspirantes disponibles"
            filas={[
              {
                clave: "titulares",
                etiqueta: "Titulares",
                valor: casillas.datos.titulares,
                total: casillas.datos.casillas,
                texto: `${formato(casillas.datos.titulares)} de ${formato(casillas.datos.casillas)}`,
                resaltar: true,
              },
              {
                clave: "suplentes",
                etiqueta: "Suplentes",
                valor: casillas.datos.suplentes,
                total: casillas.datos.casillas,
                texto: `${formato(casillas.datos.suplentes)} de ${formato(casillas.datos.casillas)}`,
              },
              {
                clave: "aspirantes",
                etiqueta: "Aspirantes para los lugares",
                valor: resumen.aspirantesRepresentante ?? 0,
                total: lugaresCasilla,
                texto: `${formato(resumen.aspirantesRepresentante ?? 0)} de ${formato(lugaresCasilla)}`,
              },
            ]}
          />
        </TarjetaIndicador>
      </div>
    </section>
  );
}
