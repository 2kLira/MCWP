"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  crearSeguimiento,
  type EstadoSeguimiento,
  type FilaBandeja,
  type TipoSeguimiento,
} from "@/lib/datos/seguimientos";
import { ETIQUETA_ESTADO_SEGUIMIENTO, ETIQUETA_TIPO_SEGUIMIENTO } from "@/components/seguimiento/utilidades";

const TIPOS: TipoSeguimiento[] = ["llamada", "whatsapp", "invitacion", "reunion", "otro"];
const ESTADOS: EstadoSeguimiento[] = ["pendiente", "en_seguimiento", "atendido"];

/**
 * Hoja para registrar un seguimiento desde el renglón de la bandeja: tipo, nota y estado. Al
 * guardar avisa al padre, que recarga la bandeja.
 */
export function HojaSeguimiento({
  fila,
  actuanteId,
  alCerrar,
  alGuardar,
}: {
  fila: FilaBandeja;
  actuanteId: string;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoSeguimiento>("llamada");
  const [estado, setEstado] = useState<EstadoSeguimiento>("en_seguimiento");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function guardar() {
    setGuardando(true);
    setAviso(null);
    crearSeguimiento({
      personaId: fila.persona_id,
      tipo,
      nota: nota.trim() || null,
      estado,
      responsableId: actuanteId,
    }).then((r) => {
      if (!r.datos) {
        setGuardando(false);
        setAviso(r.aviso ?? "No se pudo guardar el seguimiento.");
        return;
      }
      alGuardar();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-3 sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={alCerrar}
        className="absolute inset-0 bg-tinta/40"
      />
      <div className="transicion-panel relative w-full max-w-md rounded-hoja border border-borde bg-superficie p-4 elevacion-flotante">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-tinta-tenue">Registrar seguimiento</p>
            <h2 className="truncate text-lg font-semibold text-tinta">{fila.nombre}</h2>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-tinta-suave">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoSeguimiento)}
              className="campo"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_SEGUIMIENTO[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-tinta-suave">
            Estado
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoSeguimiento)}
              className="campo"
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO_SEGUIMIENTO[e]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-tinta-suave">
            Nota
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Qué se dijo o quedó pendiente"
              className="campo min-h-24 py-2"
            />
          </label>

          {aviso && <p className="text-sm text-alerta">{aviso}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={alCerrar}
              className="transicion-ui toque-actividad rounded-control border border-borde px-4 text-sm text-tinta-suave transition-colors hover:bg-superficie-hundida"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="transicion-ui toque-actividad rounded-control bg-tinta px-4 text-sm font-medium text-superficie disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar seguimiento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
