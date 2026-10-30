"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, MapPin, ShieldCheck, X } from "lucide-react";
import {
  AVISO_VERSION_ENCUESTA,
  mensajesFinales,
  PUNTOS_ESCALA,
  respuestaVacia,
  type DatosRegistroPublico,
  type EncuestaPublica,
  type PreguntaEncuesta,
  type ValorRespuesta,
} from "@/lib/encuestas";
import {
  cargarCatalogoColonias,
  validarTelefonoMexicano,
  type ColoniaCatalogo,
} from "@/lib/territorio";
import { ETIQUETA_GENERO, GENEROS } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/**
 * La encuesta que contesta quien escanea el QR. Una pantalla por paso: primero, si la encuesta lo
 * pide, los datos de la persona en el mismo orden que el registro de brigadista; después las
 * preguntas del administrador, una por una. Todo se manda junto al final, en una sola petición:
 * si alguien se va a la mitad no queda nada guardado a medias.
 */

type Paso =
  | { tipo: "portada" }
  | { tipo: "nombre" }
  | { tipo: "telefono" }
  | { tipo: "domicilio" }
  | { tipo: "sobre-ti" }
  | { tipo: "interes" }
  | { tipo: "aviso" }
  | { tipo: "pregunta"; pregunta: PreguntaEncuesta; numero: number };

type Envio = "listo" | "enviando" | "enviado";

const DATOS_VACIOS: DatosRegistroPublico = {
  nombres: "",
  apellido_paterno: "",
  apellido_materno: "",
  telefono: "",
  calle: "",
  colonia_id: null,
  lat: null,
  lng: null,
  genero: null,
  fecha_nacimiento: "",
  quiere_participar: false,
  quiere_info: true,
  consiente: false,
  aviso_version: AVISO_VERSION_ENCUESTA,
};

/** Tras tocar una opción única se avanza solo, con una pausa para que se vea la selección. */
const PAUSA_AUTOAVANCE_MS = 320;

