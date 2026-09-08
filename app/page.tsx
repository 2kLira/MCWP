"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Map as MapaIcono } from "lucide-react";
import { Indicador } from "@/components/tablero/indicador";
import { Tarjeta } from "@/components/tablero/tarjeta";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { etiquetaAlcance } from "@/lib/permisos";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import { resumenTablero, type ResumenTablero } from "@/lib/datos/tablero";
import { actividadesDeAgenda, type Actividad } from "@/lib/datos/actividades";

const RESUMEN_VACIO = {} as ResumenTablero;

function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function enDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return f.toISOString().slice(0, 10);
}

export default function Tablero() {
  const { actuante } = useActuante();
  const territorio = etiquetaAlcance(
    actuante,
    demarcacionPorId(actuante.demarcacionId)?.nombre,
  );

  const resumen = useConsulta(
    () => resumenTablero(actuante),
    RESUMEN_VACIO,
    [actuante.id],
  );

  const agenda = useConsulta<Actividad[]>(
    () => actividadesDeAgenda(actuante, enDias(0), enDias(7)),
    [],
    [actuante.id],
  );

  const { hoy, semana } = useMemo(() => {
    const dia = enDias(0);
    return {
      hoy: agenda.datos.filter((a) => a.fecha === dia),
      semana: agenda.datos.filter((a) => a.fecha > dia),
    };
  }, [agenda.datos]);

  const r = resumen.datos;
  const cargando = resumen.cargando;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl">Tablero</h1>
          <p className="text-sm text-tinta-suave">{territorio}</p>
        </div>
        {/* Única acción primaria de la pantalla, y por eso lo único naranja. */}
        <Link
          href="/registrar"
          data-destino
          className="transicion-ui inline-flex items-center gap-2 rounded-control bg-naranja px-4 text-sm font-medium text-tinta toque-actividad"
        >
          Registrar persona
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador
          orden={0}
          etiqueta="Personas registradas"
          valor={r.personas ?? 0}
          apoyo={`${r.nuevasSemana ?? 0} nuevas esta semana`}
          cargando={cargando}
        />
        <Indicador
          orden={1}
          etiqueta="Quieren participar"
          valor={r.quierenParticipar ?? 0}
          apoyo={`${r.quierenInfo ?? 0} quieren información`}
          cargando={cargando}
        />
        <Indicador
          orden={2}
          etiqueta="Secciones con responsable"
          valor={r.seccionesConResponsable ?? 0}
          apoyo={`${r.seccionesSinResponsable ?? 0} sin responsable`}
          cargando={cargando}
        />
        <Indicador
          orden={3}
          etiqueta="Actividades realizadas"
          valor={(r.reuniones ?? 0) + (r.activismo ?? 0) + (r.recorridos ?? 0)}
          apoyo={`${r.reuniones ?? 0} reuniones · ${r.activismo ?? 0} activismo · ${r.recorridos ?? 0} recorridos`}
          cargando={cargando}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        {/* El mapa ocupa el lugar principal del tablero. */}
        <Tarjeta
          titulo="Mapa del territorio"
          accion={
            <Link
              href="/mapa"
              className="transicion-ui inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta"
            >
              Abrir <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <Link
            href="/mapa"
            className="group grid min-h-56 w-full place-items-center rounded-control border border-borde bg-superficie-hundida p-6 text-center"
          >
            <span className="flex max-w-full flex-col items-center gap-2 text-balance text-sm text-tinta-suave">
              <MapaIcono className="size-8 text-tinta-tenue" aria-hidden />
              157 secciones con geometría en 14 demarcaciones
              <span className="text-xs text-tinta-tenue">
                Estructura, personas, actividad, problemáticas y recorridos
              </span>
            </span>
          </Link>
        </Tarjeta>

        <div className="flex flex-col gap-4">
          <Tarjeta titulo="Hoy y esta semana">
            {agenda.cargando ? (
              <div className="h-24 animate-pulse rounded-control bg-superficie-hundida" />
            ) : agenda.datos.length === 0 ? (
              <p className="text-sm text-tinta-suave">Sin actividades en los próximos siete días.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <Grupo titulo="Hoy" actividades={hoy} />
                <Grupo titulo="Esta semana" actividades={semana} />
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Pendientes">
            <ul className="flex flex-col gap-2 text-sm">
              <Pendiente
                etiqueta="Personas sin seguimiento"
                valor={r.sinSeguimiento ?? 0}
                href="/seguimiento"
                cargando={cargando}
              />
              <Pendiente
                etiqueta="Actividades por cerrar"
                valor={r.porCerrar ?? 0}
                href="/actividades"
                cargando={cargando}
              />
              <Pendiente
                etiqueta="Secciones sin responsable"
                valor={r.seccionesSinResponsable ?? 0}
                href="/territorio"
                cargando={cargando}
              />
            </ul>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, actividades }: { titulo: string; actividades: Actividad[] }) {
  if (actividades.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-tinta-tenue">{titulo}</p>
      <ul className="flex flex-col gap-2">
        {actividades.slice(0, 5).map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-sm text-tinta">{a.nombre}</span>
              <span className="block text-xs text-tinta-suave">
                {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
                {a.seccion_clave && ` · sección ${a.seccion_clave}`}
              </span>
            </span>
            <span className="cifras shrink-0 text-xs text-tinta-tenue">{fechaCorta(a.fecha)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pendiente({
  etiqueta,
  valor,
  href,
  cargando,
}: {
  etiqueta: string;
  valor: number;
  href: string;
  cargando: boolean;
}) {
  return (
    <li>
      <Link
        href={href as never}
        className="transicion-ui flex items-center justify-between gap-3 rounded-control px-2 py-2 transition-colors hover:bg-superficie-hundida"
      >
        <span className="text-tinta-suave">{etiqueta}</span>
        {cargando ? (
          <span className="h-4 w-8 animate-pulse rounded bg-superficie-hundida" />
        ) : (
          <span className="cifras font-medium text-tinta">{valor.toLocaleString("es-MX")}</span>
        )}
      </Link>
    </li>
  );
}
