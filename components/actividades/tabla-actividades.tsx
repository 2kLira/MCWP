"use client";

import { useRouter } from "next/navigation";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import type { Actividad } from "@/lib/datos/actividades";
import { Estado } from "@/components/sistema/estado";

function fechaCorta(fecha: string, hora: string | null): string {
  const texto = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
  return hora ? `${texto} · ${hora.slice(0, 5)}` : texto;
}

/** La tabla de Actividades. La usan la lista general y la de la Brigada informe. */
export function TablaActividades({
  cargando,
  actividades,
  vacio,
}: {
  cargando: boolean;
  actividades: Actividad[];
  vacio: string;
}) {
  const router = useRouter();
  return (
      <div className="tarjeta overflow-x-auto">
        {cargando ? (
          <ul className="divide-y divide-separador">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-[52px] animate-pulse bg-superficie-hundida/50" />
            ))}
          </ul>
        ) : actividades.length === 0 ? (
          <p className="p-6 text-sm text-tinta-suave">{vacio}</p>
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
              {actividades.map((a) => {
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
  );
}