export function EncuestaPublicaFlujo({ encuesta }: { encuesta: EncuestaPublica }) {
  const pasos = useMemo<Paso[]>(() => {
    const lista: Paso[] = [{ tipo: "portada" }];
    if (encuesta.incluye_registro) {
      lista.push(
        { tipo: "nombre" },
        { tipo: "telefono" },
        { tipo: "domicilio" },
        { tipo: "sobre-ti" },
        { tipo: "interes" },
        { tipo: "aviso" },
      );
    }
    encuesta.preguntas.forEach((pregunta, i) =>
      lista.push({ tipo: "pregunta", pregunta, numero: i + 1 }),
    );
    return lista;
  }, [encuesta]);

  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState<"adelante" | "atras">("adelante");
  const [datos, setDatos] = useState<DatosRegistroPublico>(DATOS_VACIOS);
  const [respuestas, setRespuestas] = useState<Record<string, ValorRespuesta>>({});
  const [envio, setEnvio] = useState<Envio>("listo");
  const [error, setError] = useState<string | null>(null);
  const [trampa, setTrampa] = useState("");
  const montada = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const autoavance = useRef<number | null>(null);

  useEffect(() => {
    montada.current = Date.now();
    return () => {
      if (autoavance.current) window.clearTimeout(autoavance.current);
    };
  }, []);

  // Al cambiar de paso, el foco va al título: un lector de pantalla anuncia la pregunta nueva y
  // en celular no se abre el teclado sin que la persona lo pida.
  useEffect(() => {
    if (indice > 0) titulo.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [indice, envio]);

  const paso = pasos[indice];
  const esUltimo = indice === pasos.length - 1;
  // La portada no cuenta: la barra arranca vacía en el primer paso de verdad.
  const avance = envio === "enviado" ? 1 : indice / pasos.length;

  const actualizar = (cambios: Partial<DatosRegistroPublico>) => {
    setError(null);
    setDatos((d) => ({ ...d, ...cambios }));
  };

  const responder = (preguntaId: string, valor: ValorRespuesta) => {
    setError(null);
    setRespuestas((r) => ({ ...r, [preguntaId]: valor }));
  };

  /** Lo que le falta al paso actual para poder seguir, o null si está completo. */
  const faltante = (p: Paso): string | null => {
    switch (p.tipo) {
      case "nombre":
        return datos.nombres.trim() && datos.apellido_paterno.trim()
          ? null
          : "Escribe tu nombre y tu primer apellido.";
      case "telefono": {
        const r = validarTelefonoMexicano(datos.telefono);
        return r.valido ? null : r.motivo;
      }
      case "aviso":
        return datos.consiente ? null : "Para continuar, acepta el aviso de privacidad.";
      case "pregunta":
        return p.pregunta.obligatoria && respuestaVacia(respuestas[p.pregunta.id])
          ? "Esta pregunta es obligatoria."
          : null;
      default:
        return null;
    }
  };

  const avanzar = () => {
    const falta = faltante(paso);
    if (falta) {
      setError(falta);
      return;
    }
    setError(null);
    if (esUltimo) {
      void enviar();
      return;
    }
    setDireccion("adelante");
    setIndice((i) => Math.min(i + 1, pasos.length - 1));
  };

  const retroceder = () => {
    if (autoavance.current) window.clearTimeout(autoavance.current);
    setError(null);
    setDireccion("atras");
    setIndice((i) => Math.max(i - 1, 0));
  };

  const enviar = async () => {
    setEnvio("enviando");
    setError(null);
    try {
      const r = await fetch(`/api/encuestas/${encuesta.codigo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respuestas,
          persona: encuesta.incluye_registro ? datos : null,
          sitio: trampa,
          abierta_ms: Date.now() - montada.current,
        }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { mensaje?: string };
      if (!r.ok) {
        setError(cuerpo.mensaje ?? "No se pudo enviar. Intenta de nuevo.");
        setEnvio("listo");
        return;
      }
      setDireccion("adelante");
      setEnvio("enviado");
    } catch {
      setError("Sin conexión. Revisa tu señal e intenta de nuevo.");
      setEnvio("listo");
    }
  };

  /** Opción única y escala avanzan solas, salvo en el último paso: ahí se confirma con Enviar. */
  const elegirYAvanzar = (preguntaId: string, valor: ValorRespuesta) => {
    responder(preguntaId, valor);
    if (esUltimo) return;
    if (autoavance.current) window.clearTimeout(autoavance.current);
    autoavance.current = window.setTimeout(() => {
      setDireccion("adelante");
      setIndice((i) => Math.min(i + 1, pasos.length - 1));
    }, PAUSA_AUTOAVANCE_MS);
  };

  if (envio === "enviado") {
    const extras = mensajesFinales(encuesta, respuestas);
    return (
      <Lienzo avance={1}>
        <div className="paso-adelante flex flex-col items-center gap-5 py-6 text-center">
          <span className="sello-listo grid size-20 place-items-center rounded-full bg-[var(--naranja)] text-[var(--sobre-naranja)]">
            <Check className="size-10" strokeWidth={2.5} aria-hidden />
          </span>
          <h1
            ref={titulo}
            tabIndex={-1}
            className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-tinta outline-none"
          >
            ¡Gracias por participar!
          </h1>
          {encuesta.mensaje_final && (
            <p className="medida whitespace-pre-line text-base text-tinta-suave">
              {encuesta.mensaje_final}
            </p>
          )}
          {extras.length > 0 && (
            <ul className="flex w-full flex-col gap-2.5 text-left">
              {extras.map((m, i) => (
                <li
                  key={m}
                  className="entrada tarjeta whitespace-pre-line p-4 text-[0.9375rem] text-tinta"
                  style={{ "--retraso": `${200 + i * 90}ms` } as React.CSSProperties}
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Lienzo>
    );
  }

  return (
    <Lienzo avance={avance} paso={indice > 0 ? { actual: indice, total: pasos.length - 1 } : null}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          avanzar();
        }}
        className="flex flex-1 flex-col"
      >
        {/* Trampa para bots: fuera de la vista, fuera del tabulador y fuera del autocompletado.
            Una persona nunca la llena. Ver app/api/encuestas/[codigo]/route.ts. */}
        <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label>
            Sitio web
            <input
              tabIndex={-1}
              autoComplete="off"
              value={trampa}
              onChange={(e) => setTrampa(e.target.value)}
              name="sitio"
            />
          </label>
        </div>

        <div
          key={indice}
          className={cn("flex flex-1 flex-col", direccion === "adelante" ? "paso-adelante" : "paso-atras")}
        >
          {paso.tipo === "portada" && (
            <Portada encuesta={encuesta} titulo={titulo} />
          )}

          {paso.tipo === "nombre" && (
            <Pantalla titulo={titulo} encabezado="¿Cómo te llamas?" etiqueta="Tus datos">
              <div className="flex flex-col gap-3">
                <CampoGrande
                  etiqueta="Nombre(s)"
                  valor={datos.nombres}
                  alCambiar={(v) => actualizar({ nombres: v })}
                  autoComplete="given-name"
                />
                <CampoGrande
                  etiqueta="Primer apellido"
                  valor={datos.apellido_paterno}
                  alCambiar={(v) => actualizar({ apellido_paterno: v })}
                  autoComplete="family-name"
                />
                <CampoGrande
                  etiqueta="Segundo apellido"
                  apoyo="Opcional"
                  valor={datos.apellido_materno}
                  alCambiar={(v) => actualizar({ apellido_materno: v })}
                  autoComplete="additional-name"
                />
              </div>
            </Pantalla>
          )}

          {paso.tipo === "telefono" && (
            <Pantalla
              titulo={titulo}
              encabezado="¿A qué número te podemos contactar?"
              etiqueta="Tus datos"
              apoyo="Diez dígitos. Solo lo usaremos para darte seguimiento."
            >
              <CampoGrande
                etiqueta="Teléfono"
                valor={datos.telefono}
                alCambiar={(v) => actualizar({ telefono: v })}
                tipo="tel"
                inputMode="tel"
                autoComplete="tel-national"
              />
            </Pantalla>
          )}

          {paso.tipo === "domicilio" && (
            <Pantalla
              titulo={titulo}
              encabezado="¿Dónde vives?"
              etiqueta="Tus datos"
              apoyo="Nos ayuda a saber qué pasa en tu colonia. Todo es opcional."
            >
              <Domicilio datos={datos} actualizar={actualizar} />
            </Pantalla>
          )}

          {paso.tipo === "sobre-ti" && (
            <Pantalla titulo={titulo} encabezado="Cuéntanos un poco de ti" etiqueta="Tus datos" apoyo="Opcional.">
              <div className="flex flex-col gap-5">
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm text-tinta-suave">Género</legend>
                  <div className="grid grid-cols-2 gap-2.5">
                    {GENEROS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={datos.genero === g}
                        onClick={() => actualizar({ genero: datos.genero === g ? null : g })}
                        className="opcion-tarjeta justify-center text-center text-[0.9375rem]"
                      >
                        {ETIQUETA_GENERO[g]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <CampoGrande
                  etiqueta="Fecha de nacimiento"
                  valor={datos.fecha_nacimiento}
                  alCambiar={(v) => actualizar({ fecha_nacimiento: v })}
                  tipo="date"
                  autoComplete="bday"
                />
              </div>
            </Pantalla>
          )}

          {paso.tipo === "interes" && (
            <Pantalla
              titulo={titulo}
              encabezado="¿Te gustaría…?"
              etiqueta="Tus datos"
              apoyo="Marca las que quieras."
            >
              <div className="flex flex-col gap-2.5">
                <OpcionTarjeta
                  multiple
                  activa={datos.quiere_participar}
                  alTocar={() => actualizar({ quiere_participar: !datos.quiere_participar })}
                >
                  Participar en actividades de mi colonia
                </OpcionTarjeta>
                <OpcionTarjeta
                  multiple
                  activa={datos.quiere_info}
                  alTocar={() => actualizar({ quiere_info: !datos.quiere_info })}
                >
                  Recibir información
                </OpcionTarjeta>
              </div>
            </Pantalla>
          )}

          {paso.tipo === "aviso" && (
            <Pantalla titulo={titulo} encabezado="Tu privacidad" etiqueta="Tus datos">
              <div className="flex flex-col gap-4">
                <p className="text-[0.9375rem] leading-relaxed text-tinta-suave">
                  Tus datos se guardan para darte seguimiento y no se comparten con nadie fuera del
                  equipo. Puedes pedir que se corrijan o se borren cuando quieras.
                </p>
                <OpcionTarjeta
                  multiple
                  activa={datos.consiente}
                  alTocar={() => actualizar({ consiente: !datos.consiente })}
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-5 shrink-0 text-[var(--naranja-tipografico)]" aria-hidden />
                    Acepto que mis datos se usen para darme seguimiento.
                  </span>
                </OpcionTarjeta>
                <p className="text-xs text-tinta-tenue">
                  Texto provisional del aviso de privacidad, versión {AVISO_VERSION_ENCUESTA}.
                  Pendiente de revisión legal.
                </p>
              </div>
            </Pantalla>
          )}

          {paso.tipo === "pregunta" && (
            <Pantalla
              titulo={titulo}
              encabezado={paso.pregunta.texto}
              etiqueta={`Pregunta ${paso.numero} de ${encuesta.preguntas.length}`}
              apoyo={
                paso.pregunta.tipo === "opcion_multiple"
                  ? "Puedes elegir varias."
                  : !paso.pregunta.obligatoria
                    ? "Opcional."
                    : undefined
              }
            >
              <Pregunta
                pregunta={paso.pregunta}
                valor={respuestas[paso.pregunta.id]}
                alResponder={(v) => responder(paso.pregunta.id, v)}
                alElegir={(v) => elegirYAvanzar(paso.pregunta.id, v)}
              />
            </Pantalla>
          )}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-8 flex flex-col gap-3 bg-gradient-to-t from-[var(--fondo)] from-70% to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          {error && (
            <p role="alert" className="text-sm text-alerta">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            {indice > 0 && (
              <button
                type="button"
                onClick={retroceder}
                className="boton min-h-12 px-4"
                aria-label="Atrás"
                disabled={envio === "enviando"}
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            )}
            <button
              type="submit"
              className="boton-primario min-h-12 flex-1 text-base"
              disabled={envio === "enviando"}
            >
              {envio === "enviando" ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  Enviando…
                </>
              ) : indice === 0 ? (
                <>
                  Comenzar
                  <ArrowRight className="size-5" aria-hidden />
                </>
              ) : esUltimo ? (
                "Enviar"
              ) : (
                <>
                  {paso.tipo === "pregunta" &&
                  !paso.pregunta.obligatoria &&
                  respuestaVacia(respuestas[paso.pregunta.id])
                    ? "Omitir"
                    : "Siguiente"}
                  <ArrowRight className="size-5" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Lienzo>
  );
}

/* ---------------------------------------------------------------------------
 * Piezas
 * ------------------------------------------------------------------------- */

function Lienzo({
  avance,
  paso,
  children,
}: {
  avance: number;
  paso?: { actual: number; total: number } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* Una sola luz cálida arriba, como en el resto del sistema. Decoración: no se anuncia. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 size-[34rem] rounded-full bg-[var(--bloom-naranja)] blur-3xl"
      />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col px-4 pt-5">
        <div className="mb-8 flex items-center gap-3">
          <div
            className="progreso-encuesta flex-1"
            role="progressbar"
            aria-label="Avance de la encuesta"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(avance * 100)}
          >
            <span style={{ transform: `scaleX(${avance})` }} />
          </div>
          {paso && (
            <span className="cifras w-12 text-right text-xs text-tinta-tenue">
              {paso.actual}/{paso.total}
            </span>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}

function Portada({
  encuesta,
  titulo,
}: {
  encuesta: EncuestaPublica;
  titulo: React.RefObject<HTMLHeadingElement | null>;
}) {
  const total = encuesta.preguntas.length;
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 pb-6">
      <span className="ficha-icono entrada size-12 rounded-2xl" aria-hidden>
        <Check className="size-6" strokeWidth={2.5} />
      </span>
      <h1
        ref={titulo}
        tabIndex={-1}
        className="entrada text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] text-tinta outline-none"
        style={{ "--retraso": "60ms" } as React.CSSProperties}
      >
        {encuesta.titulo}
      </h1>
      {encuesta.descripcion && (
        <p
          className="entrada whitespace-pre-line text-base leading-relaxed text-tinta-suave"
          style={{ "--retraso": "120ms" } as React.CSSProperties}
        >
          {encuesta.descripcion}
        </p>
      )}
      <p
        className="entrada text-sm text-tinta-tenue"
        style={{ "--retraso": "180ms" } as React.CSSProperties}
      >
        {total} {total === 1 ? "pregunta" : "preguntas"}
        {encuesta.incluye_registro ? " · antes te pediremos unos datos" : ""} · menos de{" "}
        {Math.max(1, Math.ceil((total + (encuesta.incluye_registro ? 6 : 0)) / 4))} min
      </p>
    </div>
  );
}

function Pantalla({
  titulo,
  etiqueta,
  encabezado,
  apoyo,
  children,
}: {
  titulo: React.RefObject<HTMLHeadingElement | null>;
  etiqueta: string;
  encabezado: string;
  apoyo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--naranja-tipografico)]">
          {etiqueta}
        </span>
        <h1
          ref={titulo}
          tabIndex={-1}
          className="whitespace-pre-line text-[1.5rem] font-semibold leading-[1.2] tracking-[-0.02em] text-tinta outline-none"
        >
          {encabezado}
        </h1>
        {apoyo && <p className="text-sm text-tinta-suave">{apoyo}</p>}
      </div>
      {children}
    </div>
  );
}

function CampoGrande({
  etiqueta,
  apoyo,
  valor,
  alCambiar,
  tipo = "text",
  inputMode,
  autoComplete,
}: {
  etiqueta: string;
  apoyo?: string;
  valor: string;
  alCambiar: (v: string) => void;
  tipo?: "text" | "tel" | "date";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-tinta-suave">
        {etiqueta}
        {apoyo && <span className="ml-2 text-xs text-tinta-tenue">{apoyo}</span>}
      </span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={tipo === "tel" ? 20 : 80}
        className="campo min-h-14 rounded-[14px] text-base"
      />
    </label>
  );
}

function OpcionTarjeta({
  activa,
  multiple = false,
  alTocar,
  children,
}: {
  activa: boolean;
  multiple?: boolean;
  alTocar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={activa}
      onClick={alTocar}
      className="opcion-tarjeta"
    >
      <span className="opcion-marca" data-forma={multiple ? "cuadro" : "circulo"} aria-hidden>
        {activa && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Pregunta({
  pregunta,
  valor,
  alResponder,
  alElegir,
}: {
  pregunta: PreguntaEncuesta;
  valor: ValorRespuesta | undefined;
  alResponder: (v: ValorRespuesta) => void;
  alElegir: (v: ValorRespuesta) => void;
}) {
  switch (pregunta.tipo) {
    case "opcion_unica":
      return (
        <div role="radiogroup" aria-label={pregunta.texto} className="flex flex-col gap-2.5">
          {pregunta.opciones.map((o, i) => (
            <div
              key={o.id}
              className="entrada"
              style={{ "--retraso": `${80 + i * 45}ms` } as React.CSSProperties}
            >
              <OpcionTarjeta activa={valor === o.id} alTocar={() => alElegir(o.id)}>
                {o.texto}
              </OpcionTarjeta>
            </div>
          ))}
        </div>
      );

    case "opcion_multiple": {
      const elegidas = Array.isArray(valor) ? valor : [];
      return (
        <div role="group" aria-label={pregunta.texto} className="flex flex-col gap-2.5">
          {pregunta.opciones.map((o, i) => (
            <div
              key={o.id}
              className="entrada"
              style={{ "--retraso": `${80 + i * 45}ms` } as React.CSSProperties}
            >
              <OpcionTarjeta
                multiple
                activa={elegidas.includes(o.id)}
                alTocar={() =>
                  alResponder(
                    elegidas.includes(o.id)
                      ? elegidas.filter((x) => x !== o.id)
                      : [...elegidas, o.id],
                  )
                }
              >
                {o.texto}
              </OpcionTarjeta>
            </div>
          ))}
        </div>
      );
    }

    case "escala":
      return (
        <div className="flex flex-col gap-2.5">
          <div role="radiogroup" aria-label={pregunta.texto} className="grid grid-cols-5 gap-2">
            {PUNTOS_ESCALA.map((n, i) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={valor === n}
                onClick={() => alElegir(n)}
                className="punto-escala entrada"
                style={{ "--retraso": `${80 + i * 40}ms` } as React.CSSProperties}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-tinta-tenue">
            <span>Nada</span>
            <span>Mucho</span>
          </div>
        </div>
      );

    case "texto":
      return (
        <textarea
          value={typeof valor === "string" ? valor : ""}
          onChange={(e) => alResponder(e.target.value)}
          rows={5}
          maxLength={1000}
          aria-label={pregunta.texto}
          placeholder="Escribe tu respuesta"
          className="campo min-h-36 resize-y rounded-[14px] py-3 text-base"
        />
      );
  }
}

/** Sin acentos ni mayúsculas, para buscar colonias como la gente las escribe. */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function Domicilio({
  datos,
  actualizar,
}: {
  datos: DatosRegistroPublico;
  actualizar: (c: Partial<DatosRegistroPublico>) => void;
}) {
  const [colonias, setColonias] = useState<ColoniaCatalogo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [ubicando, setUbicando] = useState(false);
  const [avisoUbicacion, setAvisoUbicacion] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void cargarCatalogoColonias().then((c) => {
      if (vigente) setColonias(c);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const elegida = colonias.find((c) => c.id === datos.colonia_id) ?? null;
  const sugerencias = useMemo(() => {
    const q = plano(busqueda);
    if (q.length < 2) return [];
    return colonias.filter((c) => plano(c.nombre).includes(q)).slice(0, 6);
  }, [busqueda, colonias]);

  // La sección no se le pide a nadie: si comparte su ubicación, la base la saca del punto.
  const ubicar = () => {
    if (!("geolocation" in navigator)) {
      setAvisoUbicacion("Tu teléfono no permite compartir la ubicación desde aquí.");
      return;
    }
    setUbicando(true);
    setAvisoUbicacion(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        actualizar({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUbicando(false);
      },
      () => {
        setAvisoUbicacion("No se pudo obtener tu ubicación. Puedes seguir sin ella.");
        setUbicando(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={datos.lat !== null}
        onClick={() => (datos.lat !== null ? actualizar({ lat: null, lng: null }) : ubicar())}
        className="opcion-tarjeta"
        disabled={ubicando}
      >
        <span className="opcion-marca" data-forma="cuadro" aria-hidden>
          {datos.lat !== null && <Check className="size-4" strokeWidth={3} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            {ubicando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <MapPin className="size-4 text-[var(--naranja-tipografico)]" aria-hidden />
            )}
            {datos.lat !== null ? "Ubicación compartida" : "Estoy en mi casa: usar mi ubicación"}
          </span>
          <span className="text-xs text-tinta-tenue">
            {datos.lat !== null ? "Toca para quitarla." : "Solo si ahora mismo estás en tu domicilio."}
          </span>
        </span>
      </button>
      {avisoUbicacion && <p className="text-sm text-tinta-suave">{avisoUbicacion}</p>}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-tinta-suave">Colonia</span>
        {elegida ? (
          <div className="opcion-tarjeta" aria-live="polite">
            <span className="min-w-0 flex-1">
              {elegida.nombre}
              {elegida.cp && <span className="ml-2 text-xs text-tinta-tenue">CP {elegida.cp}</span>}
            </span>
            <button
              type="button"
              onClick={() => {
                actualizar({ colonia_id: null });
                setBusqueda("");
              }}
              className="-m-2 grid size-11 place-items-center rounded-full text-tinta-suave"
              aria-label="Cambiar colonia"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escribe el nombre de tu colonia"
              autoComplete="off"
              aria-label="Colonia"
              className="campo min-h-14 rounded-[14px] text-base"
            />
            {sugerencias.length > 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="Colonias que coinciden">
                {sugerencias.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => actualizar({ colonia_id: c.id })}
                      className="opcion-tarjeta min-h-12 py-2.5 text-[0.9375rem]"
                    >
                      <span className="min-w-0 flex-1">{c.nombre}</span>
                      {c.cp && <span className="text-xs text-tinta-tenue">CP {c.cp}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <CampoGrande
        etiqueta="Calle y número"
        valor={datos.calle}
        alCambiar={(v) => actualizar({ calle: v })}
        autoComplete="street-address"
      />
    </div>
  );
}
