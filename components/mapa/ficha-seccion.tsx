"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { NOTA_SUSTITUTA } from "@/lib/tipos";
import type { RasgoSeccion } from "@/lib/territorio";
import { cn } from "@/lib/utils";
import type { DatoSeccion } from "./datos-mapa";
import { leerDuracionMs, prefiereMenosMovimiento } from "./tokens";

const formatoArea = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
const formatoCifra = new Intl.NumberFormat("es-MX");
const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatearFecha(iso: string | null): string {
  if (!iso) return "Sin dato";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "Sin dato";
  return formatoFecha.format(fecha);
}

/** Una fila clave/valor de la ficha. */
function Renglon({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="cifras text-sm font-medium text-tinta">{valor}</dd>
    </div>
  );
}

export function FichaSeccion({
  rasgo,
  dato,
  origen,
  enMovimiento,
  onCerrar,
}: {
  rasgo: RasgoSeccion;
  /** Resumen real de la sección, o null si la base todavía no tiene datos para ella. */
  dato: DatoSeccion | null;
  origen: { x: number; y: number };
  enMovimiento: boolean;
  onCerrar: () => void;
}) {
  const propiedades = rasgo.properties;
  const sinDato = "Sin dato";

  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarBotonRef = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [origenLocal, setOrigenLocal] = useState({ x: origen.x, y: origen.y });
  const menosMovimientoRef = useRef(false);
  const duracionRef = useRef(240);

  // La ficha en vidrio crece desde el punto de la pantalla donde ocurrió el clic (transform-origin,
  // convertido a coordenadas locales del panel) y anima escala y opacidad con la curva y duración
  // del sistema. En celular es hoja que sube desde abajo, en escritorio panel lateral flotante: la
  // posición cambia por breakpoint, la animación no.
  useLayoutEffect(() => {
    menosMovimientoRef.current = prefiereMenosMovimiento();
    duracionRef.current = leerDuracionMs("--dur-panel", 240);

    const nodo = panelRef.current;
    if (nodo) {
      const caja = nodo.getBoundingClientRect();
      setOrigenLocal({ x: origen.x - caja.left, y: origen.y - caja.top });
    }

    if (menosMovimientoRef.current) {
      setAbierta(true);
      return;
    }
    const cuadro = requestAnimationFrame(() => setAbierta(true));
    return () => cancelAnimationFrame(cuadro);
    // Se calcula una sola vez al montar: cada nueva selección remonta esta ficha (key en el padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cerrar() {
    if (menosMovimientoRef.current) {
      onCerrar();
      return;
    }
    setSaliendo(true);
    window.setTimeout(onCerrar, duracionRef.current);
  }

  useEffect(() => {
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrar();
    }
    document.addEventListener("keydown", alTecla);
    cerrarBotonRef.current?.focus();
    return () => document.removeEventListener("keydown", alTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = abierta && !saliendo;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Sección ${propiedades.clave}`}
      style={{ transformOrigin: `${origenLocal.x}px ${origenLocal.y}px` }}
      className={cn(
        "vidrio-flotante transicion-panel fixed z-30 flex flex-col overflow-hidden",
        "inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-h-[62vh] rounded-t-hoja",
        "md:inset-x-auto md:right-6 md:top-[calc(var(--alto-barra)+2rem)] md:bottom-6 md:max-h-none md:w-[400px] md:rounded-tarjeta",
        enMovimiento && "vidrio-en-movimiento",
        visible ? "scale-100 opacity-100" : "scale-[0.35] opacity-0",
      )}
    >
      {/* Tirador decorativo de la hoja, solo visible en celular. */}
      <div className="flex shrink-0 justify-center pt-2 md:hidden">
        <span aria-hidden className="h-1 w-10 rounded-pildora bg-tinta-tenue/40" />
      </div>

      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2 md:px-5 md:pt-4">
        <div className="min-w-0">
          <p className="cifras text-lg font-semibold text-tinta">{`Sección ${propiedades.clave}`}</p>
          <p className="truncate text-sm text-tinta-suave">{dato?.demarcacion ?? propiedades.demarcacion}</p>
        </div>
        <button
          ref={cerrarBotonRef}
          type="button"
          onClick={cerrar}
          aria-label="Cerrar ficha de sección"
          className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5 md:pb-5">
        {propiedades.sustituta && (
          <p className="hueco-punteado mb-4 rounded-control px-3 py-2 text-xs">{NOTA_SUSTITUTA}</p>
        )}

        {/* Solo se muestra la píldora cuando la sección sí es prioritaria: no hay una que diga
            "no prioritaria", la ausencia ya dice eso. */}
        {dato?.prioridad && (
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pildora bg-naranja px-2.5 py-0.5 text-xs font-medium text-tinta">
              {`Prioridad ${dato.prioridad}`}
            </span>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3 border-b border-borde pb-4">
          <Renglon etiqueta="Distrito local" valor={propiedades.distrito_local ?? sinDato} />
          <Renglon etiqueta="Distrito federal" valor={propiedades.distrito_federal ?? sinDato} />
          <Renglon
            etiqueta="Área"
            valor={
              propiedades.area_km2 != null
                ? `${formatoArea.format(propiedades.area_km2)} km²`
                : sinDato
            }
          />
          <Renglon etiqueta="Responsable" valor={dato?.responsable ?? sinDato} />
          <Renglon
            etiqueta="Lista nominal"
            valor={dato?.listaNominal != null ? formatoCifra.format(dato.listaNominal) : sinDato}
          />
          <Renglon etiqueta="Casillas" valor={dato ? formatoCifra.format(dato.casillas) : sinDato} />
        </dl>

        {dato ? (
          <>
            <dl className="grid grid-cols-2 gap-3 border-b border-borde py-4">
              <Renglon etiqueta="Personas alcanzadas" valor={formatoCifra.format(dato.personas)} />
              <Renglon etiqueta="Promovidos" valor={formatoCifra.format(dato.promovidos)} />
              <Renglon
                etiqueta="Quieren participar"
                valor={formatoCifra.format(dato.quierenParticipar)}
              />
              <Renglon etiqueta="Reuniones" valor={formatoCifra.format(dato.reuniones)} />
              <Renglon etiqueta="Activismo" valor={formatoCifra.format(dato.activismo)} />
              <Renglon etiqueta="Recorridos" valor={formatoCifra.format(dato.recorridos)} />
            </dl>

            <dl className="grid grid-cols-2 gap-3 pt-4">
              <Renglon etiqueta="Última actividad" valor={formatearFecha(dato.ultimaActividad)} />
              <Renglon etiqueta="Próxima actividad" valor={formatearFecha(dato.proximaActividad)} />
            </dl>
          </>
        ) : (
          <p className="pt-4 text-sm text-tinta-suave">
            Todavía no hay datos capturados para esta sección.
          </p>
        )}

        {propiedades.nota && <p className="mt-4 text-xs text-tinta-suave">{propiedades.nota}</p>}
      </div>
    </div>
  );
}
