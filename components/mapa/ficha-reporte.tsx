"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { categoriaReporte } from "@/components/reportes/categorias";
import { firmarFotos } from "@/lib/datos/almacenamiento";
import {
  borrarReporte,
  marcarReporteAtendido,
  type ReporteTerritorio,
} from "@/lib/datos/reportes-territorio";
import { cn } from "@/lib/utils";
import { leerDuracionMs, prefiereMenosMovimiento } from "./tokens";

function fechaYHora(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Fila clave/valor, igual que en ficha-seccion.tsx. */
function Renglon({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="cifras text-sm font-medium text-tinta">{valor}</dd>
    </div>
  );
}

/**
 * Lo que se abre al tocar el pin de un reporte. Es la misma tarjeta de vidrio que la ficha de
 * sección (ficha-seccion.tsx): crece desde el pin, en celular es hoja que sube desde abajo y en
 * escritorio panel lateral. Así el mapa sigue a la vista detrás y se puede saltar de un pin a otro.
 *
 * Las dos acciones —marcar como atendido y borrar— solo se pintan para el administrador, que es a
 * quien las políticas se las permiten. Mostrárselas a otro rol sería un botón que siempre rebota.
 * Borrar pide confirmación en la misma tarjeta, sin diálogo del navegador: se borra de verdad, con
 * su foto, y no hay papelera.
 */
export function FichaReporte({
  reporte,
  origen,
  enMovimiento,
  puedeAdministrar,
  onCerrar,
  onQuitado,
}: {
  reporte: ReporteTerritorio;
  origen: { x: number; y: number };
  enMovimiento: boolean;
  puedeAdministrar: boolean;
  onCerrar: () => void;
  /** Se marcó como atendido o se borró: en los dos casos sale del mapa. */
  onQuitado: (id: string) => void;
}) {
  const { etiqueta, Icono } = categoriaReporte(reporte.categoria);

  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarBotonRef = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [origenLocal, setOrigenLocal] = useState({ x: origen.x, y: origen.y });
  const menosMovimientoRef = useRef(false);
  const duracionRef = useRef(240);

  // Misma entrada que la ficha de sección: crece desde el punto tocado con la curva del sistema.
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
    // Una sola vez al montar: cada reporte nuevo remonta la ficha (key en el padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Cierra con la animación de salida y después avisa al padre con `alTerminar`. */
  function salir(alTerminar: () => void) {
    if (menosMovimientoRef.current) {
      alTerminar();
      return;
    }
    setSaliendo(true);
    window.setTimeout(alTerminar, duracionRef.current);
  }

  useEffect(() => {
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") salir(onCerrar);
    }
    document.addEventListener("keydown", alTecla);
    cerrarBotonRef.current?.focus();
    return () => document.removeEventListener("keydown", alTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La cubeta es privada: la foto se firma al abrir la ficha y la firma caduca sola. Si no se
  // puede firmar, se queda el esqueleto en vez de una imagen rota.
  const [fotoFirmada, setFotoFirmada] = useState<string | null>(null);
  useEffect(() => {
    const ruta = reporte.foto_ruta;
    if (!ruta) return;
    let vivo = true;
    void firmarFotos([ruta]).then((mapa) => {
      if (vivo) setFotoFirmada(mapa.get(ruta) ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [reporte.foto_ruta]);

  const [ocupado, setOcupado] = useState<"atendiendo" | "borrando" | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function atender() {
    if (ocupado) return;
    setOcupado("atendiendo");
    setError(null);
    const r = await marcarReporteAtendido(reporte.id);
    if (!r.datos) {
      setOcupado(null);
      setError(r.aviso ?? "No se pudo marcar como atendido.");
      return;
    }
    salir(() => onQuitado(reporte.id));
  }

  async function borrar() {
    if (ocupado) return;
    setOcupado("borrando");
    setError(null);
    const r = await borrarReporte(reporte.id);
    if (!r.datos) {
      setOcupado(null);
      setError(r.aviso ?? "No se pudo borrar el reporte.");
      return;
    }
    salir(() => onQuitado(reporte.id));
  }

  const visible = abierta && !saliendo;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Reporte: ${etiqueta}`}
      style={{ transformOrigin: `${origenLocal.x}px ${origenLocal.y}px` }}
      className={cn(
        "vidrio elevacion-flotante transicion-panel fixed z-30 flex flex-col overflow-hidden",
        "inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-h-[62vh] rounded-t-hoja",
        "md:inset-x-auto md:right-6 md:top-24 md:bottom-auto md:max-h-[calc(100dvh-7.5rem)] md:w-[400px] md:rounded-tarjeta",
        enMovimiento && "vidrio-en-movimiento",
        visible ? "scale-100 opacity-100" : "scale-[0.35] opacity-0",
      )}
    >
      {/* Tirador decorativo de la hoja, solo visible en celular. */}
      <div className="flex shrink-0 justify-center pt-2 md:hidden">
        <span aria-hidden className="h-1 w-10 rounded-pildora bg-tinta-tenue/40" />
      </div>

      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2 md:px-5 md:pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tinta text-fondo">
            <Icono className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-tinta">{etiqueta}</p>
            <p className="cifras truncate text-sm text-tinta-suave">
              {reporte.seccion_clave ? `Sección ${reporte.seccion_clave}` : "Fuera de sección"}
            </p>
          </div>
        </div>
        <button
          ref={cerrarBotonRef}
          type="button"
          onClick={() => salir(onCerrar)}
          aria-label="Cerrar ficha del reporte"
          className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 md:px-5 md:pb-5">
        {reporte.foto_ruta &&
          (fotoFirmada ? (
            <a
              href={fotoFirmada}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir la foto en tamaño original"
              className="block overflow-hidden rounded-control border border-borde"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoFirmada}
                alt={`Foto del reporte: ${etiqueta}`}
                className="max-h-64 w-full bg-superficie-hundida object-cover"
              />
            </a>
          ) : (
            <div className="aspect-[4/3] w-full animate-pulse rounded-control bg-superficie-hundida" />
          ))}

        <p className="whitespace-pre-line text-sm text-tinta">{reporte.descripcion}</p>

        <dl className="grid grid-cols-2 gap-3 border-t border-borde pt-4">
          <Renglon etiqueta="Lo levantó" valor={reporte.autor?.nombre ?? "Sin dato"} />
          <Renglon etiqueta="Fecha" valor={fechaYHora(reporte.created_at)} />
        </dl>

        {error && (
          <p role="alert" className="text-sm text-alerta">
            {error}
          </p>
        )}

        {puedeAdministrar &&
          (confirmandoBorrar ? (
            <div className="flex flex-col gap-3 rounded-control border border-alerta/40 bg-alerta/10 p-3">
              <p className="flex items-start gap-2 text-sm text-alerta">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Se borra para siempre{reporte.foto_ruta ? ", con su foto" : ""}. No se puede
                deshacer.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={borrar}
                  disabled={ocupado !== null}
                  className="boton flex-1 text-alerta!"
                >
                  <Trash2 className="size-4" aria-hidden />
                  {ocupado === "borrando" ? "Borrando…" : "Sí, borrar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrar(false)}
                  disabled={ocupado !== null}
                  className="boton flex-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 border-t border-borde pt-4">
              <button
                type="button"
                onClick={atender}
                disabled={ocupado !== null}
                className="boton-primario"
              >
                <CircleCheck className="size-4" aria-hidden />
                {ocupado === "atendiendo" ? "Marcando…" : "Marcar como atendido"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirmandoBorrar(true);
                }}
                disabled={ocupado !== null}
                className="boton text-alerta!"
              >
                <Trash2 className="size-4" aria-hidden />
                Borrar reporte
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
