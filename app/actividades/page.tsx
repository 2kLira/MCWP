"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { puedeCrear } from "@/lib/permisos";
import { useConsulta } from "@/lib/usar-consulta";
import { demarcacionPorId } from "@/lib/demarcaciones";
import {
  ETIQUETA_ESTATUS,
  ETIQUETA_TIPO_ACTIVIDAD,
  type EstatusActividad,
  type TipoActividad,
} from "@/lib/tipos";
import { listarActividades, type Actividad } from "@/lib/datos/actividades";
import { Hoja } from "@/components/actividades/hoja";
import { FormularioActividad } from "@/components/actividades/formulario-actividad";

const TIPOS: TipoActividad[] = ["reunion", "activismo", "recorrido", "crucero"];
const ESTATUS: EstatusActividad[] = ["programada", "en_curso", "realizada", "cancelada"];

function fechaCorta(fecha: string, hora: string | null): string {
  const texto = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
  return hora ? `${texto} · ${hora.slice(0, 5)}` : texto;
}

export default function Actividades() {
  const { actuante } = useActuante();
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoActividad | "">("");
  const [estatus, setEstatus] = useState<EstatusActividad | "">("");
  const [abierta, setAbierta] = useState(false);

  const actividades = useConsulta<Actividad[]>(
    () =>
      listarActividades(actuante, {
        tipo: tipo || undefined,
        estatus: estatus || undefined,
      }),
    [],
    [actuante.id, tipo, estatus],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl">Actividades</h1>
          <p className="cifras text-sm text-tinta-suave">
            {actividades.cargando
              ? "Cargando…"
              : `${actividades.datos.length.toLocaleString("es-MX")} en esta vista`}
          </p>
        </div>
        {/* Única acción primaria de la pantalla. */}
        {puedeCrear(actuante, "actividad") && (
          <button
            type="button"
            onClick={() => setAbierta(true)}
            className="transicion-ui inline-flex items-center gap-2 rounded-control bg-naranja px-4 text-sm font-medium text-tinta toque-actividad"
          >
            <Plus className="size-4" aria-hidden />
            Nueva actividad
          </button>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoActividad | "")}
          className="campo w-auto"
        >
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_ACTIVIDAD[t]}
            </option>
          ))}
        </select>
        <select
          value={estatus}
          onChange={(e) => setEstatus(e.target.value as EstatusActividad | "")}
          className="campo w-auto"
        >
          <option value="">Todos los estatus</option>
          {ESTATUS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTATUS[e]}
            </option>
          ))}
        </select>
      </div>

      <div className="vidrio filo rounded-tarjeta">
        {actividades.cargando ? (
          <ul className="divide-y divide-borde">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-[72px] animate-pulse bg-superficie-hundida/50" />
            ))}
          </ul>
        ) : actividades.datos.length === 0 ? (
          <p className="p-6 text-sm text-tinta-suave">
            No hay actividades que coincidan con estos filtros.
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {actividades.datos.map((a) => {
              const demarcacion = demarcacionPorId(a.demarcacion_id)?.nombre;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/actividades/${a.id}` as never)}
                    className="transicion-ui flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-superficie-hundida"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">
                        {a.nombre}
                      </span>
                      <span className="block truncate text-xs text-tinta-suave">
                        {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
                        {a.seccion_clave && (
                          <>
                            {" · "}
                            <span className="cifras">Sección {a.seccion_clave}</span>
                          </>
                        )}
                        {demarcacion && ` · ${demarcacion}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="cifras text-xs text-tinta-suave">
                        {fechaCorta(a.fecha, a.hora)}
                      </span>
                      <span className="pildora">{ETIQUETA_ESTATUS[a.estatus]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Hoja titulo="Nueva actividad" abierta={abierta} alCerrar={() => setAbierta(false)}>
        <FormularioActividad
          alCrear={(id) => {
            setAbierta(false);
            router.push(`/actividades/${id}` as never);
          }}
        />
      </Hoja>
    </div>
  );
}
