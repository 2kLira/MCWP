"use client";

import { CalendarDays, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActuante } from "@/components/proveedor-actuante";
import { useConsulta } from "@/lib/usar-consulta";
import { actividadesDeBrigadista, type Actividad } from "@/lib/datos/actividades";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";

/**
 * Elegir en qué actividad se está capturando.
 *
 * Cierra una trampa real: el botón central de la barra inferior lleva a `/registrar` sin
 * actividad, y la política `personas_brigadista_captura` exige que toda captura venga amarrada a
 * una actividad abierta del brigadista. Sin este paso, alguien llenaba doce campos y recibía el
 * rechazo **al final**, que es el peor momento posible para enterarse.
 */
export function ElegirActividad() {
  const { actuante } = useActuante();

  const actividades = useConsulta<Actividad[]>(
    () => actividadesDeBrigadista(actuante, actuante.id),
    [],
    [actuante.id],
  );

  if (actividades.cargando) {
    return (
      <div className="flex max-w-[47.5rem] flex-col gap-2">
        <div className="h-16 animate-pulse rounded-tarjeta bg-superficie-hundida" />
        <div className="h-16 animate-pulse rounded-tarjeta bg-superficie-hundida" />
      </div>
    );
  }

  if (actividades.datos.length === 0) {
    return (
      <div
        role="status"
        className="tarjeta flex max-w-[47.5rem] flex-col gap-2 p-[1.125rem]"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-alerta">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          No tienes actividades abiertas
        </p>
        <p className="medida text-sm text-tinta-suave">
          Para registrar a alguien tienes que estar invitado a una actividad programada o en curso.
          Pídele al administrador general que te invite a una.
        </p>
        {actividades.aviso && (
          <p className="medida text-sm text-alerta">{actividades.aviso}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-[47.5rem] flex-col gap-3">
      <p className="medida text-sm text-tinta-suave">
        Elige la actividad en la que estás capturando. La persona queda ligada a ella.
      </p>

      <ul className="tarjeta overflow-hidden">
        {actividades.datos.map((a, i) => (
          <li key={a.id}>
            <Link
              href={{ pathname: "/registrar", query: { actividad: a.id } }}
              className={`renglon-activo flex min-h-14 items-center gap-3 px-[1.125rem] py-3 text-sm ${
                i > 0 ? "border-t border-separador" : ""
              }`}
            >
              <CalendarDays className="size-5 shrink-0 text-tinta-suave" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-tinta">{a.nombre}</span>
                <span className="cifras block text-xs text-tinta-tenue">
                  {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]} · {a.fecha}
                  {a.seccion_clave ? ` · sección ${a.seccion_clave}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
