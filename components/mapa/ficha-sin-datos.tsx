"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserX, X } from "lucide-react";
import type { CeldaSinDatos } from "@/lib/datos/contactos-anonimos";
import { RADIO_DIFUMINADO_M } from "@/lib/territorio";
import { ETIQUETA_GENERO, ETIQUETA_RANGO_EDAD } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { leerDuracionMs, prefiereMenosMovimiento } from "./tokens";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Lo que se abre al tocar un círculo de contactos sin datos: todo lo que dijo la gente de esa
 * zona. Misma tarjeta de vidrio que la ficha de reporte (ficha-reporte.tsx): crece desde el punto
 * tocado, en celular es hoja que sube desde abajo y en escritorio panel lateral.
 *
 * No trae acciones. No hay a quién llamar, y corregir un contacto sin datos no tiene caso: lo que
 * se lee aquí es para saber qué pide la zona, no para darle seguimiento a alguien.
 */
export function FichaSinDatos({
  celda,
  origen,
  enMovimiento,
  onCerrar,
}: {
  celda: CeldaSinDatos;
  origen: { x: number; y: number };
  enMovimiento: boolean;
  onCerrar: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarBotonRef = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [origenLocal, setOrigenLocal] = useState({ x: origen.x, y: origen.y });
  const menosMovimientoRef = useRef(false);
  const duracionRef = useRef(240);

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
    // Una sola vez al montar: cada celda nueva remonta la ficha (key en el padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function salir() {
    if (menosMovimientoRef.current) {
      onCerrar();
      return;
    }
    setSaliendo(true);
    window.setTimeout(onCerrar, duracionRef.current);
  }

  useEffect(() => {
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") salir();
    }
    document.addEventListener("keydown", alTecla);
    cerrarBotonRef.current?.focus();
    return () => document.removeEventListener("keydown", alTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = celda.contactos.length;
  const titulo = total === 1 ? "1 contacto sin datos" : `${total} contactos sin datos`;
  const visible = abierta && !saliendo;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
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
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-naranja-suave text-naranja-texto">
            <UserX className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-tinta">{titulo}</p>
            <p className="cifras truncate text-sm text-tinta-suave">
              {celda.seccionClave ? `Sección ${celda.seccionClave} · ` : ""}a unos{" "}
              {RADIO_DIFUMINADO_M} m
              {celda.conPeticion > 0 &&
                ` · ${celda.conPeticion} ${celda.conPeticion === 1 ? "petición" : "peticiones"}`}
            </p>
          </div>
        </div>
        <button
          ref={cerrarBotonRef}
          type="button"
          onClick={salir}
          aria-label="Cerrar ficha de contactos sin datos"
          className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <ol className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 md:px-5 md:pb-5">
        {celda.contactos.map((c) => {
          const quien = [
            c.genero ? ETIQUETA_GENERO[c.genero] : null,
            c.rango_edad ? `${ETIQUETA_RANGO_EDAD[c.rango_edad]} años` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={c.id}
              className="flex flex-col gap-1.5 border-t border-borde py-3 first:border-t-0 first:pt-1 last:pb-0"
            >
              <p className="cifras text-xs text-tinta-suave">
                {fecha(c.created_at)}
                {quien && ` · ${quien}`}
              </p>
              {/* La petición va primero y en tinta: es lo que alguien pidió que se hiciera. */}
              {c.peticion && (
                <p className="whitespace-pre-line text-sm font-medium text-tinta">{c.peticion}</p>
              )}
              {c.problematicas.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {c.problematicas.map((p) => (
                    <li
                      key={p}
                      className="rounded-pildora bg-superficie-hundida px-2.5 py-0.5 text-xs text-tinta"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {c.comentario && (
                <p className="whitespace-pre-line text-sm text-tinta-suave">{c.comentario}</p>
              )}
              {!c.peticion && c.problematicas.length === 0 && !c.comentario && (
                <p className="text-sm text-tinta-tenue">Sin nada anotado.</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
