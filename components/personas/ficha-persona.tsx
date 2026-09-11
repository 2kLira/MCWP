"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { puedeEditar } from "@/lib/permisos";
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
  const editable = puedeEditar(actuante, "persona", p);

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

  return (
    <div className="flex flex-col gap-5">
      <Volver />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="text-xl"
            style={{ viewTransitionName: nombreCompartido(p.id) }}
          >
            {p.nombre}
            {cumpleHoy(p.fecha_nacimiento) && (
              <span className="ml-2 align-middle text-xs font-medium text-naranja-texto">
                Hoy cumple años
              </span>
            )}
          </h1>
          <p className="text-sm text-tinta-suave">
            {p.seccion_clave && <span className="cifras">Sección {p.seccion_clave}</span>}
            {demarcacion && ` · ${demarcacion}`}
          </p>
        </div>
        {p.telefono_norm && (
          <a
            href={`https://wa.me/52${p.telefono_norm}`}
            target="_blank"
            rel="noreferrer"
            className="transicion-ui inline-flex items-center gap-2 rounded-control border border-borde bg-superficie px-3 text-sm text-tinta toque-actividad"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Dato etiqueta="Teléfono" valor={formatearTelefono(p.telefono_norm) || "Sin teléfono"} />
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
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {p.quiere_participar && <span className="pildora">Quiere participar</span>}
          {p.quiere_info && <span className="pildora">Quiere información</span>}
          {p.aviso_version && (
            <span className="pildora">Consentimiento {p.aviso_version}</span>
          )}
          {p.es_promovido && (
            <span className="inline-flex items-center gap-1.5 rounded-pildora bg-naranja px-2.5 py-0.5 text-xs font-medium text-tinta">
              Promovido
            </span>
          )}
        </div>
        {p.es_promovido && p.promovido_en && (
          <p className="cifras text-xs text-tinta-tenue">{fechaLarga(p.promovido_en)}</p>
        )}
        {p.quiere_ser_representante && (
          <p className="text-sm text-tinta-suave">Quiere ser representante de casilla</p>
        )}
        {editable && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={alternarPromovido}
              disabled={marcando}
              className="transicion-ui w-fit rounded-control border border-borde bg-superficie px-4 text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
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
      </div>

      {esSustituta && (
        <p className="rounded-control border border-borde bg-superficie-hundida p-3 text-xs text-tinta-suave">
          {NOTA_SUSTITUTA}
        </p>
      )}

      <section className="vidrio filo rounded-tarjeta">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Historial</h2>
        <div className="p-4">
          {historial.cargando ? (
            <div className="h-24 animate-pulse rounded-control bg-superficie-hundida" />
          ) : historial.datos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Todavía no tiene eventos.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {historial.datos.map((e, i) => (
                <li key={`${e.evento}-${e.actividad_id ?? i}`} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-tinta-tenue"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-tinta">
                      {e.evento === "participacion"
                        ? `${e.detalle === "registro" ? "Se registró en" : "Asistió a"} ${e.actividad}`
                        : `Seguimiento por ${e.detalle}`}
                    </span>
                    <span className="block text-xs text-tinta-suave">
                      <span className="cifras">{fechaLarga(e.fecha)}</span>
                      {e.tipo_actividad &&
                        ` · ${ETIQUETA_TIPO_ACTIVIDAD[e.tipo_actividad as keyof typeof ETIQUETA_TIPO_ACTIVIDAD]}`}
                      {e.usuario && ` · ${e.usuario}`}
                    </span>
                    {e.nota && <span className="block text-xs text-tinta-suave">{e.nota}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="vidrio filo rounded-tarjeta">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Seguimientos</h2>
        <div className="p-4">
          {seguimientos.datos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Sin seguimientos registrados.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {seguimientos.datos.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-tinta">{s.nota ?? s.tipo}</span>
                    <span className="cifras block text-xs text-tinta-suave">
                      {fechaLarga(s.fecha)}
                    </span>
                  </span>
                  <span className="pildora shrink-0">{s.estado.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Volver() {
  return (
    <Link
      href="/personas"
      className="transicion-ui inline-flex w-fit items-center gap-2 text-sm text-tinta-suave hover:text-tinta"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Personas alcanzadas
    </Link>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-control border border-borde bg-superficie p-3">
      <p className="text-xs text-tinta-tenue">{etiqueta}</p>
      <p className="cifras mt-0.5 text-sm text-tinta">{valor}</p>
    </div>
  );
}
