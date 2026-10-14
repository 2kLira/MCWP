"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { Download, Search, Star } from "lucide-react";
import { PortonAgenda } from "@/components/porton-agenda";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Estado } from "@/components/sistema/estado";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES, demarcacionPorId } from "@/lib/demarcaciones";
import { alcanceDe, puedeVerListadosGenerales } from "@/lib/puertas-ui";
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

/** Alto de cada renglón de la lista virtualizada, en píxeles. */
const ALTO_RENGLON = 56;

/**
 * Columnas de la lista desde 1024 px: nombre, teléfono, sección, demarcación, quién la registró,
 * (edad) y estatus.
 * La comparten el encabezado y cada renglón para que no se desalineen.
 */
const REJILLA =
  "gap-x-4 lg:grid-cols-[minmax(0,1.5fr)_7.5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_14.5rem] xl:grid-cols-[minmax(0,1.5fr)_7.5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_14.5rem]";

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
    estimateSize: () => ALTO_RENGLON,
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

  // Mismo portón que Actividades. El brigadista solo tiene su agenda, y aquí RLS le devuelve
  // cero filas: sin el portón vería un listado vacío con el buscador y nueve filtros encima.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Personas alcanzadas" />;
  }

  return (
    // En escritorio la pantalla ocupa el alto visible (el relleno de <main> suma 4.5rem) y la lista
    // se desplaza por dentro. En celular los filtros se apilan y se comerían la lista, así que ahí
    // la tarjeta lleva su propio alto y la página se desplaza.
    <div className="flex flex-col gap-5 md:h-[calc(100dvh-4.5rem)]">
      <EncabezadoPagina
        titulo="Personas alcanzadas"
        apoyo={
          <span className="cifras">
            {cargando ? "Contando…" : `${total.toLocaleString("es-MX")} alcanzadas`}
          </span>
        }
      />

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-1 basis-60">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nombre o teléfono"
              className="campo pl-10"
            />
          </div>
          <button
            type="button"
            onClick={exportarPromovidos}
            disabled={exportando}
            className="boton"
          >
            <Download className="size-4" aria-hidden />
            {exportando ? "Exportando…" : "Exportar promovidos"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {demarcacionesVisibles.length > 1 && (
            <select
              value={demarcacionId ?? ""}
              onChange={(e) => setDemarcacionId(e.target.value ? Number(e.target.value) : null)}
              className="campo w-auto max-w-full"
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
            className="campo w-auto max-w-full"
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

      <div className="tarjeta flex h-[70dvh] flex-col overflow-hidden md:h-auto md:min-h-64 md:flex-1">
        {/* Encabezado de columnas: solo donde los renglones se acomodan en rejilla. Queda fuera
            del contenedor que se desplaza para no tener que fijarlo sobre el vidrio. */}
        <div
          aria-hidden
          className={cn(
            "hidden px-4 pb-[0.6875rem] pt-[0.8125rem] text-xs font-medium text-tinta-suave lg:grid",
            REJILLA,
          )}
        >
          <span>Nombre</span>
          <span>Teléfono</span>
          <span>Sección</span>
          <span>Demarcación</span>
          <span>Registró</span>
          <span className="hidden text-right xl:block">Edad</span>
          <span>Estatus</span>
        </div>

        <div ref={contenedor} className="min-h-0 flex-1 overflow-y-auto">
          {cargando ? (
            <ul>
              {Array.from({ length: 8 }).map((_, i) => (
                <li
                  key={i}
                  className={cn(
                    "animate-pulse border-separador bg-superficie-hundida/50 lg:border-t",
                    i > 0 && "border-t",
                  )}
                  style={{ height: ALTO_RENGLON }}
                />
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
                const estatus = (
                  <>
                    {persona.es_promovido && <Estado vivo>Promovido</Estado>}
                    {persona.quiere_participar && <Estado>Participa</Estado>}
                    {persona.quiere_info && <Estado>Info</Estado>}
                  </>
                );
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => navegar(`/personas/${persona.id}` as never)}
                    className={cn(
                      "renglon-activo absolute left-0 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center border-separador px-4 text-left text-sm lg:border-t",
                      item.index > 0 && "border-t",
                      REJILLA,
                    )}
                    style={{
                      top: item.start,
                      height: item.size,
                    }}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="block truncate font-semibold text-tinta"
                          style={{ viewTransitionName: nombreCompartido(persona.id) }}
                        >
                          {persona.nombre}
                        </span>
                        {persona.quiere_ser_representante && (
                          <span
                            title="Quiere ser representante"
                            className="hidden shrink-0 text-tinta-tenue lg:inline-flex"
                          >
                            <Star className="size-3" aria-hidden />
                          </span>
                        )}
                      </span>
                      {/* En celular y tableta la sección y la demarcación van bajo el nombre. */}
                      <span className="flex min-w-0 items-center gap-1 text-xs text-tinta-suave lg:hidden">
                        <span className="truncate">
                          {persona.seccion_clave && (
                            <span className="cifras">Sección {persona.seccion_clave}</span>
                          )}
                          {demarcacion && ` · ${demarcacion}`}
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

                    <span className="shrink-0 text-right lg:hidden">
                      <span className="cifras block text-xs text-tinta-suave">
                        {formatearTelefono(persona.telefono_norm)}
                      </span>
                      <span className="mt-1 flex justify-end gap-2.5">{estatus}</span>
                    </span>

                    <span className="cifras hidden truncate text-tinta lg:block">
                      {formatearTelefono(persona.telefono_norm)}
                    </span>
                    <span className="cifras hidden text-tinta lg:block">
                      {persona.seccion_clave}
                    </span>
                    <span className="hidden truncate text-tinta lg:block">{demarcacion}</span>
                    {/* Quién la capturó. Sin nombre si quien mira no es admin: RLS sobre
                        `usuarios` solo le deja ver su propia fila. */}
                    <span className="hidden truncate text-tinta-suave lg:block">
                      {persona.registrador?.nombre ?? "—"}
                    </span>
                    {/* La edad ocupa espacio que antes de 1280 ya no sobra. */}
                    <span className="cifras hidden text-right text-tinta xl:block">{edad}</span>
                    <span className="hidden min-w-0 items-center gap-3 overflow-hidden lg:flex">
                      {estatus}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {total > filas.length && (
        <p className="text-xs text-tinta-tenue">
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
      className="chip"
    >
      {etiqueta}
    </button>
  );
}
