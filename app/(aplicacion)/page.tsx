"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  Hand,
  Megaphone,
  MessageCircle,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BarraAvance } from "@/components/sistema/barra-avance";
import { Caja } from "@/components/sistema/caja";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { TarjetaCifra } from "@/components/sistema/tarjeta-cifra";
import { useActuante } from "@/components/proveedor-actuante";
import { PortonAgenda } from "@/components/porton-agenda";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { etiquetaAlcance, puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  resumenTablero,
  cumpleanosDeHoy,
  type ResumenTablero,
  type CumpleanosHoy,
} from "@/lib/datos/tablero";
import { actividadesDeAgenda, type Actividad } from "@/lib/datos/actividades";
import { estatusVisibles } from "@/lib/puertas-ui";
import { fechaLocalIso } from "@/lib/utils";

const MapaPagina = dynamic(
  () => import("@/components/mapa/mapa-pagina").then((m) => m.MapaPagina),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-superficie-hundida" /> },
);

const RESUMEN_VACIO = {} as ResumenTablero;

function enDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return fechaLocalIso(f);
}

function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
  });
}

/**
 * La raíz. Aquí se decide quién ve el tablero y quién no.
 *
 * Al brigadista se le **redirige** a /agenda en lugar de mostrarle un portón, y eso es a
 * propósito: esta no es una pantalla a la que haya llegado por su cuenta, es la pantalla a la que
 * el sistema lo manda. `proxy.ts` manda a "/" a todo el que entra con sesión y a todo el que
 * pisa /entrar estando dentro, así que un aviso aquí significaría que el brigadista choca con una
 * pared **cada vez que abre la aplicación**, y que su primera pantalla del día es una que le dice
 * que no tiene permiso. Un portón está bien para una URL que alguien escribió; para la puerta de
 * entrada, no.
 *
 * La redirección es de cliente porque el rol vive en el cliente: el proxy responde una sola
 * pregunta, si el JWT es válido, y leer la base en cada petición para saber el rol es justo lo
 * que la documentación de Next pide no hacer ahí.
 *
 * El portón se pinta mientras la navegación ocurre. Dura un cuadro, y es la red de seguridad si
 * la redirección no llega a correr: lo peor que puede pasar es que vea el camino a su agenda
 * escrito, no una pantalla en blanco.
 *
 * El tablero de verdad vive en TableroCompleto, un componente aparte, para que sus tres consultas
 * no se disparen para quien no va a ver el resultado.
 */
export default function Pagina() {
  const { actuante } = useActuante();
  const router = useRouter();
  const soloAgenda = !puedeVerListadosGenerales(actuante);

  useEffect(() => {
    if (soloAgenda) router.replace("/agenda");
  }, [soloAgenda, router]);

  if (soloAgenda) return <PortonAgenda titulo="Tablero" />;

  return <TableroCompleto />;
}

