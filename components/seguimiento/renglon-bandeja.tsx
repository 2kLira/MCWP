"use client";

import Link from "next/link";
import { formatearTelefono } from "@/lib/territorio";
import type { FilaBandeja } from "@/lib/datos/seguimientos";
import { Estado } from "@/components/sistema/estado";
import {
  ETIQUETA_ESTADO_SEGUIMIENTO,
  tiempoSinAtender,
} from "@/components/seguimiento/utilidades";
import {
  BotonesContacto,
  FranjaResultado,
  useContactoRapido,
  type MedioContacto,
} from "@/components/seguimiento/contacto-rapido";

/**
 * Las columnas de la bandeja en escritorio: persona, motivo, sección, espera, último seguimiento y
 * las acciones. El encabezado y cada renglón comparten esta rejilla para que no se desalineen.
 */
const REJILLA =
  "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_4.5rem_minmax(0,1fr)_minmax(0,1.2fr)_12.5rem] lg:gap-x-4";
const CELDAS = "lg:col-span-5 lg:grid lg:grid-cols-subgrid lg:gap-x-4";

/** Los rótulos de las columnas. Solo en escritorio: en celular el renglón se apila y se explica solo. */
export function EncabezadoBandeja() {
  return (
    <div aria-hidden className={`hidden text-xs font-medium text-tinta-suave ${REJILLA}`}>
      <div className={`px-4 pb-[0.6875rem] pt-[0.8125rem] ${CELDAS}`}>
        <span>Persona</span>
        <span>Motivo</span>
        <span>Sección</span>
        <span>Espera</span>
        <span>Último seguimiento</span>
      </div>
    </div>
  );
}

/**
 * Un renglón de la bandeja: quién es, por qué espera, desde cuándo y qué pasó la última vez. Con
 * teléfono, WhatsApp y Llamar dejan el resultado a un toque; Registrar abre la hoja completa.
 */
export function RenglonBandeja({
  fila,
  puedeRegistrar,
  actuanteId,
  alRegistrar,
  alGuardar,
}: {
  fila: FilaBandeja;
  puedeRegistrar: boolean;
  actuanteId: string;
  alRegistrar: (medio?: MedioContacto) => void;
  alGuardar: () => void;
}) {
  const espera = tiempoSinAtender(fila.ultimo_seguimiento_fecha ?? fila.created_at);
  const contacto = useContactoRapido({ personaId: fila.persona_id, actuanteId, alGuardar });

  // Lo que la persona dijo, para atender sin abrir la ficha. Lo urgente manda sobre la petición.
  const detalle = fila.urgente_contactar ? fila.urgente_motivo : fila.ultima_solicitud;

  return (
    <div className="flex flex-col">
      <div className={`flex items-center max-lg:flex-col max-lg:items-stretch ${REJILLA}`}>
        <Link
          href={`/personas/${fila.persona_id}`}
          className={`renglon-activo flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 lg:items-center lg:gap-y-0 ${CELDAS}`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-tinta">{fila.nombre}</p>
            {fila.telefono_norm && (
              <p className="cifras mt-0.5 truncate text-xs text-tinta-suave">
                {formatearTelefono(fila.telefono_norm)}
              </p>
            )}
          </div>

          {/* La petición se marca más fuerte que las otras razones: es la que tiene a alguien
              esperando una respuesta concreta, no solo información. El naranja de esta lista se
              reserva para "Sin atender", así que aquí el peso lo da la tinta. */}
          <div className="min-w-0">
            <p className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-sm text-tinta-suave">
              {fila.urgente_contactar && <span className="font-medium text-alerta">Urgente</span>}
              {fila.tiene_solicitud && <span className="font-medium text-tinta">Petición</span>}
              {fila.quiere_participar && <span>Quiere participar</span>}
              {fila.quiere_info && <span>Quiere información</span>}
              {fila.quiere_barda_lona && <span>Barda o lona</span>}
            </p>
            {detalle && (
              <p className="mt-0.5 line-clamp-2 text-xs text-tinta" title={detalle}>
                {detalle}
              </p>
            )}
          </div>

          {/* En celular, sección y espera comparten línea; en escritorio cada una es su columna. */}
          <div className="flex min-w-0 flex-wrap gap-x-2 text-xs text-tinta-suave lg:contents lg:text-sm">
            <span className="cifras">
              {fila.seccion_clave && (
                <>
                  <span className="lg:hidden">Sección </span>
                  {fila.seccion_clave}
                </>
              )}
            </span>
            <span className="cifras lg:truncate">{espera}</span>
          </div>

          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <Estado vivo={!fila.ultimo_seguimiento_estado}>
              {fila.ultimo_seguimiento_estado
                ? ETIQUETA_ESTADO_SEGUIMIENTO[fila.ultimo_seguimiento_estado]
                : "Sin atender"}
            </Estado>
            {fila.intentos > 0 && (
              <span className="cifras truncate text-xs text-tinta-suave">
                {fila.ultimo_seguimiento_nota && `${fila.ultimo_seguimiento_nota} · `}
                {fila.intentos === 1 ? "1 intento" : `${fila.intentos} intentos`}
              </span>
            )}
          </span>
        </Link>

        {puedeRegistrar && (
          <div className="flex shrink-0 items-center gap-2 px-4 max-lg:pb-3 lg:justify-end lg:pl-0">
            {fila.telefono_norm && (
              <BotonesContacto telefono={fila.telefono_norm} contacto={contacto} />
            )}
            <button
              type="button"
              onClick={() => alRegistrar()}
              className="boton max-lg:flex-1"
            >
              Registrar
            </button>
          </div>
        )}
      </div>

      <FranjaResultado contacto={contacto} alDetallar={alRegistrar} className="mx-4 mb-3" />
    </div>
  );
}
