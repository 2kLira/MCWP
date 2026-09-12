"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
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

function FilaMetaAvance({ fila }: { fila: MetaAvance }) {
  const avance = fila.metaVotos ? Math.min(1, fila.promovidos / fila.metaVotos) : null;
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 truncate text-sm text-tinta">{fila.etiqueta}</p>
        <p className="cifras shrink-0 text-xs text-tinta-suave">
          {cifra(fila.listaNominal)} en lista nominal
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-1.5 w-full max-w-[16rem] overflow-hidden rounded-pildora bg-superficie-hundida">
          {avance != null && (
            <div
              className="transicion-panel h-full rounded-pildora bg-naranja"
              style={{ width: `${Math.round(avance * 100)}%` }}
            />
          )}
        </div>
        <p className="cifras shrink-0 text-xs text-tinta-suave">
          <span className="font-medium text-tinta">{cifra(fila.promovidos)}</span> promovidos
          {" · meta "}
          {fila.metaVotos != null ? (
            <>
              <span className="font-medium text-tinta">{cifra(fila.metaVotos)}</span>{" "}
              ({Math.round((avance ?? 0) * 100)}%)
            </>
          ) : (
            <span className="text-tinta-tenue">—</span>
          )}
        </p>
      </div>
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
    <div className="vidrio filo overflow-hidden rounded-tarjeta">
      <div className="flex items-baseline justify-between gap-3 border-b border-borde px-4 py-3">
        <h3 className="text-sm font-medium text-tinta">{titulo}</h3>
        <p className="cifras text-xs text-tinta-suave">
          {filas.length} secciones · {pendientes} por recorrer
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-tinta-tenue">
          Sin secciones clasificadas todavía en esta prioridad.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="px-4 py-2 font-medium">Sección</th>
                <th className="px-4 py-2 font-medium">Demarcación</th>
                <th className="px-4 py-2 font-medium">Lista nominal</th>
                <th className="px-4 py-2 font-medium">Promovidos</th>
                <th className="px-4 py-2 font-medium">Meta</th>
                <th className="px-4 py-2 font-medium">Recorrida</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((s) => {
                const abierta = seccionAbierta === s.clave;
                return [
                    <tr
                      key={s.clave}
                      onClick={() => onAlternar(s)}
                      aria-expanded={abierta}
                      className="transicion-ui cursor-pointer border-t border-borde hover:bg-superficie-hundida"
                    >
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1">
                          <ChevronRight
                            className={cn(
                              "transicion-ui size-3.5 shrink-0 text-tinta-tenue transition-transform",
                              abierta && "rotate-90",
                            )}
                            aria-hidden
                          />
                          <span className="cifras font-medium text-tinta">{s.clave}</span>
                        </span>
                        <NotaSeccion seccion={s} tieneGeometria={s.tiene_geometria} />
                      </td>
                      <td className="px-4 py-2 text-tinta-suave">{s.demarcacion}</td>
                      <td className="cifras px-4 py-2">{cifra(s.lista_nominal)}</td>
                      <td className="cifras px-4 py-2">{cifra(s.promovidos)}</td>
                      <td className="cifras px-4 py-2">{cifra(s.meta_votos)}</td>
                      <td className="px-4 py-2">
                        {s.recorrida ? (
                          <span className="pildora">
                            <Check className="size-3" aria-hidden /> Recorrida
                          </span>
                        ) : (
                          <span className="pildora hueco-punteado">Por recorrer</span>
                        )}
                      </td>
                    </tr>,
                    abierta && (
                      <tr key={`${s.clave}-colonias`} className="border-t border-borde bg-superficie-hundida/40">
                        <td colSpan={6} className="p-0">
                          <PanelColonias estado={colonias[s.clave]} />
                        </td>
                      </tr>
                    ),
                  ];
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

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl">Estructura territorial</h1>
        <p className="cifras text-sm text-tinta-suave">
          {cargando
            ? "Cargando…"
            : `${demarcaciones.datos.length} demarcaciones · ${secciones.datos.length} secciones · ${sinResponsable} sin responsable`}
        </p>
      </header>

      {/* b) Indicadores de meta y avance. Existen desde ahora aunque la meta llegue vacía: es lo
          que se presenta en la junta, con el hueco a la vista en vez de escondido. */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-sm font-medium text-tinta-tenue">Meta y avance</h2>
          <p className="text-xs text-tinta-tenue">
            La meta de votos todavía no está cargada por el cliente; el indicador ya está listo
            para cuando llegue.
          </p>
        </div>
        <div className="vidrio filo divide-y divide-borde rounded-tarjeta px-4">
          {cargando ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse py-3">
                <div className="h-full rounded-control bg-superficie-hundida" />
              </div>
            ))
          ) : metaAvance.length === 0 ? (
            <p className="py-4 text-sm text-tinta-tenue">Sin territorio a la vista.</p>
          ) : (
            metaAvance.map((fila) => <FilaMetaAvance key={fila.id} fila={fila} />)
          )}
        </div>
      </section>

      {cargando ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-hundida" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {demarcaciones.datos.map((d) => {
            const suyas = secciones.datos.filter((s) => s.demarcacion_id === d.demarcacion_id);
            const expandida = abierta === d.demarcacion_id;
            return (
              <li
                key={d.demarcacion_id}
                className="vidrio filo overflow-hidden rounded-tarjeta"
              >
                <button
                  type="button"
                  aria-expanded={expandida}
                  onClick={() => setAbierta(expandida ? null : d.demarcacion_id)}
                  className="transicion-ui flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-superficie-hundida"
                >
                  <ChevronRight
                    className={cn(
                      "transicion-ui size-4 shrink-0 text-tinta-tenue transition-transform",
                      expandida && "rotate-90",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tinta">
                      {d.demarcacion}
                    </span>
                    <span className="cifras block text-xs text-tinta-suave">
                      {d.secciones} secciones · {d.secciones_sin_responsable} sin responsable
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="cifras block text-lg font-medium text-tinta">
                      {d.personas.toLocaleString("es-MX")}
                    </span>
                    <span className="block text-xs text-tinta-tenue">alcanzadas</span>
                  </span>
                </button>

                {expandida && (
                  <div className="overflow-x-auto border-t border-borde">
                    <table className="w-full min-w-[38rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-tinta-tenue">
                          <th className="px-4 py-2 font-medium">Sección</th>
                          <th className="px-4 py-2 font-medium">Responsable</th>
                          <th className="px-4 py-2 font-medium">Personas alcanzadas</th>
                          <th className="px-4 py-2 font-medium">Actividades</th>
                          <th className="px-4 py-2 font-medium">Última</th>
                          <th className="px-4 py-2 font-medium">Próxima</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suyas.map((s) => {
                          const filaAbierta = seccionAbierta === s.clave;
                          return [
                              <tr
                                key={s.clave}
                                onClick={() => alternarSeccion(s)}
                                aria-expanded={filaAbierta}
                                className="transicion-ui cursor-pointer border-t border-borde hover:bg-superficie-hundida"
                              >
                                <td className="px-4 py-2">
                                  <span className="inline-flex items-center gap-1">
                                    <ChevronRight
                                      className={cn(
                                        "transicion-ui size-3.5 shrink-0 text-tinta-tenue transition-transform",
                                        filaAbierta && "rotate-90",
                                      )}
                                      aria-hidden
                                    />
                                    <span className="cifras font-medium text-tinta">{s.clave}</span>
                                  </span>
                                  <NotaSeccion seccion={s} tieneGeometria={s.tiene_geometria} />
                                </td>
                                <td className="px-4 py-2 text-tinta-suave">
                                  {s.responsable ?? (
                                    <span className="pildora hueco-punteado">Sin responsable</span>
                                  )}
                                </td>
                                <td className="cifras px-4 py-2">{s.personas}</td>
                                <td className="cifras px-4 py-2 text-tinta-suave">
                                  {s.reuniones + s.activismo + s.recorridos}
                                </td>
                                <td className="px-4 py-2 text-tinta-suave">
                                  {fechaCorta(s.ultima_actividad)}
                                </td>
                                <td className="px-4 py-2 text-tinta-suave">
                                  {fechaCorta(s.proxima_actividad)}
                                </td>
                              </tr>,
                              filaAbierta && (
                                <tr key={`${s.clave}-colonias`} className="border-t border-borde bg-superficie-hundida/40">
                                  <td colSpan={6} className="p-0">
                                    <PanelColonias estado={colonias[s.clave]} />
                                  </td>
                                </tr>
                              ),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* a) y c) Secciones prioritarias, después de lo que ya existe. A y B en listas separadas,
          cada una con su propio conteo. Al abrir una sección se ven sus colonias, igual que
          arriba: es el mismo dato, en el mismo lugar de la pantalla. */}
      <section className="flex flex-col gap-3">
        <header>
          <h2 className="text-lg">Secciones prioritarias</h2>
          <p className="text-xs text-tinta-tenue">
            La clasificación A y B es la que manda para dónde va primero el recorrido.
          </p>
        </header>
        {cargando ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-tarjeta bg-superficie-hundida" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
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

      <p className="text-xs text-tinta-tenue">
        Cabecera Municipal concentra 86 de las 169 secciones del catálogo. La desproporción es del
        territorio, no de los datos.{" "}
        <Link href="/mapa" className="text-naranja-texto underline-offset-4 hover:underline">
          Verlo en el mapa
        </Link>
      </p>
    </div>
  );
}