function TableroCompleto() {
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

  // Solo presentación: cuál de las dos listas de la agenda cercana se pinta en "Actividad".
  const [periodo, setPeriodo] = useState<"hoy" | "semana">("hoy");

  const r = resumen.datos;
  const cargando = resumen.cargando;
  const secciones = (r.seccionesConResponsable ?? 0) + (r.seccionesSinResponsable ?? 0);
  const hayTotalSecciones = secciones > 0;
  const cobertura = hayTotalSecciones ? (r.seccionesConResponsable ?? 0) / secciones : 0;
  const porcentajeCobertura = Math.round(cobertura * 100);

  return (
    <div>
      {/* Primera pantalla: encabezado, cifras, tira de cobertura y la fila del mapa. En escritorio
          los cuatro renglones juntos miden el alto de la ventana y la fila del mapa se queda con
          lo que sobra; en celular todo se apila y el mapa tiene alto propio. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:min-h-[max(43.75rem,calc(100dvh-4.5rem))] lg:grid-rows-[auto_auto_auto_minmax(26rem,1fr)]">
        {/* El título manda. La barra superior (otra capa) pinta buscador y cuenta a la derecha;
            el hueco lo reserva EncabezadoPagina. */}
        <EncabezadoPagina
          titulo="Oaxaca de Juárez"
          apoyo={<>Resumen territorial · {territorio}</>}
        />

        {/* Cinco cifras hermanas, cada una en su tarjeta. La primera es la que manda: más ancha
            en escritorio y a renglón completo en celular. Todas llevan a Personas, sin filtro. */}
        <section
          aria-label="Indicadores del tablero"
          className="grid grid-cols-2 gap-4 lg:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))]"
        >
          <TarjetaCifra
            icono={Users}
            etiqueta="Personas alcanzadas"
            valor={r.personas ?? 0}
            apoyo={`en ${secciones.toLocaleString("es-MX")} secciones`}
            nota={
              `${(r.nuevasSemana ?? 0).toLocaleString("es-MX")} nuevas esta semana` +
              (r.sinDatos ? ` · ${r.sinDatos.toLocaleString("es-MX")} sin datos` : "")
            }
            href="/personas"
            cargando={cargando}
            className="col-span-2 lg:col-span-1"
          />
          <TarjetaCifra
            icono={Hand}
            etiqueta="Quieren participar"
            valor={r.quierenParticipar ?? 0}
            href="/personas"
            cargando={cargando}
          />
          <TarjetaCifra
            icono={FileText}
            etiqueta="Quieren información"
            valor={r.quierenInfo ?? 0}
            href="/personas"
            cargando={cargando}
          />
          <TarjetaCifra
            icono={Megaphone}
            etiqueta="Promovidos"
            valor={r.promovidos ?? 0}
            href="/personas"
            cargando={cargando}
          />
          <TarjetaCifra
            icono={UserCheck}
            etiqueta="Quieren ser representantes"
            valor={r.aspirantesRepresentante ?? 0}
            href="/personas"
            cargando={cargando}
          />
        </section>

        {/* Cobertura territorial en una tira: la barra es información, no adorno. Es la historia
            que el socio va a preguntar en la junta. Píldora en escritorio; en celular es una
            tarjeta normal y la barra baja a su propio renglón. */}
        <section
          aria-label="Cobertura territorial"
          className="tarjeta flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 md:flex-nowrap md:rounded-pildora md:py-0 md:pl-5 md:pr-3"
        >
          <p id="texto-cobertura" className="min-w-0 text-[0.8125rem] text-tinta-suave">
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
          <BarraAvance
            valor={hayTotalSecciones ? cobertura : 0}
            descripcion={
              hayTotalSecciones
                ? `${porcentajeCobertura} por ciento de cobertura`
                : "Sin secciones registradas todavía"
            }
            etiquetadaPor="texto-cobertura"
            className="order-3 mb-2.5 basis-full md:order-none md:mb-0 md:min-w-10 md:flex-1 md:basis-auto"
          />
          <Link
            href="/territorio"
            className="cifras ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-naranja-texto underline-offset-4 hover:underline"
          >
            {cargando
              ? "—"
              : `${(r.seccionesSinResponsable ?? 0).toLocaleString("es-MX")} sin responsable`}
            <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
          </Link>
        </section>

        {/* Fila principal: el mapa a la izquierda y, a la derecha, la columna de contexto. En
            celular el mapa va primero y la columna debajo. */}
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* El mapa no se toca: solo cambia la tarjeta que lo contiene. `mapa-intacto` le
              devuelve adentro los tokens de antes del rediseño. */}
          <section
            aria-label="Mapa de secciones"
            className="tarjeta mapa-intacto relative h-[62vh] min-h-[25rem] overflow-hidden lg:h-auto lg:min-h-0"
          >
            <div className="absolute inset-0">
              <MapaPagina conBarra={false} />
            </div>
          </section>

          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-rows-[minmax(0,1fr)_auto]">
            {/* Una sola tarjeta para la agenda cercana; el conmutador solo cambia cuál de las
                dos listas se pinta. Si la lista no cabe en el alto de la fila, se desplaza
                adentro en vez de empujar la página. */}
            <Caja
              icono={CalendarDays}
              titulo="Actividad"
              className="lg:min-h-0 lg:overflow-y-auto"
              accion={
                <div className="segmento" role="group" aria-label="Periodo de la actividad">
                  <button
                    type="button"
                    aria-pressed={periodo === "hoy"}
                    onClick={() => setPeriodo("hoy")}
                    className="relative after:absolute after:inset-x-0 after:-inset-y-1"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    aria-pressed={periodo === "semana"}
                    onClick={() => setPeriodo("semana")}
                    className="relative after:absolute after:inset-x-0 after:-inset-y-1"
                  >
                    Semana
                  </button>
                </div>
              }
            >
              {periodo === "hoy" ? (
                <ListaActividades
                  actividades={hoy}
                  vacio="Sin actividades hoy."
                  cargando={agenda.cargando}
                />
              ) : (
                <ListaActividades
                  actividades={semana}
                  vacio="Nada programado en los próximos siete días."
                  cargando={agenda.cargando}
                />
              )}
            </Caja>

            <Caja icono={Clock} titulo="Pendientes">
              <ul className="-mx-2 -mb-2 flex flex-col">
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
            </Caja>
          </div>
        </div>
      </div>

      {/* Zona de apoyo, no protagonista: por eso va al final y desaparece por completo si hoy
          no cumple nadie, en vez de dejar una tarjeta vacía ocupando lugar. */}
      {!cumpleanos.cargando && cumpleanos.datos.length > 0 && (
        <Caja
          titulo={
            <>
              Cumplen años hoy · <span className="cifras">{cumpleanos.datos.length}</span>
            </>
          }
          className="mt-10 max-w-[27.5rem]"
        >
          <ul className="flex flex-col divide-y divide-separador">
            {cumpleanos.datos.map((c) => (
              <li key={c.persona_id} className="flex items-center gap-2.5 py-2 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tinta">{c.nombre}</p>
                  <p className="text-[0.78125rem] text-tinta-suave">
                    <span className="cifras">{c.edad} años</span>
                    {c.seccion_clave && (
                      <>
                        {" · "}
                        Sección <span className="cifras">{c.seccion_clave}</span>
                      </>
                    )}
                  </p>
                </div>
                {c.telefono_norm && (
                  <a
                    href={`https://wa.me/52${c.telefono_norm}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Escribir por WhatsApp a ${c.nombre}`}
                    className="boton shrink-0"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    WhatsApp
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Caja>
      )}
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
    return <p className="text-[0.8125rem] text-tinta-suave">{vacio}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-separador">
      {actividades.slice(0, 5).map((a) => (
        <li key={a.id}>
          <Link
            href={`/actividades/${a.id}` as never}
            className="group flex min-h-11 flex-col justify-center py-2.5"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="transicion-ui truncate text-[0.8125rem] font-medium text-tinta transition-colors group-hover:text-naranja-texto">
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
    <li>
      <Link
        href={href as never}
        className="renglon-activo flex min-h-11 items-center gap-3 rounded-control px-2 text-[0.8125rem]"
      >
        <span className="min-w-0 flex-1 text-tinta-suave">{etiqueta}</span>
        {cargando ? (
          <span className="h-4 w-8 animate-pulse rounded bg-superficie-hundida" />
        ) : (
          <span className="cifras font-semibold text-tinta">
            {(valor ?? 0).toLocaleString("es-MX")}
          </span>
        )}
        <ChevronRight className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
      </Link>
    </li>
  );
}
