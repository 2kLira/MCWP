"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES } from "@/lib/demarcaciones";
import { alcanceDe, puedeCrear } from "@/lib/permisos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  bandeja,
  type EstadoSeguimiento,
  type FilaBandeja,
  type FiltrosBandeja,
  type MotivoBandeja,
  type TipoSeguimiento,
} from "@/lib/datos/seguimientos";
import {
  ETIQUETA_ESTADO_SEGUIMIENTO,
  ETIQUETA_TIPO_SEGUIMIENTO,
} from "@/components/seguimiento/utilidades";
import { RenglonBandeja } from "@/components/seguimiento/renglon-bandeja";
import { HojaSeguimiento } from "@/components/seguimiento/hoja-seguimiento";
import { cn } from "@/lib/utils";

const TIPOS: TipoSeguimiento[] = ["llamada", "whatsapp", "invitacion", "reunion", "otro"];
/**
 * Los únicos estados que la bandeja puede devolver. La vista v_bandeja_seguimiento solo trae a
 * quien no tiene seguimiento o lo tiene en pendiente: ofrecer "en seguimiento" y "atendido" sería
 * poner dos opciones que siempre devuelven cero, y un filtro que nunca encuentra nada se lee como
 * que no hay trabajo. Ver PENDIENTES.md.
 */
const ESTADOS: EstadoSeguimiento[] = ["pendiente"];

const ETIQUETA_MOTIVO: Record<MotivoBandeja, string> = {
  participa: "Quiere participar",
  info: "Quiere información",
  solicitud: "Dejó una petición",
};

export default function Seguimiento() {
  const { actuante } = useActuante();
  const alcance = alcanceDe(actuante);
  const [version, setVersion] = useState(0);
  const [filaAbierta, setFilaAbierta] = useState<FilaBandeja | null>(null);

  const [texto, setTexto] = useState("");
  const [demarcacionId, setDemarcacionId] = useState<number | null>(null);
  const [seccionTexto, setSeccionTexto] = useState("");
  const [motivo, setMotivo] = useState<MotivoBandeja | null>(null);
  const [estado, setEstado] = useState<EstadoSeguimiento | "sin_atender" | "">("");
  const [tipo, setTipo] = useState<TipoSeguimiento | "">("");

  // Búsqueda con retardo, igual que en Personas: no se consulta en cada tecla.
  const [textoDiferido, setTextoDiferido] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTextoDiferido(texto), 250);
    return () => clearTimeout(id);
  }, [texto]);

  // Cuatro dígitos con ceros, igual que la clave de sección en el resto del sistema.
  const seccionClave = useMemo(() => {
    const digitos = seccionTexto.replace(/\D/g, "");
    return digitos ? digitos.padStart(4, "0") : null;
  }, [seccionTexto]);

  const filtrosActivos = useMemo<FiltrosBandeja>(
    () => ({
      texto: textoDiferido || undefined,
      demarcacionId,
      seccionClave,
      motivo: motivo ?? undefined,
      estado: estado || undefined,
      tipo: tipo || undefined,
    }),
    [textoDiferido, demarcacionId, seccionClave, motivo, estado, tipo],
  );

  const hayFiltros = Boolean(
    filtrosActivos.texto ||
      filtrosActivos.demarcacionId ||
      filtrosActivos.seccionClave ||
      filtrosActivos.motivo ||
      filtrosActivos.estado ||
      filtrosActivos.tipo,
  );

  const consulta = useConsulta<FilaBandeja[]>(
    () => bandeja(actuante, filtrosActivos),
    [],
    [actuante.id, version, filtrosActivos],
  );

  const puedeRegistrar = puedeCrear(actuante, "seguimiento");

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

  function alGuardar() {
    setFilaAbierta(null);
    setVersion((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl">Seguimiento</h1>
        <p className="cifras text-sm text-tinta-suave">
          {consulta.cargando
            ? "Contando…"
            : `${consulta.datos.length.toLocaleString("es-MX")} personas por atender`}
        </p>
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
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoSeguimiento | "sin_atender" | "")}
            className="campo w-auto"
          >
            <option value="">Cualquier estado</option>
            <option value="sin_atender">Sin atender</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_SEGUIMIENTO[e]}
              </option>
            ))}
          </select>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoSeguimiento | "")}
            className="campo w-auto"
          >
            <option value="">Cualquier tipo</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_SEGUIMIENTO[t]}
              </option>
            ))}
          </select>

          {(Object.keys(ETIQUETA_MOTIVO) as MotivoBandeja[]).map((m) => (
            <FiltroMotivo
              key={m}
              etiqueta={ETIQUETA_MOTIVO[m]}
              activo={motivo === m}
              alCambiar={() => setMotivo(motivo === m ? null : m)}
            />
          ))}
        </div>
      </div>

      {consulta.cargando ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-24 animate-pulse rounded-tarjeta bg-superficie-hundida" />
          ))}
        </ul>
      ) : consulta.datos.length === 0 ? (
        <div className="hueco-punteado grid min-h-32 place-items-center rounded-tarjeta p-6 text-center text-sm">
          {hayFiltros
            ? "No hay resultados con esos filtros."
            : "Sin personas pendientes de atender en tu territorio."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {consulta.datos.map((fila) => (
            <li key={fila.persona_id}>
              <RenglonBandeja
                fila={fila}
                puedeRegistrar={puedeRegistrar}
                alRegistrar={() => setFilaAbierta(fila)}
              />
            </li>
          ))}
        </ul>
      )}

      {filaAbierta && (
        <HojaSeguimiento
          fila={filaAbierta}
          actuanteId={actuante.id}
          alCerrar={() => setFilaAbierta(null)}
          alGuardar={alGuardar}
        />
      )}
    </div>
  );
}

/** Píldora de filtro exclusiva: el mismo trazo que las de Personas, pero de una sola a la vez. */
function FiltroMotivo({
  etiqueta,
  activo,
  alCambiar,
}: {
  etiqueta: string;
  activo: boolean;
  alCambiar: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={alCambiar}
      className={cn(
        "transicion-ui rounded-control border px-3 text-sm transition-colors toque-actividad",
        activo
          ? "border-tinta bg-tinta text-superficie"
          : "border-borde bg-superficie text-tinta-suave",
      )}
    >
      {etiqueta}
    </button>
  );
}
