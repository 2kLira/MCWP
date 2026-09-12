import Link from "next/link";
import { formatearTelefono } from "@/lib/territorio";
import type { FilaBandeja } from "@/lib/datos/seguimientos";
import { tiempoSinAtender } from "@/components/seguimiento/utilidades";

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
  return (
    <div className="flex items-center gap-2 vidrio filo rounded-tarjeta p-3">
      <Link href={`/personas/${fila.persona_id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-tinta">{fila.nombre}</p>
        <p className="mt-0.5 truncate text-xs text-tinta-suave">
          {fila.telefono_norm && <span className="cifras">{formatearTelefono(fila.telefono_norm)}</span>}
          {fila.seccion_clave && (
            <>
              {fila.telefono_norm && " · "}
              <span className="cifras">Sección {fila.seccion_clave}</span>
            </>
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* La petición se marca más fuerte que las otras dos razones: es la que tiene a alguien
              esperando una respuesta concreta, no solo información. Mismo tratamiento que
              "Promovido" en la lista de personas: relleno naranja, texto casi negro. */}
          {fila.tiene_solicitud && (
            <span className="rounded-pildora bg-naranja px-2.5 py-0.5 text-xs font-medium text-tinta">
              Petición
            </span>
          )}
          {fila.quiere_participar && <span className="pildora">Quiere participar</span>}
          {fila.quiere_info && <span className="pildora">Quiere información</span>}
          <span className="text-xs text-tinta-tenue">
            Sin atender {tiempoSinAtender(fila.ultimo_seguimiento_fecha ?? fila.created_at)}
          </span>
        </div>
      </Link>

      {puedeRegistrar && (
        <button
          type="button"
          onClick={alRegistrar}
          className="transicion-ui toque-actividad shrink-0 rounded-control border border-borde px-3 text-sm font-medium text-tinta transition-colors hover:bg-superficie-hundida"
        >
          Registrar
        </button>
      )}
    </div>
  );
}
