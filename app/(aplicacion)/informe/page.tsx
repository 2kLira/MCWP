"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { PortonAgenda } from "@/components/porton-agenda";
import { useActuante } from "@/components/proveedor-actuante";
import { estatusVisibles, puedeCrear, puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import {
  BRIGADA_INFORME,
  ETIQUETA_BRIGADA,
  ETIQUETA_ESTATUS,
  ETIQUETA_TIPO_ACTIVIDAD,
  TIPOS_ACTIVIDAD,
  type EstatusActividad,
  type TipoActividad,
} from "@/lib/tipos";
import { listarActividades, type Actividad } from "@/lib/datos/actividades";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Hoja } from "@/components/actividades/hoja";
import { FormularioActividad } from "@/components/actividades/formulario-actividad";
import { TablaActividades } from "@/components/actividades/tabla-actividades";

const NOMBRE = ETIQUETA_BRIGADA[BRIGADA_INFORME];

/**
 * Brigada informe (18 de noviembre de 2026). Un espacio aparte de Actividades: aquí se abren
 * actividades de cualquier tipo que pertenecen al informe, y no salen en la lista general. Cada una
 * tiene su ficha de siempre (invitar, capturar, cerrar) y el conjunto tiene su propio reporte.
 */
export default function BrigadaInforme() {
  const { actuante } = useActuante();
  const router = useRouter();

  const [tipo, setTipo] = useState<TipoActividad | "">("");
  const [estatus, setEstatus] = useState<EstatusActividad | "">("");
  const [abierta, setAbierta] = useState(false);

  const actividades = useConsulta<Actividad[]>(
    () =>
      listarActividades(actuante, {
        brigada: BRIGADA_INFORME,
        tipo: tipo || undefined,
        estatus: estatus || undefined,
      }),
    [],
    [actuante.id, tipo, estatus],
  );

  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo={NOMBRE} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo={NOMBRE}
        apoyo={
          <span className="cifras">
            {actividades.cargando
              ? "Cargando…"
              : `${actividades.datos.length.toLocaleString("es-MX")} ${
                  actividades.datos.length === 1 ? "actividad" : "actividades"
                } en esta vista`}
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
          {TIPOS_ACTIVIDAD.map((t) => (
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
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Link href={"/reportes/informe" as never} className="boton flex-1 sm:flex-none">
            <FileText className="size-4" aria-hidden />
            Reporte
          </Link>
          {/* Única acción primaria de la pantalla. */}
          {puedeCrear(actuante, "actividad") && (
            <button
              type="button"
              onClick={() => setAbierta(true)}
              className="boton-primario flex-1 sm:flex-none"
            >
              <Plus className="size-4" aria-hidden />
              Nueva actividad
            </button>
          )}
        </div>
      </div>

      <TablaActividades
        cargando={actividades.cargando}
        actividades={actividades.datos}
        vacio={
          tipo || estatus
            ? "No hay actividades del informe con estos filtros."
            : "Todavía no hay actividades del informe. Ábrelas con Nueva actividad."
        }
      />

      <Hoja
        titulo={`Nueva actividad · ${NOMBRE}`}
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
      >
        <FormularioActividad
          brigada={BRIGADA_INFORME}
          alCrear={(id) => {
            setAbierta(false);
            router.push(`/actividades/${id}` as never);
          }}
        />
      </Hoja>
    </div>
  );
}
