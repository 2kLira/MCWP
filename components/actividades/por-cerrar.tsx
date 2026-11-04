"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, Flag } from "lucide-react";
import { Caja } from "@/components/sistema/caja";
import { useActuante } from "@/components/proveedor-actuante";
import { useConsulta } from "@/lib/usar-consulta";
import { ETIQUETA_TIPO_ACTIVIDAD } from "@/lib/tipos";
import {
  actividadesPorCerrar,
  cambiarEstatus,
  grupoDeCierre,
  type ActividadPorCerrar,
} from "@/lib/datos/actividades";

function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function hace(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: es });
}

/**
 * Las actividades vencidas, separadas por lo que piden. Nada se cierra solo, por regla del
 * cliente: cerrar pide la
 * conclusión y la foto de cierre, y le quita la captura al brigadista, así que la decisión sigue
 * siendo de quien coordina. Esto solo le dice cuáles ya puede cerrar y qué les falta.
 */
export function PorCerrar({ alCambiar }: { alCambiar: () => void }) {
  const { actuante } = useActuante();
  const [version, setVersion] = useState(0);
  const consulta = useConsulta<ActividadPorCerrar[]>(
    () => actividadesPorCerrar(),
    [],
    [actuante.id, version],
  );

  if (consulta.cargando || consulta.datos.length === 0) return null;

  const listas = consulta.datos.filter((a) => grupoDeCierre(a) === "lista");
  const sinGente = consulta.datos.filter((a) => grupoDeCierre(a) === "sin_gente");
  const capturando = consulta.datos.filter((a) => grupoDeCierre(a) === "capturando");

  function recargar() {
    setVersion((v) => v + 1);
    alCambiar();
  }

  return (
    <Caja icono={Flag} titulo="Actividades vencidas">
      <div className="flex flex-col gap-5">
        {listas.length > 0 && (
          <Grupo
            titulo="Listas para cerrar"
            apoyo="Ya no llegan capturas. Siguen abiertas hasta que alguien las cierre; al cerrar, el sistema arma el resumen."
          >
            {listas.map((a) => (
              <RenglonVencida key={a.id} a={a}>
                <span>
                  {a.capturas.toLocaleString("es-MX")}{" "}
                  {a.capturas === 1 ? "captura" : "capturas"}
                  {a.ultima_captura && ` · la última ${hace(a.ultima_captura)}`}
                </span>
                {(!a.tiene_conclusion || !a.tiene_foto_cierre) && (
                  <span className="text-tinta">
                    Falta{" "}
                    {[!a.tiene_conclusion && "conclusión", !a.tiene_foto_cierre && "foto de cierre"]
                      .filter(Boolean)
                      .join(" y ")}
                  </span>
                )}
              </RenglonVencida>
            ))}
          </Grupo>
        )}

        {sinGente.length > 0 && (
          <Grupo
            titulo="Sin nadie registrado"
            apoyo="Si no se hicieron, cancelarlas las saca de la agenda. Se pueden volver a programar."
          >
            {sinGente.map((a) => (
              <RenglonVencida key={a.id} a={a} accion={<Cancelar a={a} alCancelar={recargar} />}>
                <span>Sin capturas</span>
              </RenglonVencida>
            ))}
          </Grupo>
        )}

        {capturando.length > 0 && (
          <p className="border-t border-separador pt-3 text-xs text-tinta-suave">
            {capturando.length === 1
              ? "1 actividad vencida sigue recibiendo capturas y se deja abierta: "
              : `${capturando.length} actividades vencidas siguen recibiendo capturas y se dejan abiertas: `}
            {capturando.map((a) => a.nombre).join(", ")}.
          </p>
        )}
      </div>
    </Caja>
  );
}

function Grupo({
  titulo,
  apoyo,
  children,
}: {
  titulo: string;
  apoyo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-tinta">{titulo}</h3>
      <p className="text-xs text-tinta-suave">{apoyo}</p>
      <ul className="-mx-2 mt-1 flex flex-col">{children}</ul>
    </div>
  );
}

function RenglonVencida({
  a,
  accion,
  children,
}: {
  a: ActividadPorCerrar;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <Link
        href={`/actividades/${a.id}`}
        className="renglon-activo flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-tinta">{a.nombre}</span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-tinta-suave">
            <span className="cifras">
              {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]} · {fechaCorta(a.fecha)}
            </span>
            {children}
          </span>
        </span>
        {!accion && <ChevronRight className="size-4 shrink-0 text-tinta-tenue" aria-hidden />}
      </Link>
      {accion}
    </li>
  );
}

/** Cancelar es reversible (cancelada vuelve a programada), por eso va sin confirmación. */
function Cancelar({ a, alCancelar }: { a: ActividadPorCerrar; alCancelar: () => void }) {
  const { actuante } = useActuante();
  const [cancelando, setCancelando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cancelar() {
    setCancelando(true);
    setAviso(null);
    const r = await cambiarEstatus(actuante, a.id, "cancelada");
    setCancelando(false);
    if (!r.datos) {
      setAviso(r.aviso ?? "No se pudo cancelar.");
      return;
    }
    alCancelar();
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 pr-2">
      <button type="button" onClick={cancelar} disabled={cancelando} className="boton">
        {cancelando ? "Cancelando…" : "Cancelar"}
      </button>
      {aviso && <p className="max-w-40 text-right text-xs text-alerta">{aviso}</p>}
    </div>
  );
}
