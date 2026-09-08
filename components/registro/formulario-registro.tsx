"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin, TriangleAlert } from "lucide-react";
import { SelectorPunto } from "@/components/registro/selector-punto";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId, DEMARCACIONES } from "@/lib/demarcaciones";
import { cargarSecciones, normalizarTelefono, rasgoPorClave, seccionPorPunto } from "@/lib/territorio";
import { crearPersona, buscarPorTelefono, type Persona } from "@/lib/datos/personas";
import { registrarParticipacion } from "@/lib/datos/actividades";
import { crearSeguimiento } from "@/lib/datos/seguimientos";
import { coloniasDeSeccion, problematicas, type ColoniaBreve, type Problematica } from "@/lib/datos/catalogos";
import { cn } from "@/lib/utils";

/** El texto del aviso va provisional, con nota visible de que falta revisión legal. */
const AVISO_VERSION = "provisional-1";

type Ubicacion = {
  lat: number;
  lng: number;
  clave: string;
  origen: "gps" | "mapa";
};

type Estado = "capturando" | "guardando" | "guardada";

export function FormularioRegistro({ actividadId }: { actividadId?: string }) {
  const { actuante } = useActuante();

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [calle, setCalle] = useState("");
  const [coloniaId, setColoniaId] = useState<number | null>(null);
  const [quiereParticipar, setQuiereParticipar] = useState(false);
  const [quiereInfo, setQuiereInfo] = useState(true);
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [comentario, setComentario] = useState("");
  const [consiente, setConsiente] = useState(false);

  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [ubicando, setUbicando] = useState(true);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [abrirMapa, setAbrirMapa] = useState(false);

  const [catalogo, setCatalogo] = useState<Problematica[]>([]);
  const [colonias, setColonias] = useState<ColoniaBreve[]>([]);
  const [duplicada, setDuplicada] = useState<Persona | null>(null);
  const [caminoDuplicado, setCaminoDuplicado] = useState<"agregar" | "otra">("agregar");

  const [estado, setEstado] = useState<Estado>("capturando");
  const [error, setError] = useState<string | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  // El GPS resuelve la sección al instante contra los polígonos cacheados, sin red.
  useEffect(() => {
    let vigente = true;

    cargarSecciones()
      .then(() => {
        if (!vigente || !navigator.geolocation) {
          if (vigente) {
            setUbicando(false);
            setErrorGps("Este dispositivo no comparte ubicación.");
          }
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (posicion) => {
            if (!vigente) return;
            const { longitude, latitude } = posicion.coords;
            const clave = seccionPorPunto(longitude, latitude);
            setUbicando(false);
            if (clave) {
              setUbicacion({ lat: latitude, lng: longitude, clave, origen: "gps" });
            } else {
              setErrorGps("La ubicación quedó fuera del municipio.");
            }
          },
          () => {
            if (!vigente) return;
            setUbicando(false);
            setErrorGps("No se pudo leer el GPS.");
          },
          { enableHighAccuracy: true, timeout: 8000 },
        );
      })
      .catch(() => {
        if (vigente) {
          setUbicando(false);
          setErrorGps("No se pudo cargar la cartografía.");
        }
      });

    problematicas().then((r) => vigente && setCatalogo(r.datos));

    return () => {
      vigente = false;
    };
  }, []);

  // Las colonias del autocompletado salen de la sección resuelta, no al revés.
  useEffect(() => {
    if (!ubicacion) return;
    let vigente = true;
    coloniasDeSeccion(ubicacion.clave).then((r) => vigente && setColonias(r.datos));
    return () => {
      vigente = false;
    };
  }, [ubicacion]);

  // Deduplicación en el momento: en cuanto hay diez dígitos, se busca.
  const revisarTelefono = useCallback(async (valor: string) => {
    const norm = normalizarTelefono(valor);
    if (!norm || norm.length < 10) {
      setDuplicada(null);
      return;
    }
    const r = await buscarPorTelefono(norm);
    setDuplicada(r.datos);
    setCaminoDuplicado("agregar");
  }, []);

  const rasgo = ubicacion ? rasgoPorClave(ubicacion.clave) : null;
  const demarcacionNombre = rasgo?.properties.demarcacion ?? null;
  const demarcacionId =
    DEMARCACIONES.find((d) => d.nombre === demarcacionNombre)?.id ?? null;

  const listo = nombre.trim().length > 1 && consiente && !!ubicacion;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || !ubicacion) return;
    setEstado("guardando");
    setError(null);

    const hayDuplicado = !!duplicada;
    const agregarAExistente = hayDuplicado && caminoDuplicado === "agregar";

    let personaId = duplicada?.id ?? null;

    if (!agregarAExistente) {
      const r = await crearPersona({
        nombre: nombre.trim(),
        // Si es otra persona distinta, se guarda sin teléfono y queda marcada para revisión.
        telefono_raw: hayDuplicado ? null : telefono.trim() || null,
        calle: calle.trim() || null,
        colonia_id: coloniaId,
        seccion_clave: ubicacion.clave,
        demarcacion_id: demarcacionId,
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        origen_ubicacion: ubicacion.origen,
        quiere_participar: quiereParticipar,
        quiere_info: quiereInfo,
        aviso_version: AVISO_VERSION,
        consentimiento_en: new Date().toISOString(),
        registrada_por: actuante.id,
        actividad_origen: actividadId ?? null,
      });
      if (!r.datos) {
        setEstado("capturando");
        setError(r.aviso ?? "No se pudo guardar.");
        return;
      }
      personaId = r.datos.id;

      if (hayDuplicado) {
        await crearSeguimiento({
          personaId,
          tipo: "otro",
          nota:
            "Capturada sin teléfono porque el número ya existía en otra ficha. Queda marcada para revisión.",
          responsableId: actuante.id,
          estado: "pendiente",
        });
      }
    }

    if (personaId && actividadId) {
      await registrarParticipacion({
        personaId,
        actividadId,
        tipo: agregarAExistente ? "asistencia" : "registro",
        registradaPor: actuante.id,
        problematicas: elegidas.map((id) => ({
          id,
          comentario: comentario.trim() || null,
        })),
      });
    }

    setEstado("guardada");
  }

  function otraCaptura() {
    setNombre("");
    setTelefono("");
    setCalle("");
    setColoniaId(null);
    setQuiereParticipar(false);
    setQuiereInfo(true);
    setElegidas([]);
    setComentario("");
    setConsiente(false);
    setDuplicada(null);
    setEstado("capturando");
    nombreRef.current?.focus();
  }

  if (estado === "guardada") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-superficie-hundida">
          <Check className="size-7 text-tinta" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-medium">Persona registrada</p>
          <p className="text-sm text-tinta-suave">
            Sección {ubicacion?.clave} · {demarcacionNombre}
          </p>
        </div>
        <button
          type="button"
          onClick={otraCaptura}
          className="transicion-ui w-full max-w-xs rounded-control bg-naranja text-sm font-medium text-tinta toque-actividad"
        >
          Registrar a alguien más
        </button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={guardar} className="flex flex-col gap-5 pb-4">
        {/* La sección se muestra como confirmación, nunca como campo que alguien tenga que llenar. */}
        <div
          className={cn(
            "rounded-tarjeta border p-3",
            ubicacion ? "border-borde bg-superficie" : "hueco-punteado",
          )}
        >
          {ubicando ? (
            <p className="flex items-center gap-2 text-sm text-tinta-suave">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Leyendo la ubicación…
            </p>
          ) : ubicacion ? (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm">
                <span className="block text-tinta-suave">
                  {ubicacion.origen === "gps" ? "Ubicación del dispositivo" : "Punto marcado en el mapa"}
                </span>
                <span className="cifras block text-lg font-medium text-tinta">
                  Sección {ubicacion.clave}
                </span>
                <span className="block text-tinta-suave">{demarcacionNombre}</span>
              </p>
              <button
                type="button"
                onClick={() => setAbrirMapa(true)}
                className="transicion-ui shrink-0 rounded-control border border-borde px-3 text-sm text-tinta-suave toque-actividad"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-tinta-suave">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {errorGps ?? "Sin ubicación."}
              </p>
              <button
                type="button"
                onClick={() => setAbrirMapa(true)}
                className="transicion-ui flex items-center justify-center gap-2 rounded-control border border-borde bg-superficie text-sm font-medium text-tinta toque-actividad"
              >
                <MapPin className="size-4" aria-hidden />
                Marcar en el mapa
              </button>
            </div>
          )}
        </div>

        <Campo etiqueta="Nombre">
          <input
            ref={nombreRef}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="off"
            required
            className="campo"
          />
        </Campo>

        <Campo etiqueta="Teléfono" apoyo="Diez dígitos. Opcional.">
          <input
            value={telefono}
            inputMode="tel"
            onChange={(e) => {
              setTelefono(e.target.value);
              void revisarTelefono(e.target.value);
            }}
            className="campo cifras"
          />
        </Campo>

        {duplicada && (
          <div className="rounded-tarjeta border border-borde bg-superficie-hundida p-3">
            <p className="text-sm font-medium text-tinta">Este teléfono ya está registrado</p>
            <p className="mt-1 text-sm text-tinta-suave">
              {duplicada.nombre}
              {duplicada.seccion_clave && ` · sección ${duplicada.seccion_clave}`}
              {duplicada.demarcacion_id &&
                ` · ${demarcacionPorId(duplicada.demarcacion_id)?.nombre}`}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Opcion
                nombre="duplicado"
                elegido={caminoDuplicado === "agregar"}
                alElegir={() => setCaminoDuplicado("agregar")}
                titulo="Agregar esta participación a la persona encontrada"
                apoyo="Es el camino correcto casi siempre."
              />
              <Opcion
                nombre="duplicado"
                elegido={caminoDuplicado === "otra"}
                alElegir={() => setCaminoDuplicado("otra")}
                titulo="Es otra persona distinta"
                apoyo="Se guarda sin teléfono y queda marcada para revisión."
              />
            </div>
          </div>
        )}

        <Campo etiqueta="Calle">
          <input
            value={calle}
            onChange={(e) => setCalle(e.target.value)}
            className="campo"
            autoComplete="off"
          />
        </Campo>

        {colonias.length > 0 && (
          <Campo etiqueta="Colonia" apoyo="Referencia. La sección manda.">
            <select
              value={coloniaId ?? ""}
              onChange={(e) => setColoniaId(e.target.value ? Number(e.target.value) : null)}
              className="campo"
            >
              <option value="">Sin especificar</option>
              {colonias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <div className="flex flex-col gap-2">
          <Interruptor
            etiqueta="Quiere participar"
            valor={quiereParticipar}
            alCambiar={setQuiereParticipar}
          />
          <Interruptor
            etiqueta="Quiere recibir información"
            valor={quiereInfo}
            alCambiar={setQuiereInfo}
          />
        </div>

        {catalogo.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-tinta-suave">Problemáticas que mencionó</p>
            <div className="flex flex-wrap gap-2">
              {catalogo.map((p) => {
                const activa = elegidas.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={activa}
                    onClick={() =>
                      setElegidas((previas) =>
                        activa ? previas.filter((i) => i !== p.id) : [...previas, p.id],
                      )
                    }
                    className={cn(
                      "transicion-ui rounded-pildora border px-3 py-2 text-sm transition-colors",
                      activa
                        ? "border-tinta bg-tinta text-superficie"
                        : "border-borde bg-superficie text-tinta-suave",
                    )}
                  >
                    {p.nombre}
                  </button>
                );
              })}
            </div>
            {!actividadId && elegidas.length > 0 && (
              <p className="mt-2 text-xs text-tinta-tenue">
                Las menciones se guardan dentro de una actividad. Abre el registro desde una
                actividad para que queden ligadas.
              </p>
            )}
          </div>
        )}

        <Campo etiqueta="Comentario">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            className="campo min-h-24 resize-y py-2"
          />
        </Campo>

        <label className="flex items-start gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
          <input
            type="checkbox"
            checked={consiente}
            onChange={(e) => setConsiente(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--naranja)]"
            style={{ minHeight: 0 }}
          />
          <span className="text-sm">
            <span className="block text-tinta">
              Acepta que sus datos se usen para darle seguimiento.
            </span>
            <span className="mt-1 block text-xs text-tinta-tenue">
              Texto provisional del aviso de privacidad, versión {AVISO_VERSION}. Pendiente de
              revisión legal.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-alerta">{error}</p>}

        <button
          type="submit"
          disabled={!listo || estado === "guardando"}
          className="transicion-ui sticky bottom-20 rounded-control bg-naranja text-base font-medium text-tinta toque-actividad disabled:opacity-50 md:bottom-4"
        >
          {estado === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </form>

      {abrirMapa && (
        <SelectorPunto
          inicial={ubicacion ? [ubicacion.lng, ubicacion.lat] : null}
          alCancelar={() => setAbrirMapa(false)}
          alConfirmar={(punto, clave) => {
            if (clave) {
              setUbicacion({ lng: punto[0], lat: punto[1], clave, origen: "mapa" });
              setErrorGps(null);
            }
            setAbrirMapa(false);
          }}
        />
      )}
    </>
  );
}

