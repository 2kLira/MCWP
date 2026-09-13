"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  resumenTablero,
  cumpleanosDeHoy,
  type ResumenTablero,
  type CumpleanosHoy,
} from "@/lib/datos/tablero";
import { actividadesDeAgenda, type Actividad } from "@/lib/datos/actividades";
import { estatusVisibles } from "@/lib/permisos";

const MapaPagina = dynamic(
  () => import("@/components/mapa/mapa-pagina").then((m) => m.MapaPagina),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-superficie-hundida" /> },
);

const RESUMEN_VACIO = {} as ResumenTablero;

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
  const secciones = (r.seccionesConResponsable ?? 0) + (r.seccionesSinResponsable ?? 0);
  const hayTotalSecciones = secciones > 0;
  const cobertura = hayTotalSecciones ? (r.seccionesConResponsable ?? 0) / secciones : 0;
  const porcentajeCobertura = Math.round(cobertura * 100);

  return (
    <div className="flex flex-col">
      {/* Encabezado: el título manda, la barra superior (otra capa) pinta buscador y
          conmutador de rol a la derecha, por eso el hueco reservado en escritorio. */}
      <header className="pb-6 pt-2 md:pr-[34rem]">
        <h1 className="titulo-pagina text-tinta">Oaxaca de Juárez</h1>
        <p className="mt-1 text-base text-tinta-suave">Resumen territorial · {territorio}</p>
      </header>

      {/* Una sola superficie: banda de métricas arriba, cobertura al pie, separadas por
          un filete horizontal. Nada de tarjetas individuales. */}
      <section
        aria-label="Indicadores del tablero"
        className="rounded-lienzo border border-borde bg-superficie"
      >
        <dl className="grid grid-cols-1 gap-y-6 p-4 sm:grid-cols-2 sm:gap-x-4 md:grid-cols-[minmax(0,1.15fr)_1px_minmax(0,1fr)_1px_minmax(0,1fr)] md:items-center md:gap-0 md:p-8">
          {/* Bloque principal: la cifra que manda. */}
          <div className="sm:col-span-2 md:col-span-1 md:pr-8">
            <dt className="text-sm text-tinta-suave">Personas alcanzadas</dt>
            <dd className="cifra-mayor mt-1 text-tinta">
              {cargando ? "—" : (r.personas ?? 0).toLocaleString("es-MX")}
            </dd>
            <p className="mt-1 text-sm text-tinta-suave">
              {cargando ? "—" : `en ${secciones.toLocaleString("es-MX")} secciones`}
            </p>
            <p className="mt-0.5 text-sm text-naranja-texto">
              {cargando ? "—" : `${(r.nuevasSemana ?? 0).toLocaleString("es-MX")} nuevas esta semana`}
            </p>
          </div>

          <div className="hidden md:block md:h-full md:w-px md:justify-self-center md:bg-separador" />

          {/* Quieren participar / información. */}
          <div className="flex justify-around gap-4 border-t border-separador pt-6 md:justify-center md:gap-10 md:border-t-0 md:px-8 md:pt-0">
            <MetricaSecundaria
              valor={r.quierenParticipar}
              etiqueta="Quieren participar"
              cargando={cargando}
            />
            <MetricaSecundaria
              valor={r.quierenInfo}
              etiqueta="Quieren información"
              cargando={cargando}
            />
          </div>

          <div className="hidden md:block md:h-full md:w-px md:justify-self-center md:bg-separador" />

          {/* Promovidos / aspirantes a representante: antes tarjetas de vidrio aparte. */}
          <div className="flex justify-around gap-4 border-t border-separador pt-6 md:justify-center md:gap-10 md:border-t-0 md:pl-8 md:pt-0">
            <MetricaSecundaria
              valor={r.promovidos}
              etiqueta="Promovidos"
              cargando={cargando}
            />
            <MetricaSecundaria
              valor={r.aspirantesRepresentante}
              etiqueta="Quieren ser representantes"
              cargando={cargando}
            />
          </div>
        </dl>

        {/* Cobertura territorial: la barra es información, no adorno. Es la historia que el
            socio va a preguntar en la junta. */}
        <div className="border-t border-separador px-6 py-5 md:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p id="texto-cobertura" className="text-sm text-tinta-suave">
              {cargando ? (
                "—"
              ) : hayTotalSecciones ? (
                <>
                  <span className="cifras font-semibold text-tinta">
                    {(r.seccionesConResponsable ?? 0).toLocaleString("es-MX")}
                  </span>{" "}
                  de{" "}
                  <span className="cifras font-semibold text-tinta">
                    {secciones.toLocaleString("es-MX")}
                  </span>{" "}
                  secciones con responsable
                </>
              ) : (
                "Todavía no hay secciones registradas"
              )}
            </p>
            <Link
              href="/territorio"
              className="text-sm font-semibold text-naranja-texto underline-offset-4 hover:underline"
            >
              {cargando
                ? "—"
                : `${(r.seccionesSinResponsable ?? 0).toLocaleString("es-MX")} sin responsable`}
            </Link>
          </div>
          <div
            role="progressbar"
            aria-labelledby="texto-cobertura"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hayTotalSecciones ? porcentajeCobertura : 0}
            aria-valuetext={
              hayTotalSecciones
                ? `${porcentajeCobertura} por ciento de cobertura`
                : "Sin secciones registradas todavía"
            }
            className="mt-3 h-1.5 w-full overflow-hidden rounded-pildora bg-superficie-hundida"
          >
            <div
              className="transicion-panel h-full w-full origin-left rounded-pildora bg-naranja"
              style={{ transform: `scaleX(${hayTotalSecciones ? cobertura : 0})` }}
            />
          </div>
        </div>
      </section>

      {/* El mapa como tarjeta grande, alineada al mismo eje que todo lo demás. */}
      <section
        aria-label="Mapa de secciones"
        className="mt-8 overflow-hidden rounded-lienzo border border-borde elevacion-apoyo"
      >
        <div className="h-[26rem] sm:h-[32rem] lg:h-[38rem]">
          <MapaPagina conBarra={false} />
        </div>
      </section>

      {/* Tres columnas separadas por filetes, no tres tarjetas. */}
      <section className="grid gap-y-8 pt-8 md:grid-cols-3 md:divide-x md:divide-separador">
        <Columna titulo="Hoy" cola>
          <ListaActividades actividades={hoy} vacio="Sin actividades hoy." cargando={agenda.cargando} />
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
          no cumple nadie, en vez de dejar una tarjeta vacía ocupando lugar. */}
      {!cumpleanos.cargando && cumpleanos.datos.length > 0 && (
        <section className="mt-8 border-t border-separador pt-6">
          <h2 className="mb-3 text-sm font-medium text-tinta-suave">
            Cumplen años hoy · <span className="cifras text-tinta">{cumpleanos.datos.length}</span>
          </h2>
          <ul className="flex max-w-[46rem] flex-col divide-y divide-separador">
            {cumpleanos.datos.map((c) => (
              <li
                key={c.persona_id}
                className="grid min-h-[4.5rem] items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[minmax(0,18rem)_minmax(0,12rem)_auto]"
              >
                <p className="truncate text-[15px] font-medium text-tinta">{c.nombre}</p>
                <p className="text-sm text-tinta-suave">
                  <span className="cifras">{c.edad} años</span>
                  {c.seccion_clave && (
                    <>
                      {" · "}
                      Sección <span className="cifras">{c.seccion_clave}</span>
                    </>
                  )}
                </p>
                {c.telefono_norm && (
                  <a
                    href={`https://wa.me/52${c.telefono_norm}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Escribir por WhatsApp a ${c.nombre}`}
                    className="transicion-ui inline-flex h-11 shrink-0 items-center gap-2 justify-self-start rounded-control border border-borde bg-superficie px-3 text-sm text-tinta toque-actividad md:justify-self-end"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    WhatsApp
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MetricaSecundaria({
  valor,
  etiqueta,
  cargando,
}: {
  valor: number | undefined;
  etiqueta: string;
  cargando: boolean;
}) {
  return (
    <div className="text-center">
      <dd className="cifra-indicador text-tinta">
        {cargando ? "—" : (valor ?? 0).toLocaleString("es-MX")}
      </dd>
      <dt className="mt-0.5 text-sm text-tinta-suave">{etiqueta}</dt>
    </div>
  );
}

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
    <div className={[sangria ? "md:pl-10" : "", cola ? "md:pr-10" : ""].join(" ").trim()}>
      <h2 className="mb-3 text-sm font-medium text-tinta-suave">{titulo}</h2>
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
          <div key={i} className="h-8 animate-pulse rounded bg-superficie-hundida" />
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
              <span className="truncate text-sm text-tinta group-hover:text-naranja-texto">
                {a.nombre}
              </span>
              <span className="cifras shrink-0 text-xs text-tinta-suave">
                {fechaCorta(a.fecha)}
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-tinta-suave">
              {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
              {a.seccion_clave && (
                <>
                  {" · "}
                  <span className="cifras">{a.seccion_clave}</span>
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
        <span className="text-sm text-tinta-suave group-hover:text-tinta">{etiqueta}</span>
        {cargando ? (
          <span className="h-4 w-8 animate-pulse rounded bg-superficie-hundida" />
        ) : (
          <span className="cifra-atlas text-lg text-tinta">
            {(valor ?? 0).toLocaleString("es-MX")}
          </span>
        )}
      </Link>
    </li>
  );
}
