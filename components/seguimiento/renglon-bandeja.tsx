import Link from "next/link";
import { formatearTelefono } from "@/lib/territorio";
import type { FilaBandeja } from "@/lib/datos/seguimientos";
import { Estado } from "@/components/sistema/estado";
import {
  ETIQUETA_ESTADO_SEGUIMIENTO,
  tiempoSinAtender,
} from "@/components/seguimiento/utilidades";

/**
 * Las columnas de la bandeja en escritorio: persona, motivo, sección, espera, último seguimiento y
 * la acción. El encabezado y cada renglón comparten esta rejilla para que no se desalineen.
 */
const REJILLA =
  "lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.7fr)_4.5rem_minmax(0,1fr)_minmax(0,1.2fr)_6.75rem] lg:gap-x-4";
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

/** Un renglón de la bandeja: nombre, teléfono, sección, interés y desde cuándo está sin atender. */
export function RenglonBandeja({
  fila,
  puedeRegistrar,
  alRegistrar,
}: {
  fila: FilaBandeja;
  puedeRegistrar: boolean;
  alRegistrar: () => void;
}) {
  const espera = tiempoSinAtender(fila.ultimo_seguimiento_fecha ?? fila.created_at);

  return (
    <div className={`flex items-center ${REJILLA}`}>
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

        {/* La petición se marca más fuerte que las otras dos razones: es la que tiene a alguien
            esperando una respuesta concreta, no solo información. El naranja de esta lista se
            reserva para "Sin atender", así que aquí el peso lo da la tinta. */}
        <p className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-sm text-tinta-suave">
          {fila.tiene_solicitud && <span className="font-medium text-tinta">Petición</span>}
          {fila.quiere_participar && <span>Quiere participar</span>}
          {fila.quiere_info && <span>Quiere información</span>}
        </p>

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

        <span className="min-w-0">
          <Estado vivo={!fila.ultimo_seguimiento_estado}>
            {fila.ultimo_seguimiento_estado
              ? ETIQUETA_ESTADO_SEGUIMIENTO[fila.ultimo_seguimiento_estado]
              : "Sin atender"}
          </Estado>
        </span>
      </Link>

      {puedeRegistrar && (
        <div className="shrink-0 pr-4 lg:pr-4">
          <button type="button" onClick={alRegistrar} className="boton">
            Registrar
          </button>
        </div>
      )}
    </div>
  );
}
