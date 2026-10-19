"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  ChartPie,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flag,
  Info,
  Layers,
  Map as IconoMapa,
  Megaphone,
} from "lucide-react";
import { BarraAvance } from "@/components/sistema/barra-avance";
import { Caja } from "@/components/sistema/caja";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Estado } from "@/components/sistema/estado";
import { TarjetaCifra } from "@/components/sistema/tarjeta-cifra";
import { PortonAgenda } from "@/components/porton-agenda";
import { useActuante } from "@/components/proveedor-actuante";
import { puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import {
  coloniasDeSeccionConTraslape,
  demarcacionesResumen,
  seccionesResumen,
  type ColoniaDeSeccion,
  type DemarcacionResumen,
  type SeccionResumen,
} from "@/lib/datos/catalogos";
import { cn } from "@/lib/utils";

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function cifra(valor: number | null): string {
  return valor == null ? "—" : valor.toLocaleString("es-MX");
}

/* ---------------------------------------------------------------------------
 * b) Indicadores de meta y avance
 *
 * La meta de votos todavía viene vacía en todas las secciones: el cliente la define después de
 * esta entrega. El indicador se muestra desde ahora, con la meta en guion y el avance sin
 * porcentaje, para que el día que se cargue el Excel la pantalla no cambie de forma, solo se
 * llene de números.
 * ------------------------------------------------------------------------- */

type MetaAvance = {
  id: number | "total";
  etiqueta: string;
  listaNominal: number;
  promovidos: number;
  metaVotos: number | null;
};

/** Un renglón de meta y avance a partir de lo que ya sumó la vista de la base. */
function deDemarcacion(d: DemarcacionResumen): MetaAvance {
  return {
    id: d.demarcacion_id,
    etiqueta: d.demarcacion,
    listaNominal: d.lista_nominal,
    promovidos: d.promovidos,
    metaVotos: d.meta_votos,
  };
}

/**
 * El total del territorio a la vista es la suma de las demarcaciones que el usuario alcanza, no
 * una consulta aparte: sumar cinco renglones ya recortados no es armar una agregación, es leer lo
 * que la base ya agregó. Las sustitutas no entran porque la vista ya las dejó fuera.
 */
function sumarDemarcaciones(filas: DemarcacionResumen[]): MetaAvance {
  const hayMeta = filas.some((d) => d.meta_votos != null);
  return {
    id: "total",
    etiqueta: "Total del territorio a la vista",
    listaNominal: filas.reduce((acc, d) => acc + d.lista_nominal, 0),
    promovidos: filas.reduce((acc, d) => acc + d.promovidos, 0),
    metaVotos: hayMeta ? filas.reduce((acc, d) => acc + (d.meta_votos ?? 0), 0) : null,
  };
}

/** Avance contra la meta, de 0 a 1. Nulo mientras la meta no esté cargada. */
function avanceDe(fila: MetaAvance): number | null {
  return fila.metaVotos ? Math.min(1, fila.promovidos / fila.metaVotos) : null;
}

/** Las tres celdas de meta y avance de un renglón: lista nominal, promovidos / meta y la barra. */
function CeldasMetaAvance({ fila }: { fila: MetaAvance }) {
  const avance = avanceDe(fila);
  const porcentaje = Math.round((avance ?? 0) * 100);
  return (
    <>
      <td className="num">{cifra(fila.listaNominal)}</td>
      <td className="cifras whitespace-nowrap">
        {cifra(fila.promovidos)}
        {" / "}
        {fila.metaVotos != null ? (
          cifra(fila.metaVotos)
        ) : (
          <span className="text-tinta-tenue">—</span>
        )}
      </td>
      <td>
        <div className="flex items-center gap-3">
          <BarraAvance
            valor={avance ?? 0}
            descripcion={
              avance != null
                ? `${porcentaje} por ciento de la meta en ${fila.etiqueta}`
                : `Meta sin cargar en ${fila.etiqueta}`
            }
            className="w-28 shrink-0"
          />
          <span className="cifras w-9 shrink-0">
            {avance != null ? `${porcentaje}%` : <span className="text-tinta-tenue">—</span>}
          </span>
        </div>
      </td>
    </>
  );
}

/** Renglón de una caja de contexto: rótulo, cifra y, si aplica, su barra. */
function Medidor({
  etiqueta,
  valor,
  avance,
  descripcion,
}: {
  etiqueta: string;
  valor: string;
  avance?: number;
  descripcion?: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 text-tinta">{etiqueta}</span>
        <span className="cifras shrink-0 font-semibold text-tinta">{valor}</span>
      </div>
      {avance != null && <BarraAvance valor={avance} descripcion={descripcion ?? etiqueta} />}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * a) y c) Secciones prioritarias, con sus colonias al abrirlas
 * ------------------------------------------------------------------------- */

/** Pendientes primero, para que salte a la vista qué falta por recorrer. */
function ordenarPorPendiente(filas: SeccionResumen[]): SeccionResumen[] {
  return [...filas].sort(
    (a, b) => Number(a.recorrida) - Number(b.recorrida) || a.clave.localeCompare(b.clave),
  );
}

function NotaSeccion({ seccion, tieneGeometria }: { seccion: SeccionResumen; tieneGeometria: boolean }) {
  if (seccion.es_sustituta) {
    return <span className="ml-2 pildora">Referencia</span>;
  }
  if (!tieneGeometria) {
    return <span className="ml-2 pildora hueco-punteado">Sin polígono</span>;
  }
  return null;
}

function PanelColonias({ estado }: { estado: ColoniaDeSeccion[] | "cargando" | undefined }) {
  if (estado === undefined || estado === "cargando") {
    return <p className="px-4 py-3 text-xs text-tinta-tenue">Cargando colonias…</p>;
  }
  if (estado.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-tinta-tenue">
        Sin colonias registradas para esta sección.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 px-4 py-3">
      {estado.map((c) => (
        <li key={c.colonia_id} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-tinta-suave">
            {c.colonia}
            {c.cp && <span className="text-tinta-tenue"> · cp {c.cp}</span>}
          </span>
          <span className="cifras shrink-0 text-tinta-tenue">{c.traslape_pct.toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

/** La clave de una sección con su flecha de abrir y sus notas. Igual en las tres tablas. */
function CeldaClave({ seccion, abierta }: { seccion: SeccionResumen; abierta: boolean }) {
  return (
    <td className="whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        <ChevronRight
          className={cn(
            "transicion-ui size-3.5 shrink-0 text-tinta-tenue transition-transform",
            abierta && "rotate-90",
          )}
          aria-hidden
        />
        <span className="cifras font-medium text-tinta">{seccion.clave}</span>
      </span>
      <NotaSeccion seccion={seccion} tieneGeometria={seccion.tiene_geometria} />
    </td>
  );
}

function ListaPrioridad({
  titulo,
  filas,
  seccionAbierta,
  colonias,
  onAlternar,
}: {
  titulo: string;
  filas: SeccionResumen[];
  seccionAbierta: string | null;
  colonias: Record<string, ColoniaDeSeccion[] | "cargando">;
  onAlternar: (seccion: SeccionResumen) => void;
}) {
  const pendientes = filas.filter((s) => !s.recorrida).length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-sm font-semibold text-tinta">{titulo}</h3>
        <p className="cifras text-xs text-tinta-suave">
          {filas.length} secciones · {pendientes} por recorrer
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="tarjeta px-4 py-4 text-sm text-tinta-tenue">
          Sin secciones clasificadas todavía en esta prioridad.
        </p>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla min-w-[40rem]">
            <thead>
              <tr>
                <th>Sección</th>
                <th>Demarcación</th>
                <th className="num">Lista nominal</th>
                <th className="num">Promovidos</th>
                <th className="num">Meta</th>
                <th>Recorrida</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((s) => {
                const abierta = seccionAbierta === s.clave;
                return (
                  <Fragment key={s.clave}>
                    <tr
                      onClick={() => onAlternar(s)}
                      aria-expanded={abierta}
                      className="renglon-activo h-11"
                    >
                      <CeldaClave seccion={s} abierta={abierta} />
                      <td className="text-tinta-suave">{s.demarcacion}</td>
                      <td className="num">{cifra(s.lista_nominal)}</td>
                      <td className="num">{cifra(s.promovidos)}</td>
                      <td className="num">{cifra(s.meta_votos)}</td>
                      <td>
                        {s.recorrida ? <Estado vivo>Recorrida</Estado> : <Estado>Por recorrer</Estado>}
                      </td>
                    </tr>
                    {abierta && (
                      <tr className="bg-superficie-hundida/40">
                        <td colSpan={6} className="p-0!">
                          <PanelColonias estado={colonias[s.clave]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Territorio() {
  const { actuante } = useActuante();
  const [abierta, setAbierta] = useState<number | null>(null);
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(null);
  const [colonias, setColonias] = useState<Record<string, ColoniaDeSeccion[] | "cargando">>({});

  const demarcaciones = useConsulta<DemarcacionResumen[]>(
    () => demarcacionesResumen(actuante),
    [],
    [actuante.id],
  );
  const secciones = useConsulta<SeccionResumen[]>(
    () => seccionesResumen(actuante),
    [],
    [actuante.id],
  );

  const sinResponsable = secciones.datos.filter((s) => !s.responsable_id).length;

  /* b) Lista nominal, meta y promovidos los suma v_demarcacion_resumen, no el navegador. */
  const metaAvance = useMemo<MetaAvance[]>(() => {
    const porDemarcacion = demarcaciones.datos.map(deDemarcacion);
    if (demarcaciones.datos.length <= 1) return porDemarcacion;
    return [sumarDemarcaciones(demarcaciones.datos), ...porDemarcacion];
  }, [demarcaciones.datos]);

  const prioridadA = useMemo(
    () => ordenarPorPendiente(secciones.datos.filter((s) => s.prioridad === "A")),
    [secciones.datos],
  );
  const prioridadB = useMemo(
    () => ordenarPorPendiente(secciones.datos.filter((s) => s.prioridad === "B")),
    [secciones.datos],
  );

  function alternarSeccion(seccion: SeccionResumen) {
    setSeccionAbierta((actual) => (actual === seccion.clave ? null : seccion.clave));
    if (colonias[seccion.clave]) return;
    setColonias((c) => ({ ...c, [seccion.clave]: "cargando" }));
    coloniasDeSeccionConTraslape(actuante, seccion.clave, seccion.demarcacion_id).then((r) => {
      setColonias((c) => ({ ...c, [seccion.clave]: r.datos }));
    });
  }

  const cargando = demarcaciones.cargando || secciones.cargando;

  // Mismo portón que Actividades y Personas: la estructura territorial es una vista agregada de
  // las catorce demarcaciones, y el brigadista no alcanza ninguna. Su territorio no es un
  // polígono, son las actividades a las que lo invitan.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Estructura territorial" />;
  }

  /* Lo que alimenta las fichas y las cajas ya estaba contado arriba: aquí solo se acomoda. */
  const total = metaAvance.find((f) => f.id === "total");
  const resumen: MetaAvance | undefined = metaAvance[0];
  const totalSecciones = secciones.datos.length;
  const conResponsable = totalSecciones - sinResponsable;
  const recorridasA = prioridadA.filter((s) => s.recorrida).length;
  const recorridasB = prioridadB.filter((s) => s.recorrida).length;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Estructura territorial"
        apoyo={
          <span className="cifras">
            {cargando
              ? "Cargando…"
              : `${demarcaciones.datos.length} demarcaciones · ${totalSecciones} secciones · ${sinResponsable} sin responsable`}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaCifra
          icono={Layers}
          etiqueta="Total del territorio a la vista"
          valor={resumen?.listaNominal}
          pie="en lista nominal"
          cargando={cargando}
        />
        <TarjetaCifra
          icono={IconoMapa}
          etiqueta="Demarcaciones"
          valor={demarcaciones.datos.length}
          pie="a la vista"
          cargando={cargando}
        />
        <TarjetaCifra
          icono={ClipboardList}
          etiqueta="Secciones"
          valor={totalSecciones}
          pie={cargando ? undefined : <span className="cifras">{sinResponsable} sin responsable</span>}
          cargando={cargando}
        />
        <TarjetaCifra
          icono={Megaphone}
          etiqueta="Promovidos"
          valor={resumen?.promovidos}
          pie={
            cargando || !resumen ? undefined : resumen.metaVotos != null ? (
              <span className="cifras">de una meta de {cifra(resumen.metaVotos)}</span>
            ) : (
              "Meta todavía sin cargar"
            )
          }
          cargando={cargando}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* b) Meta y avance, y la lista de demarcaciones, en una sola tabla. El indicador existe
            aunque la meta llegue vacía: el hueco queda a la vista en vez de escondido. */}
        <div className="flex min-w-0 flex-col gap-3">
          {cargando ? (
            <div className="tarjeta flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-11 esqueleto rounded-control" />
              ))}
            </div>
          ) : demarcaciones.datos.length === 0 ? (
            <p className="tarjeta px-4 py-4 text-sm text-tinta-tenue">Sin territorio a la vista.</p>
          ) : (
            <div className="tarjeta overflow-x-auto">
              <table className="tabla min-w-[46rem]">
                <thead>
                  <tr>
                    <th>Demarcación</th>
                    <th className="num">Lista nominal</th>
                    <th>Promovidos / meta</th>
                    <th>Avance</th>
                    <th className="num">Secciones</th>
                    <th className="num">Alcanzadas</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {total && (
                    <tr className="h-11 font-semibold">
                      <td>{total.etiqueta}</td>
                      <CeldasMetaAvance fila={total} />
                      <td className="num">{totalSecciones}</td>
                      <td />
                      <td />
                    </tr>
                  )}
                  {demarcaciones.datos.map((d) => {
                    const suyas = secciones.datos.filter(
                      (s) => s.demarcacion_id === d.demarcacion_id,
                    );
                    const expandida = abierta === d.demarcacion_id;
                    return (
                      <Fragment key={d.demarcacion_id}>
                        {/* El clic vive en el renglón; el botón de la primera celda le da foco,
                            teclado y aria-expanded, y su clic sube hasta aquí. */}
                        <tr
                          onClick={() => setAbierta(expandida ? null : d.demarcacion_id)}
                          className="renglon-activo"
                        >
                          <td className="py-0!">
                            <button
                              type="button"
                              aria-expanded={expandida}
                              className="flex min-h-12 w-full flex-col justify-center py-1.5 text-left"
                            >
                              <span className="font-medium text-tinta">{d.demarcacion}</span>
                              <span className="cifras text-xs font-normal text-tinta-suave">
                                {d.secciones_sin_responsable} sin responsable
                              </span>
                            </button>
                          </td>
                          <CeldasMetaAvance fila={deDemarcacion(d)} />
                          <td className="num">{d.secciones}</td>
                          <td className="num">{d.personas.toLocaleString("es-MX")}</td>
                          <td className="w-10">
                            <ChevronDown
                              className={cn(
                                "transicion-ui size-4 text-tinta-tenue transition-transform",
                                expandida && "rotate-180",
                              )}
                              aria-hidden
                            />
                          </td>
                        </tr>

                        {expandida && (
                          <tr>
                            <td colSpan={7} className="pt-0!">
                              <div className="overflow-x-auto rounded-control bg-superficie-hundida">
                                <table className="tabla min-w-[38rem]">
                                  <thead>
                                    <tr>
                                      <th>Sección</th>
                                      <th>Responsable</th>
                                      <th className="num">Personas alcanzadas</th>
                                      <th className="num">Actividades</th>
                                      <th>Última</th>
                                      <th>Próxima</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {suyas.map((s) => {
                                      const filaAbierta = seccionAbierta === s.clave;
                                      return (
                                        <Fragment key={s.clave}>
                                          <tr
                                            onClick={() => alternarSeccion(s)}
                                            aria-expanded={filaAbierta}
                                            className="transicion-ui h-11 cursor-pointer transition-colors hover:bg-superficie/70"
                                          >
                                            <CeldaClave seccion={s} abierta={filaAbierta} />
                                            <td className="text-tinta-suave">
                                              {s.responsable ?? (
                                                <span className="pildora hueco-punteado">
                                                  Sin responsable
                                                </span>
                                              )}
                                            </td>
                                            <td className="num">{s.personas}</td>
                                            <td className="num text-tinta-suave">
                                              {s.reuniones + s.activismo + s.recorridos}
                                            </td>
                                            <td className="whitespace-nowrap text-tinta-suave">
                                              {fechaCorta(s.ultima_actividad)}
                                            </td>
                                            <td className="whitespace-nowrap text-tinta-suave">
                                              {fechaCorta(s.proxima_actividad)}
                                            </td>
                                          </tr>
                                          {filaAbierta && (
                                            <tr className="bg-superficie/50">
                                              <td colSpan={6} className="p-0!">
                                                <PanelColonias estado={colonias[s.clave]} />
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-tinta-tenue">
            La meta de votos todavía no está cargada por el cliente; el indicador ya está listo
            para cuando llegue.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Caja icono={ChartPie} titulo="Distribución del territorio">
            <Medidor
              etiqueta="Con responsable"
              valor={cargando ? "—" : conResponsable.toLocaleString("es-MX")}
              avance={cargando || totalSecciones === 0 ? 0 : conResponsable / totalSecciones}
              descripcion={`${conResponsable} de ${totalSecciones} secciones con responsable`}
            />
            <Medidor
              etiqueta="Sin responsable"
              valor={cargando ? "—" : sinResponsable.toLocaleString("es-MX")}
            />
          </Caja>

          <Caja icono={Flag} titulo="Secciones prioritarias">
            <Medidor
              etiqueta="Prioridad A recorridas"
              valor={cargando ? "—" : `${recorridasA} de ${prioridadA.length}`}
              avance={prioridadA.length === 0 ? 0 : recorridasA / prioridadA.length}
              descripcion={`${recorridasA} de ${prioridadA.length} secciones de prioridad A recorridas`}
            />
            <Medidor
              etiqueta="Prioridad B recorridas"
              valor={cargando ? "—" : `${recorridasB} de ${prioridadB.length}`}
              avance={prioridadB.length === 0 ? 0 : recorridasB / prioridadB.length}
              descripcion={`${recorridasB} de ${prioridadB.length} secciones de prioridad B recorridas`}
            />
          </Caja>

          <Caja icono={Info} titulo="Sobre los datos">
            <p className="text-sm leading-relaxed text-tinta-suave">
              Cabecera Municipal concentra 86 de las 169 secciones del catálogo. La desproporción
              es del territorio, no de los datos.{" "}
              <Link
                href="/mapa"
                className="font-semibold text-naranja-texto underline-offset-4 hover:underline"
              >
                Verlo en el mapa
              </Link>
            </p>
          </Caja>
        </div>
      </div>

      {/* a) y c) Secciones prioritarias, después de lo que ya existe. A y B en listas separadas,
          cada una con su propio conteo. Al abrir una sección se ven sus colonias, igual que
          arriba: es el mismo dato, en el mismo lugar de la pantalla. */}
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-base font-semibold text-tinta">Secciones prioritarias</h2>
          <p className="mt-1 text-xs text-tinta-tenue">
            La clasificación A y B es la que manda para dónde va primero el recorrido.
          </p>
        </header>
        {cargando ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 esqueleto rounded-tarjeta" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <ListaPrioridad
              titulo="Prioridad A"
              filas={prioridadA}
              seccionAbierta={seccionAbierta}
              colonias={colonias}
              onAlternar={alternarSeccion}
            />
            <ListaPrioridad
              titulo="Prioridad B"
              filas={prioridadB}
              seccionAbierta={seccionAbierta}
              colonias={colonias}
              onAlternar={alternarSeccion}
            />
          </div>
        )}
      </section>
    </div>
  );
}