function Campo({
  etiqueta,
  apoyo,
  children,
}: {
  etiqueta: string;
  apoyo?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-tinta-suave">
        {etiqueta}
        {apoyo && <span className="ml-2 text-xs text-tinta-tenue">{apoyo}</span>}
      </span>
      {children}
    </label>
  );
}

function Interruptor({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: boolean;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valor}
      onClick={() => alCambiar(!valor)}
      className="transicion-ui flex items-center justify-between gap-3 rounded-control border border-borde bg-superficie px-3 text-left text-sm text-tinta toque-actividad"
    >
      {etiqueta}
      <span
        aria-hidden
        className={cn(
          "transicion-ui relative h-6 w-10 shrink-0 rounded-pildora transition-colors",
          valor ? "bg-tinta" : "bg-superficie-hundida border border-borde",
        )}
      >
        <span
          className={cn(
            "transicion-ui absolute top-0.5 size-5 rounded-full bg-superficie transition-[left]",
            valor ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Opcion({
  nombre,
  elegido,
  alElegir,
  titulo,
  apoyo,
}: {
  nombre: string;
  elegido: boolean;
  alElegir: () => void;
  titulo: string;
  apoyo: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-control border border-borde bg-superficie p-3">
      <input
        type="radio"
        name={nombre}
        checked={elegido}
        onChange={alElegir}
        className="mt-0.5 size-4 shrink-0 accent-[var(--naranja)]"
        style={{ minHeight: 0 }}
      />
      <span className="text-sm">
        <span className="block text-tinta">{titulo}</span>
        <span className="block text-xs text-tinta-tenue">{apoyo}</span>
      </span>
    </label>
  );
}
