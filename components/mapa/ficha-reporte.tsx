"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { Hoja } from "@/components/actividades/hoja";
import { categoriaReporte } from "@/components/reportes/categorias";
import { marcarReporteAtendido, type ReporteTerritorio } from "@/lib/datos/reportes-territorio";

function fechaYHora(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Lo que se abre al tocar un reporte en el mapa. En celular sube desde abajo y en escritorio
 * flota al centro: es la misma Hoja del resto del sistema.
 *
 * "Marcar como atendido" solo se pinta para quien la política deja hacerlo (el administrador).
 * Mostrárselo a otro rol sería un botón que siempre rebota.
 */
export function FichaReporte({
  reporte,
  puedeAtender,
  onCerrar,
  onAtendido,
}: {
  reporte: ReporteTerritorio;
  puedeAtender: boolean;
  onCerrar: () => void;
  onAtendido: (id: string) => void;
}) {
  const { etiqueta, Icono } = categoriaReporte(reporte.categoria);
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function atender() {
    if (marcando) return;
    setMarcando(true);
    setError(null);
    const r = await marcarReporteAtendido(reporte.id);
    setMarcando(false);
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo marcar como atendido.");
      return;
    }
    onAtendido(reporte.id);
  }

  return (
    <Hoja titulo="Reporte" abierta alCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-3 text-base font-medium text-tinta">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tinta text-fondo">
            <Icono className="size-5" aria-hidden />
          </span>
          {etiqueta}
        </p>

        <p className="whitespace-pre-line text-sm text-tinta">{reporte.descripcion}</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-tinta-tenue">Lo levantó</dt>
          <dd className="text-tinta">{reporte.autor?.nombre ?? "Sin dato"}</dd>
          <dt className="text-tinta-tenue">Fecha</dt>
          <dd className="cifras text-tinta">{fechaYHora(reporte.created_at)}</dd>
        </dl>

        {error && (
          <p role="alert" className="text-sm text-alerta">
            {error}
          </p>
        )}

        {puedeAtender && (
          <button
            type="button"
            onClick={atender}
            disabled={marcando}
            className="transicion-ui flex items-center justify-center gap-2 rounded-control bg-naranja px-4 text-base font-medium text-sobre-naranja toque-actividad disabled:opacity-50"
          >
            <CircleCheck className="size-5" aria-hidden />
            {marcando ? "Marcando…" : "Marcar como atendido"}
          </button>
        )}
      </div>
    </Hoja>
  );
}
