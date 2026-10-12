"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PortonAgenda } from "@/components/porton-agenda";
import { useActuante } from "@/components/proveedor-actuante";
import { estatusVisibles, puedeCrear, puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { useConsulta } from "@/lib/usar-consulta";
import { demarcacionPorId } from "@/lib/demarcaciones";
import {
  ETIQUETA_ESTATUS,
  ETIQUETA_TIPO_ACTIVIDAD,
  type EstatusActividad,
  type TipoActividad,
} from "@/lib/tipos";
import { listarActividades, type Actividad } from "@/lib/datos/actividades";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Estado } from "@/components/sistema/estado";
import { Hoja } from "@/components/actividades/hoja";
import { FormularioActividad } from "@/components/actividades/formulario-actividad";

const TIPOS: TipoActividad[] = ["reunion", "activismo", "recorrido", "crucero"];

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

      <div className="tarjeta overflow-x-auto">
        {actividades.cargando ? (
          <ul className="divide-y divide-separador">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-[52px] animate-pulse bg-superficie-hundida/50" />
            ))}
          </ul>
        ) : actividades.datos.length === 0 ? (
          <p className="p-6 text-sm text-tinta-suave">
            No hay actividades que coincidan con estos filtros.
          </p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Actividad</th>
                <th scope="col" className="max-md:hidden">
                  Tipo
                </th>
                <th scope="col" className="max-md:hidden">
                  Fecha
                </th>
                <th scope="col" className="max-md:hidden">
                  Sección
                </th>
                <th scope="col">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {actividades.datos.map((a) => {
                const demarcacion = demarcacionPorId(a.demarcacion_id)?.nombre;
                const abrir = () => router.push(`/actividades/${a.id}` as never);
                return (
                  // El renglón entero abre la ficha con el puntero; el teclado y los lectores de
                  // pantalla entran por el botón del nombre, que es el mismo destino.
                  <tr key={a.id} onClick={abrir} className="renglon-activo">
                    <td className="w-full max-w-0 md:w-[32%]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrir();
                        }}
                        className="flex min-h-11 w-full flex-col justify-center text-left"
                      >
                        <span className="block max-w-full truncate font-semibold text-tinta">
                          {a.nombre}
                        </span>
                        {/* En celular las columnas de tipo y sección se pliegan aquí, y la fecha sube
                            sobre el estatus. */}
                        <span className="block max-w-full truncate text-xs text-tinta-suave md:hidden">
                          {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
                          {a.seccion_clave && (
                            <>
                              {" · "}
                              <span className="cifras">Sección {a.seccion_clave}</span>
                            </>
                          )}
                          {demarcacion && ` · ${demarcacion}`}
                        </span>
                      </button>
                    </td>
                    <td className="max-md:hidden">{ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}</td>
                    <td className="cifras whitespace-nowrap max-md:hidden">
                      {fechaCorta(a.fecha, a.hora)}
                    </td>
                    <td className="max-md:hidden">
                      {a.seccion_clave && <span className="cifras">{a.seccion_clave}</span>}
                      {demarcacion && (
                        <span className="block text-xs text-tinta-suave">{demarcacion}</span>
                      )}
                    </td>
                    <td className="max-md:text-right">
                      <span className="cifras mb-0.5 block whitespace-nowrap text-xs text-tinta-suave md:hidden">
                        {fechaCorta(a.fecha, a.hora)}
                      </span>
                      <Estado vivo={a.estatus === "en_curso"}>{ETIQUETA_ESTATUS[a.estatus]}</Estado>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
