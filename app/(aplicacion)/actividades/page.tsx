"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PortonAgenda } from "@/components/porton-agenda";
import { useActuante } from "@/components/proveedor-actuante";
import {
  estatusVisibles,
  puedeCrear,
  puedeEditar,
  puedeVerListadosGenerales,
} from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import {
  ETIQUETA_ESTATUS,
  ETIQUETA_TIPO_ACTIVIDAD,
  type EstatusActividad,
  type TipoActividad,
} from "@/lib/tipos";
import { listarActividades, type Actividad } from "@/lib/datos/actividades";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Hoja } from "@/components/actividades/hoja";
import { TablaActividades } from "@/components/actividades/tabla-actividades";
import { FormularioActividad } from "@/components/actividades/formulario-actividad";
import { PorCerrar } from "@/components/actividades/por-cerrar";

const TIPOS: TipoActividad[] = ["reunion", "activismo", "recorrido", "crucero"];

export default function Actividades() {
  const { actuante } = useActuante();
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoActividad | "">("");
  const [estatus, setEstatus] = useState<EstatusActividad | "">("");
  const [abierta, setAbierta] = useState(false);
  // Sube cuando el panel de vencidas cancela una: la tabla de abajo tiene que enterarse.
  const [version, setVersion] = useState(0);

  const actividades = useConsulta<Actividad[]>(
    () =>
      listarActividades(actuante, {
        tipo: tipo || undefined,
        estatus: estatus || undefined,
      }),
    [],
    [actuante.id, tipo, estatus, version],
  );

  // El brigadista no navega el sistema por listados generales: se le manda a una actividad
  // concreta y captura ahí. Esta pantalla no es para él. El portón es el mismo párrafo que ya
  // había aquí, movido a components/porton-agenda.tsx para que las diez pantallas que lo
  // necesitan digan lo mismo, y ahora con el enlace de vuelta a la agenda.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Actividades" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Actividades"
        apoyo={
          <span className="cifras">
            {actividades.cargando
              ? "Cargando…"
              : `${actividades.datos.length.toLocaleString("es-MX")} en esta vista`}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
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
          {estatusVisibles(actuante).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTATUS[e]}
            </option>
          ))}
        </select>
        {/* Única acción primaria de la pantalla. */}
        {puedeCrear(actuante, "actividad") && (
          <button
            type="button"
            onClick={() => setAbierta(true)}
            className="boton-primario ml-auto"
          >
            <Plus className="size-4" aria-hidden />
            Nueva actividad
          </button>
        )}
      </div>

      {/* Solo para quien puede cerrar: al resto no le sirve saber qué falta para hacerlo. */}
      {puedeEditar(actuante, "actividad") && (
        <PorCerrar alCambiar={() => setVersion((v) => v + 1)} />
      )}

      <TablaActividades
        cargando={actividades.cargando}
        actividades={actividades.datos}
        vacio="No hay actividades que coincidan con estos filtros."
      />

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
