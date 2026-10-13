"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  HeartHandshake,
  History,
  ListChecks,
  MessageCircle,
  User,
} from "lucide-react";
import { Caja } from "@/components/sistema/caja";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { EliminarPersona } from "@/components/personas/eliminar-persona";
import { Estado } from "@/components/sistema/estado";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { esAdmin, puedeEditarPersona } from "@/lib/puertas-ui";
import { cumpleHoy, etiquetaEdad } from "@/lib/personas";
import { formatearTelefono } from "@/lib/territorio";
import { nombreCompartido } from "@/lib/transicion";
import { useConsulta } from "@/lib/usar-consulta";
import {
  historialPersona,
  marcarPromovido,
  obtenerPersona,
  type EventoHistorial,
  type Persona,
} from "@/lib/datos/personas";
import { seguimientosDePersona, type Seguimiento } from "@/lib/datos/seguimientos";
import { ETIQUETA_GENERO, ETIQUETA_TIPO_ACTIVIDAD, NOTA_SUSTITUTA } from "@/lib/tipos";
import { rasgoPorClave, cargarSecciones } from "@/lib/territorio";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function fechaLarga(iso: string): string {
  return new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function FichaPersona({ id }: { id: string }) {
  const { actuante } = useActuante();
  // recargar fuerza que obtenerPersona se vuelva a pedir después de marcar/desmarcar promovido,
  // así la ficha refleja el estado nuevo sin recargar la página.
  const [recargar, setRecargar] = useState(0);
  const persona = useConsulta<Persona | null>(() => obtenerPersona(actuante, id), null, [
    actuante.id,
    id,
    recargar,
  ]);
  const historial = useConsulta<EventoHistorial[]>(() => historialPersona(id), [], [id]);
  const seguimientos = useConsulta<Seguimiento[]>(() => seguimientosDePersona(id), [], [id]);

  const [marcando, setMarcando] = useState(false);
  const [avisoPromovido, setAvisoPromovido] = useState<string | null>(null);

  const [esSustituta, setEsSustituta] = useState(false);
  useEffect(() => {
    const clave = persona.datos?.seccion_clave;
    if (!clave) return;
    let vigente = true;
    cargarSecciones().then(() => {
      if (!vigente) return;
      setEsSustituta(rasgoPorClave(clave)?.properties.sustituta === true);
    });
    return () => {
      vigente = false;
    };
  }, [persona.datos?.seccion_clave]);

  if (persona.cargando) {
    return <div className="h-64 animate-pulse rounded-tarjeta bg-superficie-hundida" />;
  }

  const p = persona.datos;
  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        <Volver />
        <p className="text-sm text-tinta-suave">
          {persona.aviso ?? "No se encontró a esta persona."}
        </p>
      </div>
    );
  }

  const demarcacion = demarcacionPorId(p.demarcacion_id)?.nombre;
  const editable = puedeEditarPersona(actuante, p);
  const hayIntereses =
    p.quiere_participar ||
    p.quiere_info ||
    Boolean(p.aviso_version) ||
    p.es_promovido ||
    p.quiere_ser_representante;

  // Se guarda el valor aquí y no dentro de la función: el estrechamiento de `p` no sobrevive al
  // cierre de una función declarada, y adentro TypeScript vuelve a verlo como posiblemente nulo.
  const esPromovido = p.es_promovido;

  async function alternarPromovido() {
    setMarcando(true);
    setAvisoPromovido(null);
    const r = await marcarPromovido(actuante, id, !esPromovido);
    setMarcando(false);
    if (r.aviso) setAvisoPromovido(r.aviso);
    if (r.datos) setRecargar((v) => v + 1);
  }

  const cumple = cumpleHoy(p.fecha_nacimiento);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo={
          <span className="inline-block" style={{ viewTransitionName: nombreCompartido(p.id) }}>
            {p.nombre}
          </span>
        }
        apoyo={
          (p.seccion_clave || demarcacion) && (
            <>
              {p.seccion_clave && <span className="cifras">Sección {p.seccion_clave}</span>}
              {demarcacion && ` · ${demarcacion}`}
            </>
          )
        }
        volver={{ href: "/personas", etiqueta: "Personas alcanzadas" }}
      />

      {(cumple || p.telefono_norm) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {cumple && <Estado vivo>Hoy cumple años</Estado>}
          {p.telefono_norm && (
            <a
              href={`https://wa.me/52${p.telefono_norm}`}
              target="_blank"
              rel="noreferrer"
              className="boton ml-auto"
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
          )}
        </div>
      )}

      {/* En celular el orden es Datos, Intereses, Historial y Seguimientos: el control de
          promovido no debe quedar debajo de un historial largo. En lg, Intereses pasa a la
          columna derecha. */}
      <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Caja icono={User} titulo="Datos" className="lg:col-start-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
            <Dato
              etiqueta="Teléfono"
              valor={formatearTelefono(p.telefono_norm) || "Sin teléfono"}
            />
            {p.genero && <Dato etiqueta="Género" valor={ETIQUETA_GENERO[p.genero]} />}
            {p.fecha_nacimiento && (
              <Dato
                etiqueta="Nacimiento"
                valor={`${fechaLarga(p.fecha_nacimiento)} · ${etiquetaEdad(p.fecha_nacimiento)}`}
              />
            )}
            <Dato etiqueta="Calle" valor={p.calle ?? "Sin dato"} />
            <Dato
              etiqueta="Ubicación"
              valor={
                p.lat && p.lng
                  ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} · ${p.origen_ubicacion ?? "manual"}`
                  : "Sin coordenada"
              }
            />
            <Dato etiqueta="Registrada" valor={fechaLarga(p.created_at)} />
          </dl>
        </Caja>

        <Caja
          icono={HeartHandshake}
          titulo="Intereses"
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          {/* Solo los encendidos, como antes del rediseño: un interés apagado no es un dato. */}
          {hayIntereses ? (
            <ul className="flex flex-col gap-3">
              {p.quiere_participar && <Indicador etiqueta="Quiere participar" activo />}
              {p.quiere_info && <Indicador etiqueta="Quiere información" activo />}
              {p.aviso_version && (
                <Indicador etiqueta={`Consentimiento ${p.aviso_version}`} activo />
              )}
              {p.es_promovido && (
                <Indicador
                  etiqueta="Promovido"
                  activo
                  nota={p.promovido_en ? fechaLarga(p.promovido_en) : undefined}
                />
              )}
              {p.quiere_ser_representante && (
                <Indicador etiqueta="Quiere ser representante de casilla" activo />
              )}
            </ul>
          ) : (
            <p className="text-sm text-tinta-suave">Sin intereses registrados.</p>
          )}
          {editable && (
            <div className="mt-4 flex flex-col gap-1.5 border-t border-separador pt-4">
              <button
                type="button"
                onClick={alternarPromovido}
                disabled={marcando}
                className="boton w-full"
              >
                {marcando
                  ? "Guardando…"
                  : p.es_promovido
                    ? "Quitar promovido"
                    : "Marcar como promovido"}
              </button>
              {avisoPromovido && <p className="text-sm text-alerta">{avisoPromovido}</p>}
            </div>
          )}
        </Caja>

        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1">
          {esSustituta && (
            <p className="rounded-control bg-superficie-hundida p-3 text-xs text-tinta-suave">
              {NOTA_SUSTITUTA}
            </p>
          )}

          <Caja icono={History} titulo="Historial">
            {historial.cargando ? (
              <div className="h-24 animate-pulse rounded-control bg-superficie-hundida" />
            ) : historial.datos.length === 0 ? (
              <p className="text-sm text-tinta-suave">Todavía no tiene eventos.</p>
            ) : (
              <ol className="flex flex-col">
                {historial.datos.map((e, i) => (
                  <li
                    key={`${e.evento}-${e.actividad_id ?? i}`}
                    className="border-t border-separador py-3 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <span className="block text-sm text-tinta">
                      {e.evento === "participacion"
                        ? `${e.detalle === "registro" ? "Se registró en" : "Asistió a"} ${e.actividad}`
                        : `Seguimiento por ${e.detalle}`}
                    </span>
                    <span className="mt-0.5 block text-xs text-tinta-suave">
                      <span className="cifras">{fechaLarga(e.fecha)}</span>
                      {e.tipo_actividad &&
                        ` · ${ETIQUETA_TIPO_ACTIVIDAD[e.tipo_actividad as keyof typeof ETIQUETA_TIPO_ACTIVIDAD]}`}
                      {e.usuario && ` · ${e.usuario}`}
                    </span>
                    {e.nota && <span className="block text-xs text-tinta-suave">{e.nota}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Caja>

          <Caja icono={ListChecks} titulo="Seguimientos">
            {seguimientos.datos.length === 0 ? (
              <p className="text-sm text-tinta-suave">Sin seguimientos registrados.</p>
            ) : (
              <ul className="flex flex-col">
                {seguimientos.datos.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 border-t border-separador py-3 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-tinta">{s.nota ?? s.tipo}</span>
                      <span className="cifras mt-0.5 block text-xs text-tinta-suave">
                        {fechaLarga(s.fecha)}
                      </span>
                    </span>
                    <Estado className="shrink-0">{s.estado.replace("_", " ")}</Estado>
                  </li>
                ))}
              </ul>
            )}
          </Caja>
        </div>
      </div>

      {/* Al final de la ficha y separado, para que nadie lo toque buscando otra cosa. Mismo lugar
          que "Eliminar actividad" en la ficha de actividad. */}
      {esAdmin(actuante) && (
        <div className="flex justify-center pt-1">
          <EliminarPersona personaId={p.id} />
        </div>
      )}
    </div>
  );
}

/** Regreso para el caso en que no hay persona que titular: mismo trazo que el del encabezado. */
function Volver() {
  return (
    <Link
      href="/personas"
      className="transicion-ui inline-flex min-h-7 w-fit items-center gap-1.5 text-sm text-tinta-suave transition-colors hover:text-tinta"
    >
      <ArrowLeft className="size-[0.9375rem]" aria-hidden />
      Personas alcanzadas
    </Link>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="cifras mt-0.5 break-words text-sm font-medium text-tinta">{valor}</dd>
    </div>
  );
}

/**
 * Indicador de solo lectura: una marca encendida o apagada junto a su etiqueta. No es un control;
 * lo único que se alterna en la ficha es Promovido, y eso lo hace el botón de abajo.
 */
function Indicador({
  etiqueta,
  activo,
  nota,
}: {
  etiqueta: string;
  activo: boolean;
  nota?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-px grid size-[1.125rem] shrink-0 place-items-center rounded-[5px] border",
          activo ? "border-transparent bg-naranja text-sobre-naranja" : "border-borde",
        )}
      >
        {activo && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm", activo ? "text-tinta" : "text-tinta-suave")}>
          {etiqueta}
          <span className="sr-only">{activo ? ": sí" : ": no"}</span>
        </span>
        {nota && <span className="cifras block text-xs text-tinta-tenue">{nota}</span>}
      </span>
    </li>
  );
}
