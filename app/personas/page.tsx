"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Star } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES, demarcacionPorId } from "@/lib/demarcaciones";
import { alcanceDe } from "@/lib/permisos";
import { etiquetaEdad } from "@/lib/personas";
import { formatearTelefono } from "@/lib/territorio";
import { nombreCompartido, useNavegarConTransicion } from "@/lib/transicion";
import { listarPersonas, type PersonaEnLista } from "@/lib/datos/personas";
import { ETIQUETA_GENERO, GENEROS, type Genero } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const PAGINA = 300;

export default function Personas() {
  const { actuante } = useActuante();
  const navegar = useNavegarConTransicion();
  const alcance = alcanceDe(actuante);

  const [texto, setTexto] = useState("");
  const [demarcacionId, setDemarcacionId] = useState<number | null>(null);
  const [participar, setParticipar] = useState(false);
  const [info, setInfo] = useState(false);
  const [promovido, setPromovido] = useState(false);
  const [representante, setRepresentante] = useState(false);
  const [genero, setGenero] = useState<Genero | null>(null);

  const [filas, setFilas] = useState<PersonaEnLista[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);

  const contenedor = useRef<HTMLDivElement>(null);

  // Búsqueda con retardo, para no consultar en cada tecla.
  const [textoDiferido, setTextoDiferido] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTextoDiferido(texto), 250);
    return () => clearTimeout(id);
  }, [texto]);

  useEffect(() => {
    let vigente = true;
    listarPersonas(
      actuante,
      {
        texto: textoDiferido || undefined,
        demarcacionId,
        quiereParticipar: participar || undefined,
        quiereInfo: info || undefined,
        promovido: promovido || undefined,
        representante: representante || undefined,
        genero,
      },
      { desde: 0, limite: PAGINA },
    ).then((r) => {
      if (!vigente) return;
      setFilas(r.datos.filas);
      setTotal(r.datos.total);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [actuante, textoDiferido, demarcacionId, participar, info, promovido, representante, genero]);

  const virtual = useVirtualizer({
    count: filas.length,
    getScrollElement: () => contenedor.current,
    estimateSize: () => 68,
    overscan: 8,
  });

  const demarcacionesVisibles = useMemo(() => {
    if (alcance.tipo === "todo") return DEMARCACIONES;
    if (alcance.tipo === "demarcacion") {
      return DEMARCACIONES.filter((d) => d.id === alcance.demarcacionId);
    }
    if (alcance.tipo === "seccion" && alcance.demarcacionId) {
      return DEMARCACIONES.filter((d) => d.id === alcance.demarcacionId);
    }
    return [];
  }, [alcance]);

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-4 md:h-[calc(100dvh-9rem)]">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl">Personas</h1>
          <p className="cifras text-sm text-tinta-suave">
            {cargando ? "Contando…" : `${total.toLocaleString("es-MX")} registradas`}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre o teléfono"
            className="campo pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {demarcacionesVisibles.length > 1 && (
            <select
              value={demarcacionId ?? ""}
              onChange={(e) => setDemarcacionId(e.target.value ? Number(e.target.value) : null)}
              className="campo w-auto"
            >
              <option value="">Todas las demarcaciones</option>
              {demarcacionesVisibles.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          )}
          <select
            value={genero ?? ""}
            onChange={(e) => setGenero((e.target.value || null) as Genero | null)}
            className="campo w-auto"
          >
            <option value="">Todos los géneros</option>
            {GENEROS.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GENERO[g]}
              </option>
            ))}
          </select>
          <Filtro etiqueta="Quiere participar" activo={participar} alCambiar={setParticipar} />
          <Filtro etiqueta="Quiere información" activo={info} alCambiar={setInfo} />
          <Filtro etiqueta="Promovido" activo={promovido} alCambiar={setPromovido} />
          <Filtro
            etiqueta="Quiere ser representante"
            activo={representante}
            alCambiar={setRepresentante}
          />
        </div>
      </div>

      <div
        ref={contenedor}
        className="min-h-0 flex-1 overflow-y-auto vidrio filo rounded-tarjeta"
      >
        {cargando ? (
          <ul className="divide-y divide-borde">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="h-[68px] animate-pulse bg-superficie-hundida/50" />
            ))}
          </ul>
        ) : filas.length === 0 ? (
          <p className="p-6 text-sm text-tinta-suave">
            No hay personas que coincidan con estos filtros.
          </p>
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((item) => {
              const persona = filas[item.index];
              const demarcacion = demarcacionPorId(persona.demarcacion_id)?.nombre;
              const edad = etiquetaEdad(persona.fecha_nacimiento);
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => navegar(`/personas/${persona.id}` as never)}
                  className="transicion-ui absolute left-0 flex w-full items-center justify-between gap-3 border-b border-borde px-4 text-left transition-colors hover:bg-superficie-hundida"
                  style={{
                    top: item.start,
                    height: item.size,
                  }}
                >
                  <span className="min-w-0">
                    <span
                      className="block truncate text-sm font-medium text-tinta"
                      style={{ viewTransitionName: nombreCompartido(persona.id) }}
                    >
                      {persona.nombre}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-xs text-tinta-suave">
                      <span className="truncate">
                        {persona.seccion_clave && (
                          <span className="cifras">Sección {persona.seccion_clave}</span>
                        )}
                        {demarcacion && ` · ${demarcacion}`}
                        {/* La edad ocupa espacio que a 390px ya no sobra; se reserva para 1280+. */}
                        {edad && <span className="cifras hidden xl:inline"> · {edad}</span>}
                      </span>
                      {persona.quiere_ser_representante && (
                        <span
                          title="Quiere ser representante"
                          className="shrink-0 text-tinta-tenue"
                        >
                          <Star className="size-3" aria-hidden />
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="cifras block text-xs text-tinta-suave">
                      {formatearTelefono(persona.telefono_norm)}
                    </span>
                    <span className="mt-1 flex justify-end gap-1">
                      {persona.es_promovido && (
                        <span className="rounded-pildora bg-naranja px-2.5 py-0.5 text-xs font-medium text-tinta">
                          Promovido
                        </span>
                      )}
                      {persona.quiere_participar && <span className="pildora">Participa</span>}
                      {persona.quiere_info && <span className="pildora">Info</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {total > filas.length && (
        <p className="text-center text-xs text-tinta-tenue">
          Mostrando las primeras {filas.length.toLocaleString("es-MX")} de{" "}
          {total.toLocaleString("es-MX")}. Afina la búsqueda para acercarte.
        </p>
      )}
    </div>
  );
}

function Filtro({
  etiqueta,
  activo,
  alCambiar,
}: {
  etiqueta: string;
  activo: boolean;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => alCambiar(!activo)}
      className={cn(
        "transicion-ui rounded-control border px-3 text-sm transition-colors toque-actividad",
        activo
          ? "border-tinta bg-tinta text-superficie"
          : "border-borde bg-superficie text-tinta-suave",
      )}
    >
      {etiqueta}
    </button>
  );
}
