"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { Download, Search, Star } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES, demarcacionPorId } from "@/lib/demarcaciones";
import { alcanceDe } from "@/lib/permisos";
import { edadDesde, etiquetaEdad } from "@/lib/personas";
import { formatearTelefono } from "@/lib/territorio";
import { nombreCompartido, useNavegarConTransicion } from "@/lib/transicion";
import { descargarCsv } from "@/lib/csv";
import {
  listarPersonas,
  listarPromovidosExportar,
  type PersonaEnLista,
  type PromovidoExportable,
} from "@/lib/datos/personas";
import { ETIQUETA_GENERO, GENEROS, type Genero } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const PAGINA = 300;

/** Columnas del CSV de promovidos, en el orden que pidió el cliente. */
const COLUMNAS_PROMOVIDOS = [
  { llave: "nombre", etiqueta: "Nombre" },
  { llave: "telefono", etiqueta: "Teléfono" },
  { llave: "seccion", etiqueta: "Sección" },
  { llave: "colonia", etiqueta: "Colonia" },
  { llave: "demarcacion", etiqueta: "Demarcación" },
  { llave: "genero", etiqueta: "Género" },
  { llave: "edad", etiqueta: "Edad" },
  { llave: "promovido_desde", etiqueta: "Fecha en que se marcó como promovido" },
];

/** Fila cruda de la exportación, ya con nombres de columna en español y nada por calcular en Excel. */
function filaPromovidoExportable(p: PromovidoExportable) {
  return {
    nombre: p.nombre,
    telefono: formatearTelefono(p.telefono_norm),
    seccion: p.seccion_clave ?? "",
    colonia: p.colonias?.nombre ?? "",
    demarcacion: demarcacionPorId(p.demarcacion_id)?.nombre ?? "",
    genero: p.genero ? ETIQUETA_GENERO[p.genero] : "",
    edad: edadDesde(p.fecha_nacimiento) ?? "",
    promovido_desde: p.promovido_en ? format(new Date(p.promovido_en), "dd/MM/yyyy") : "",
  };
}

export default function Personas() {
  const { actuante } = useActuante();
  const navegar = useNavegarConTransicion();
  const alcance = alcanceDe(actuante);

  const [texto, setTexto] = useState("");
  const [demarcacionId, setDemarcacionId] = useState<number | null>(null);
  const [seccionTexto, setSeccionTexto] = useState("");
  const [participar, setParticipar] = useState(false);
  const [info, setInfo] = useState(false);
  const [promovido, setPromovido] = useState(false);
  const [representante, setRepresentante] = useState(false);
  const [genero, setGenero] = useState<Genero | null>(null);

  const [filas, setFilas] = useState<PersonaEnLista[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);

  const contenedor = useRef<HTMLDivElement>(null);

  // Búsqueda con retardo, para no consultar en cada tecla.
  const [textoDiferido, setTextoDiferido] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTextoDiferido(texto), 250);
    return () => clearTimeout(id);
  }, [texto]);

  // Cuatro dígitos con ceros, igual que la clave de sección en todo el sistema. Se completa aquí
  // para que "524" y "0524" filtren lo mismo sin obligar a teclear el cero.
  const seccionClave = useMemo(() => {
    const digitos = seccionTexto.replace(/\D/g, "");
    return digitos ? digitos.padStart(4, "0") : null;
  }, [seccionTexto]);

  const filtrosActivos = useMemo(
    () => ({
      texto: textoDiferido || undefined,
      demarcacionId,
      seccionClave,
      quiereParticipar: participar || undefined,
      quiereInfo: info || undefined,
      promovido: promovido || undefined,
      representante: representante || undefined,
      genero,
    }),
    [textoDiferido, demarcacionId, seccionClave, participar, info, promovido, representante, genero],
  );

  useEffect(() => {
    let vigente = true;
    listarPersonas(actuante, filtrosActivos, { desde: 0, limite: PAGINA }).then((r) => {
      if (!vigente) return;
      setFilas(r.datos.filas);
      setTotal(r.datos.total);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [actuante, filtrosActivos]);

  const virtual = useVirtualizer({
    count: filas.length,
    getScrollElement: () => contenedor.current,
    estimateSize: () => 76,
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

  // Descarga los promovidos con los mismos filtros que están activos en pantalla: lo que se ve
  // es lo que se baja. es_promovido siempre en verdadero, lo pida o no el filtro "Promovido".
  async function exportarPromovidos() {
    setExportando(true);
    const r = await listarPromovidosExportar(actuante, filtrosActivos);
    descargarCsv("promovidos", COLUMNAS_PROMOVIDOS, r.datos.map(filaPromovidoExportable));
    setExportando(false);
  }

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] max-w-lista flex-col gap-4 md:h-[calc(100dvh-8.5rem)]">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl text-tinta">Personas alcanzadas</h1>
          <p className="cifras mt-1 text-sm text-tinta-suave">
            {cargando ? "Contando…" : `${total.toLocaleString("es-MX")} alcanzadas`}
          </p>
        </div>
        <button
          type="button"
          onClick={exportarPromovidos}
          disabled={exportando}
          className="transicion-ui inline-flex min-h-11 items-center gap-1.5 rounded-control border border-borde bg-superficie px-3 text-sm font-medium text-tinta transition-colors hover:bg-superficie-hundida disabled:opacity-50"
        >
          <Download className="size-4" aria-hidden />
          {exportando ? "Exportando…" : "Exportar promovidos"}
        </button>
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
          <input
            value={seccionTexto}
            onChange={(e) => setSeccionTexto(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            placeholder="Sección"
            aria-label="Filtrar por clave de sección"
            className="campo cifras w-24"
          />
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
        className="panel min-h-0 flex-1 overflow-y-auto"
      >
        {cargando ? (
          <ul className="divide-y divide-separador">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="h-[76px] animate-pulse bg-superficie-hundida/50" />
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
                  className="transicion-ui absolute left-0 flex w-full items-center justify-between gap-4 border-b border-separador px-4 text-left transition-colors hover:bg-superficie-hundida"
                  style={{
                    top: item.start,
                    height: item.size,
                  }}
                >
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[0.9375rem] font-medium text-tinta"
                      style={{ viewTransitionName: nombreCompartido(persona.id) }}
                    >
                      {persona.nombre}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-tinta-suave">
                      <span className="truncate">
                        {persona.seccion_clave && (
                          <span className="cifras">Sección {persona.seccion_clave}</span>
                        )}
                        {demarcacion && ` · ${demarcacion}`}
                        {/* La edad ocupa espacio que a 360px ya no sobra; entra a partir de 640. */}
                        {edad && <span className="cifras hidden sm:inline"> · {edad}</span>}
                      </span>
                      {persona.quiere_ser_representante && (
                        <span
                          title="Quiere ser representante"
                          className="shrink-0 text-naranja-texto"
                        >
                          <Star className="size-3" aria-hidden />
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="cifras block text-sm text-tinta-suave">
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
        <p className="text-center text-sm text-tinta-suave">
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
        "transicion-ui min-h-11 rounded-control border px-3 text-sm transition-colors",
        activo
          ? "border-transparent bg-naranja-suave font-semibold text-naranja-texto"
          : "border-borde bg-superficie font-medium text-tinta-suave hover:bg-superficie-hundida hover:text-tinta",
      )}
    >
      {etiqueta}
    </button>
  );
}
