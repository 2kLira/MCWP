"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { useConsulta } from "@/lib/usar-consulta";
import {
  demarcacionesResumen,
  seccionesResumen,
  type DemarcacionResumen,
  type SeccionResumen,
} from "@/lib/datos/catalogos";
import { cn } from "@/lib/utils";

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

export default function Territorio() {
  const { actuante } = useActuante();
  const [abierta, setAbierta] = useState<number | null>(null);

  const demarcaciones = useConsulta<DemarcacionResumen[]>(
    () => demarcacionesResumen(actuante),
    [],
    [actuante.id],
  );
  const secciones = useConsulta<SeccionResumen[]>(
    () => seccionesResumen(actuante),
    [],
    [actuante.id],
  );

  const sinResponsable = secciones.datos.filter((s) => !s.responsable_id).length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl">Estructura territorial</h1>
        <p className="cifras text-sm text-tinta-suave">
          {demarcaciones.cargando
            ? "Cargando…"
            : `${demarcaciones.datos.length} demarcaciones · ${secciones.datos.length} secciones · ${sinResponsable} sin responsable`}
        </p>
      </header>

      {demarcaciones.cargando ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-hundida" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {demarcaciones.datos.map((d) => {
            const suyas = secciones.datos.filter((s) => s.demarcacion_id === d.demarcacion_id);
            const expandida = abierta === d.demarcacion_id;
            return (
              <li
                key={d.demarcacion_id}
                className="overflow-hidden rounded-tarjeta border border-borde bg-superficie"
              >
                <button
                  type="button"
                  aria-expanded={expandida}
                  onClick={() => setAbierta(expandida ? null : d.demarcacion_id)}
                  className="transicion-ui flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-superficie-hundida"
                >
                  <ChevronRight
                    className={cn(
                      "transicion-ui size-4 shrink-0 text-tinta-tenue transition-transform",
                      expandida && "rotate-90",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tinta">
                      {d.demarcacion}
                    </span>
                    <span className="cifras block text-xs text-tinta-suave">
                      {d.secciones} secciones · {d.secciones_sin_responsable} sin responsable
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="cifras block text-lg font-medium text-tinta">
                      {d.personas.toLocaleString("es-MX")}
                    </span>
                    <span className="block text-xs text-tinta-tenue">personas</span>
                  </span>
                </button>

                {expandida && (
                  <div className="overflow-x-auto border-t border-borde">
                    <table className="w-full min-w-[38rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-tinta-tenue">
                          <th className="px-4 py-2 font-medium">Sección</th>
                          <th className="px-4 py-2 font-medium">Responsable</th>
                          <th className="px-4 py-2 font-medium">Personas</th>
                          <th className="px-4 py-2 font-medium">Actividades</th>
                          <th className="px-4 py-2 font-medium">Última</th>
                          <th className="px-4 py-2 font-medium">Próxima</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suyas.map((s) => (
                          <tr key={s.clave} className="border-t border-borde">
                            <td className="px-4 py-2">
                              <span className="cifras font-medium text-tinta">{s.clave}</span>
                              {s.es_sustituta && (
                                <span className="ml-2 pildora">Referencia</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-tinta-suave">
                              {s.responsable ?? (
                                <span className="pildora hueco-punteado">Sin responsable</span>
                              )}
                            </td>
                            <td className="px-4 py-2">{s.personas}</td>
                            <td className="px-4 py-2 text-tinta-suave">
                              {s.reuniones + s.activismo + s.recorridos}
                            </td>
                            <td className="px-4 py-2 text-tinta-suave">
                              {fechaCorta(s.ultima_actividad)}
                            </td>
                            <td className="px-4 py-2 text-tinta-suave">
                              {fechaCorta(s.proxima_actividad)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-tinta-tenue">
        Cabecera Municipal concentra 86 de las 169 secciones del catálogo. La desproporción es del
        territorio, no de los datos.{" "}
        <Link href="/mapa" className="text-naranja-texto underline-offset-4 hover:underline">
          Verlo en el mapa
        </Link>
      </p>
    </div>
  );
}
