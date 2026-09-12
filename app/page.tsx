"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import { useMovimientoReducido } from "@/lib/movimiento";
import { useConsulta } from "@/lib/usar-consulta";
import { Indicador } from "@/components/tablero/indicador";
import {
  resumenTablero,
  cumpleanosDeHoy,
  type ResumenTablero,
  type CumpleanosHoy,
} from "@/lib/datos/tablero";
import { reporteSemanal, type SemanaReporte } from "@/lib/datos/reportes";
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
  const secciones = (r.seccionesConResponsable ?? 0) + (r.seccionesSinResponsable ?? 0);
  const cobertura = secciones > 0 ? (r.seccionesConResponsable ?? 0) / secciones : 0;

  return (
    <div className="flex flex-col">
      {/* Cabecera editorial: una cifra manda y el resto se lee como una línea de registro,
          no como cuatro tarjetas iguales. */}
      <header className="pb-8 pt-2">
        <p className="text-sm text-tinta-suave">Oaxaca de Juárez · {territorio}</p>

        <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-6">
          <div>
            <p
              className="cifra-atlas text-tinta"
              style={{ fontSize: "clamp(3.25rem, 2rem + 6vw, 5.5rem)" }}
            >
              {cargando ? "—" : (r.personas ?? 0).toLocaleString("es-MX")}
            </p>
            <p className="mt-1 text-sm text-tinta-suave">
              personas alcanzadas en {secciones || 157} secciones
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-4 pb-2">
            <Dato
              valor={r.quierenParticipar}
              etiqueta="quieren participar"
              cargando={cargando}
            />
            <Dato valor={r.quierenInfo} etiqueta="quieren información" cargando={cargando} />
            <Dato
              valor={r.nuevasSemana}
              etiqueta="nuevas esta semana"
              cargando={cargando}
              grafico={<Franja datos={semanal.datos} />}
            />
          </dl>

          {/* Embudo de reclutamiento: son las dos cifras que el operador revisa a diario,
              por eso llevan tarjeta propia en vez de perderse como texto plano. */}
          <div className="flex flex-wrap gap-3">
            <Indicador etiqueta="Promovidos" valor={r.promovidos ?? 0} cargando={cargando} orden={0} />
            <Indicador
              etiqueta="Quieren ser representantes"
              valor={r.aspirantesRepresentante ?? 0}
              cargando={cargando}
              orden={1}
            />
          </div>
        </div>

        {/* Cobertura territorial: la barra es información, no adorno. Es la historia que el
            socio va a preguntar en la junta. */}
        <div className="mt-8 border-t border-borde pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-tinta">
              <span className="cifras font-medium">{r.seccionesConResponsable ?? 0}</span>{" "}
              <span className="text-tinta-suave">
                de <span className="cifras">{secciones || 157}</span> secciones tienen responsable
              </span>
            </p>
            <Link
              href="/territorio"
              className="text-sm text-naranja-texto underline-offset-4 hover:underline"
            >
              {(r.seccionesSinResponsable ?? 0).toLocaleString("es-MX")} sin responsable
            </Link>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pildora bg-superficie-hundida">
            <div
              className="transicion-panel h-full rounded-pildora bg-naranja"
              style={{ width: `${Math.round(cobertura * 100)}%` }}
            />
          </div>
        </div>
      </header>

      {/* El mapa va a sangre, sin tarjeta alrededor. Es el protagonista. */}
      <section className="relative -mx-4 h-[58vh] min-h-[22rem] overflow-hidden border-y border-borde md:-ml-24 md:-mr-6 md:rounded-none">
        <MapaPagina sangradoIzquierdo conBarra={false} />
      </section>

      {/* Tres columnas separadas por filetes, no tres tarjetas. */}
      <section className="grid gap-y-8 pt-8 md:grid-cols-3 md:divide-x md:divide-borde">
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
        <section className="mt-8 border-t border-borde pt-6">
          <h2 className="mb-3 text-sm font-medium text-tinta-tenue">
            Cumplen años hoy · <span className="cifras text-tinta">{cumpleanos.datos.length}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-borde">
            {cumpleanos.datos.map((c) => (
              <li key={c.persona_id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-sm text-tinta">{c.nombre}</p>
                  <p className="mt-0.5 text-xs text-tinta-suave">
                    <span className="cifras">{c.edad} años</span>
                    {c.seccion_clave && (
                      <>
                        {" · "}
                        <span className="cifras">{c.seccion_clave}</span>
                      </>
                    )}
                  </p>
                </div>
                {c.telefono_norm && (
                  <a
                    href={`https://wa.me/52${c.telefono_norm}`}
                    target="_blank"
                    rel="noreferrer"
                    className="transicion-ui inline-flex shrink-0 items-center gap-2 rounded-control border border-borde bg-superficie px-3 text-sm text-tinta toque-actividad"
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

function Dato({
  valor,
  etiqueta,
  cargando,
  grafico,
}: {
  valor: number | undefined;
  etiqueta: string;
  cargando: boolean;
  grafico?: React.ReactNode;
}) {
  return (
    <div>
      <dd className="cifra-atlas text-2xl text-tinta">
        {cargando ? "—" : (valor ?? 0).toLocaleString("es-MX")}
      </dd>
      <dt className="mt-0.5 text-sm text-tinta-suave">{etiqueta}</dt>
      {grafico}
    </div>
  );
}

/** Diez semanas de altas, en una franja de barras. Sin ejes, sin leyenda, sin caja. */
function Franja({ datos }: { datos: SemanaReporte[] }) {
  const reducido = useMovimientoReducido();
  if (datos.length === 0) return null;
  const tope = Math.max(...datos.map((d) => d.personas), 1);

  return (
    <div className="mt-2 flex h-6 items-end gap-[3px]" aria-hidden>
      {datos.map((d, i) => (
        <span
          key={d.inicio}
          title={`${d.etiqueta}: ${d.personas}`}
          className="w-1.5 rounded-[1px]"
          style={{
            height: `${Math.max(8, (d.personas / tope) * 100)}%`,
            background:
              i === datos.length - 1 ? "var(--naranja)" : "var(--tinta-tenue)",
            opacity: i === datos.length - 1 ? 1 : 0.45,
            transition: reducido ? "none" : "height var(--dur-panel) var(--curva)",
          }}
        />
      ))}
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
      <h2 className="mb-3 text-sm font-medium text-tinta-tenue">{titulo}</h2>
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
    return <p className="text-sm text-tinta-tenue">{vacio}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-borde">
      {actividades.slice(0, 5).map((a) => (
        <li key={a.id} className="py-2.5 first:pt-0">
          <Link href={`/actividades/${a.id}` as never} className="group block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-tinta group-hover:text-naranja-texto">
                {a.nombre}
              </span>
              <span className="cifras shrink-0 text-xs text-tinta-tenue">
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
    <li className="border-b border-borde last:border-0">
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
