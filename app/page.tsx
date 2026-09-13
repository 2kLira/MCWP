"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { useId, useMemo } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { estatusVisibles, etiquetaAlcance } from "@/lib/permisos";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  resumenTablero,
  cumpleanosDeHoy,
  type ResumenTablero,
  type CumpleanosHoy,
} from "@/lib/datos/tablero";
import { reporteSemanal, type SemanaReporte } from "@/lib/datos/reportes";
import { actividadesDeAgenda, type Actividad } from "@/lib/datos/actividades";

const MapaPagina = dynamic(
  () => import("@/components/mapa/mapa-pagina").then((m) => m.MapaPagina),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-superficie-hundida" />,
  },
);

const RESUMEN_VACIO = {} as ResumenTablero;
const formatoCifra = new Intl.NumberFormat("es-MX");

function enDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return f.toISOString().slice(0, 10);
}

function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
  });
}

export default function Tablero() {
  const { actuante } = useActuante();
  const territorio = etiquetaAlcance(
    actuante,
    demarcacionPorId(actuante.demarcacionId)?.nombre,
  );

  const resumen = useConsulta(() => resumenTablero(actuante), RESUMEN_VACIO, [actuante.id]);
  const semanal = useConsulta<SemanaReporte[]>(() => reporteSemanal(actuante, 10), [], [
    actuante.id,
  ]);
  const agenda = useConsulta<Actividad[]>(
    // Con el recorte de estatus: un responsable o un brigadista no deben ver aquí actividades
    // realizadas que la agenda ya no les muestra, o los dos bloques dirían cosas distintas.
    () => actividadesDeAgenda(actuante, enDias(0), enDias(7), estatusVisibles(actuante)),
    [],
    [actuante.id],
  );
  // Ya viene recortado por territorio desde lib/datos/tablero.ts; aquí solo se pinta.
  const cumpleanos = useConsulta<CumpleanosHoy[]>(
    () => cumpleanosDeHoy(actuante),
    [],
    [actuante.id],
  );

  const { hoy, semana } = useMemo(() => {
    const dia = enDias(0);
    return {
      hoy: agenda.datos.filter((a) => a.fecha === dia),
      semana: agenda.datos.filter((a) => a.fecha > dia),
    };
  }, [agenda.datos]);

  const r = resumen.datos;
  const cargando = resumen.cargando;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="pt-1">
        <h1 className="text-xl text-tinta">Resumen territorial</h1>
        <p className="mt-1 text-sm text-tinta-suave">Oaxaca de Juárez · {territorio}</p>
      </header>

      <Resumen resumen={r} cargando={cargando} semanal={semanal.datos} />

      {/* El mapa es el protagonista, pero alineado al mismo eje que todo lo demás. */}
      <section aria-label="Mapa de secciones" className="panel overflow-hidden">
        <div className="h-[25rem] sm:h-[30rem] lg:h-[36rem]">
          <MapaPagina conBarra={false} />
        </div>
      </section>

      {/* Tres columnas separadas por filetes, no tres tarjetas. */}
      <section className="panel grid gap-y-6 p-4 md:grid-cols-3 md:divide-x md:divide-separador md:p-6">
        <Columna titulo="Hoy" cola>
          <ListaActividades
            actividades={hoy}
            vacio="Sin actividades hoy."
            cargando={agenda.cargando}
          />
        </Columna>
        <Columna titulo="Esta semana" sangria cola>
          <ListaActividades
            actividades={semana}
            vacio="Nada programado en los próximos siete días."
            cargando={agenda.cargando}
          />
        </Columna>
        <Columna titulo="Pendientes" sangria>
          <ul className="flex flex-col">
            <Pendiente
              etiqueta="Personas sin seguimiento"
              valor={r.sinSeguimiento}
              href="/seguimiento"
              cargando={cargando}
            />
            <Pendiente
              etiqueta="Actividades por cerrar"
              valor={r.porCerrar}
              href="/actividades"
              cargando={cargando}
            />
            <Pendiente
              etiqueta="Secciones sin responsable"
              valor={r.seccionesSinResponsable}
              href="/territorio"
              cargando={cargando}
            />
          </ul>
        </Columna>
      </section>

      {/* Zona de apoyo, no protagonista: por eso va al final y desaparece por completo si hoy
          no cumple nadie, en vez de dejar un panel vacío ocupando lugar. */}
      {!cumpleanos.cargando && cumpleanos.datos.length > 0 && (
        <ListaCumpleanos personas={cumpleanos.datos} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Resumen: una sola superficie tranquila, no seis tarjetas
 * ------------------------------------------------------------------------- */

function Resumen({
  resumen: r,
  cargando,
  semanal,
}: {
  resumen: ResumenTablero;
  cargando: boolean;
  semanal: SemanaReporte[];
}) {
  const conResponsable = r.seccionesConResponsable ?? 0;
  const sinResponsable = r.seccionesSinResponsable ?? 0;
  const secciones = conResponsable + sinResponsable;
  // Sin secciones no hay porcentaje que valga: antes que un NaN, no se muestra nada.
  const porcentaje = secciones > 0 ? Math.round((conResponsable / secciones) * 100) : null;
  const idCobertura = useId();

  return (
    <section aria-labelledby={`${idCobertura}-titulo`} className="panel overflow-hidden">
      <h2 id={`${idCobertura}-titulo`} className="sr-only">
        Resumen de personas alcanzadas y cobertura
      </h2>

      <div className="flex flex-col gap-6 p-4 md:p-6 lg:flex-row lg:gap-10">
        {/* Métrica principal. Manda, pero ya no aplasta al resto. */}
        <div className="lg:w-60 lg:shrink-0 lg:border-r lg:border-separador lg:pr-10">
          <p className="text-sm text-tinta-suave">Personas alcanzadas</p>
          <p className="cifra-mayor mt-1 text-tinta">
            {cargando ? "—" : formatoCifra.format(r.personas ?? 0)}
          </p>
          <p className="mt-1 text-sm text-tinta-suave">
            {cargando || secciones === 0 ? (
              " "
            ) : (
              <>
                en <span className="cifras">{formatoCifra.format(secciones)}</span> secciones
              </>
            )}
          </p>
        </div>

        {/* Secundarias: una cuadrícula integrada, sin tarjeta alrededor de cada cifra. */}
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:gap-x-10 xl:grid-cols-5">
          <Dato valor={r.quierenParticipar} etiqueta="Quieren participar" cargando={cargando} />
          <Dato valor={r.quierenInfo} etiqueta="Quieren información" cargando={cargando} />
          <Dato valor={r.nuevasSemana} etiqueta="Nuevas esta semana" cargando={cargando}>
            <Franja datos={semanal} />
          </Dato>
          <Dato valor={r.promovidos} etiqueta="Promovidos" cargando={cargando} />
          <Dato
            valor={r.aspirantesRepresentante}
            etiqueta="Quieren ser representantes"
            cargando={cargando}
          />
        </dl>
      </div>

      {/* Cobertura territorial: la barra es información, no adorno. Es la historia que el socio
          va a preguntar en la junta, así que el texto solo se basta sin mirar el color. */}
      <div className="border-t border-separador p-4 md:px-6 md:py-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h3 id={idCobertura} className="text-sm font-medium text-tinta">
            Cobertura de responsables
          </h3>
          <p className="text-sm text-tinta-suave">
            {cargando ? (
              "Contando…"
            ) : secciones === 0 ? (
              "Todavía no hay secciones cargadas."
            ) : (
              <>
                <span className="cifras font-semibold text-tinta">
                  {formatoCifra.format(conResponsable)}
                </span>{" "}
                de <span className="cifras">{formatoCifra.format(secciones)}</span> secciones
                {porcentaje !== null && (
                  <>
                    {" · "}
                    <span className="cifras">{porcentaje}%</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>

        <div
          role="progressbar"
          aria-labelledby={idCobertura}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentaje ?? 0}
          aria-valuetext={
            porcentaje === null
              ? "Sin datos de cobertura"
              : `${porcentaje} por ciento de las secciones tienen responsable`
          }
          className="mt-3 h-1.5 w-full max-w-[44rem] overflow-hidden rounded-pildora bg-superficie-hundida"
        >
          <div
            className="transicion-panel h-full w-full origin-left rounded-pildora bg-naranja transition-transform"
            style={{ transform: `scaleX(${(porcentaje ?? 0) / 100})` }}
          />
        </div>

        {!cargando && sinResponsable > 0 && (
          <p className="mt-2.5 text-sm">
            <Link
              href="/territorio"
              className="text-naranja-texto underline-offset-4 hover:underline"
            >
              <span className="cifras">{formatoCifra.format(sinResponsable)}</span> sin responsable
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

function Dato({
  valor,
  etiqueta,
  cargando,
  children,
}: {
  valor: number | undefined;
  etiqueta: string;
  cargando: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dd className="cifra-indicador text-tinta">
        {cargando ? "—" : formatoCifra.format(valor ?? 0)}
      </dd>
      <dt className="mt-0.5 text-sm text-tinta-suave">{etiqueta}</dt>
      {!cargando && children}
    </div>
  );
}

/**
 * Diez semanas de altas reales, tomadas de reporteSemanal. Sin ejes, sin leyenda, sin caja: lo
 * que aporta es la forma. Lleva periodo escrito y descripción accesible porque una serie sin
 * periodo no dice nada, y si algún día no hay serie, simplemente no se pinta.
 */
function Franja({ datos }: { datos: SemanaReporte[] }) {
  if (datos.length === 0) return null;

  const tope = Math.max(...datos.map((d) => d.personas), 1);
  const total = datos.reduce((suma, d) => suma + d.personas, 0);

  return (
    <div className="mt-2.5">
      <div
        role="img"
        aria-label={`Altas por semana en las últimas ${datos.length} semanas: ${formatoCifra.format(total)} personas en total, con un máximo de ${formatoCifra.format(tope)} en una semana.`}
        className="flex h-6 items-end gap-[3px]"
      >
        {datos.map((d, i) => (
          <span
            key={d.inicio}
            title={`${d.etiqueta}: ${d.personas}`}
            className="w-1.5 rounded-[1px]"
            style={{
              height: `${Math.max(8, (d.personas / tope) * 100)}%`,
              background: i === datos.length - 1 ? "var(--naranja)" : "var(--tinta-tenue)",
              opacity: i === datos.length - 1 ? 1 : 0.4,
            }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-tinta-suave">Últimas {datos.length} semanas</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Contenido inferior
 * ------------------------------------------------------------------------- */

function Columna({
  titulo,
  sangria = false,
  cola = false,
  children,
}: {
  titulo: string;
  sangria?: boolean;
  /** Deja aire antes del filete para que la fecha no quede pegada a la línea. */
  cola?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={[sangria ? "md:pl-8" : "", cola ? "md:pr-8" : ""].join(" ").trim()}>
      <h2 className="mb-3 text-sm font-semibold text-tinta">{titulo}</h2>
      {children}
    </div>
  );
}

function ListaActividades({
  actividades,
  vacio,
  cargando,
}: {
  actividades: Actividad[];
  vacio: string;
  cargando: boolean;
}) {
  if (cargando) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded-control bg-superficie-hundida" />
        ))}
      </div>
    );
  }
  if (actividades.length === 0) {
    return <p className="text-sm text-tinta-suave">{vacio}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-separador">
      {actividades.slice(0, 5).map((a) => (
        <li key={a.id} className="py-2.5 first:pt-0">
          <Link href={`/actividades/${a.id}` as never} className="group block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-tinta group-hover:text-naranja-texto">
                {a.nombre}
              </span>
              <span className="cifras shrink-0 text-xs text-tinta-suave">
                {fechaCorta(a.fecha)}
              </span>
            </span>
            <span className="mt-0.5 block text-sm text-tinta-suave">
              {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
              {a.seccion_clave && (
                <>
                  {" · "}
                  <span className="cifras">Sección {a.seccion_clave}</span>
                </>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Pendiente({
  etiqueta,
  valor,
  href,
  cargando,
}: {
  etiqueta: string;
  valor: number | undefined;
  href: string;
  cargando: boolean;
}) {
  return (
    <li className="border-b border-separador last:border-0">
      <Link
        href={href as never}
        className="group flex items-baseline justify-between gap-3 py-2.5"
      >
        <span className="text-sm text-tinta-suave group-hover:text-naranja-texto">{etiqueta}</span>
        {cargando ? (
          <span className="h-4 w-8 animate-pulse rounded bg-superficie-hundida" />
        ) : (
          <span className="cifra-atlas text-lg text-tinta">
            {formatoCifra.format(valor ?? 0)}
          </span>
        )}
      </Link>
    </li>
  );
}

/* ---------------------------------------------------------------------------
 * Listado de personas: nombre, datos secundarios y contacto, en ese orden y
 * sin un vacío entre el nombre y el botón.
 * ------------------------------------------------------------------------- */

function ListaCumpleanos({ personas }: { personas: CumpleanosHoy[] }) {
  return (
    <section className="panel p-4 md:p-6">
      <h2 className="text-sm font-semibold text-tinta">
        Cumplen años hoy · <span className="cifras">{formatoCifra.format(personas.length)}</span>
      </h2>

      <ul className="mt-1 flex max-w-[46rem] flex-col divide-y divide-separador">
        {personas.map((c) => (
          <li
            key={c.persona_id}
            className="grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center justify-start gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,17rem)_minmax(0,12rem)_auto]"
          >
            <p className="min-w-0 text-[0.9375rem] font-medium text-tinta">{c.nombre}</p>

            <p className="col-start-1 text-sm text-tinta-suave md:col-start-2">
              <span className="cifras">{c.edad} años</span>
              {c.seccion_clave && (
                <>
                  {" · "}
                  <span className="cifras">Sección {c.seccion_clave}</span>
                </>
              )}
            </p>

            {c.telefono_norm && (
              <a
                href={`https://wa.me/52${c.telefono_norm}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Escribir por WhatsApp a ${c.nombre}`}
                className="transicion-ui col-start-2 row-span-2 row-start-1 md:row-span-1 inline-flex shrink-0 items-center gap-2 self-center rounded-control border border-borde bg-superficie px-3 text-sm font-medium text-tinta transition-colors hover:bg-naranja-suave hover:text-naranja-texto toque-actividad md:col-start-3"
              >
                <MessageCircle className="size-4" aria-hidden />
                WhatsApp
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
