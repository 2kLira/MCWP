"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ListChecks,
  MessageSquareText,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Caja } from "@/components/sistema/caja";
import { Campo } from "@/components/campo";
import {
  ETIQUETA_TIPO_PREGUNTA,
  idOpcion,
  TIPOS_PREGUNTA,
  type OpcionPregunta,
  type TipoPregunta,
} from "@/lib/encuestas";
import { guardarEncuesta, type EncuestaCompleta } from "@/lib/datos/encuestas";
import { cn } from "@/lib/utils";

/**
 * Armar o editar una encuesta. Las preguntas se guardan todas juntas con `guardar_encuesta`, que
 * es atómica: o queda la encuesta completa o no queda nada.
 *
 * Con respuestas ya recibidas, las preguntas y la parte de registro se congelan. Lo dice la
 * pantalla y lo impone la base: las respuestas guardadas apuntan a los ids de las preguntas y de
 * sus opciones, y cambiarlos haría mentir a las gráficas.
 */

type PreguntaEditable = {
  /** Solo para React; la base les pone su propio id. */
  llave: string;
  tipo: TipoPregunta;
  texto: string;
  obligatoria: boolean;
  opciones: OpcionPregunta[];
};

function preguntaNueva(): PreguntaEditable {
  const a = idOpcion([]);
  return {
    llave: crypto.randomUUID(),
    tipo: "opcion_unica",
    texto: "",
    obligatoria: true,
    opciones: [
      { id: a, texto: "" },
      { id: idOpcion([{ id: a }]), texto: "" },
    ],
  };
}

const LLEVA_OPCIONES = (tipo: TipoPregunta) => tipo === "opcion_unica" || tipo === "opcion_multiple";

export function EditorEncuesta({ inicial }: { inicial?: EncuestaCompleta }) {
  const router = useRouter();
  const congelada = (inicial?.resumen?.respuestas ?? 0) > 0;

  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [incluyeRegistro, setIncluyeRegistro] = useState(inicial?.incluye_registro ?? true);
  const [mensajeFinal, setMensajeFinal] = useState(inicial?.mensaje_final ?? "");
  const [preguntas, setPreguntas] = useState<PreguntaEditable[]>(
    inicial
      ? inicial.preguntas.map((p) => ({
          llave: p.id,
          tipo: p.tipo,
          texto: p.texto,
          obligatoria: p.obligatoria,
          opciones: p.opciones,
        }))
      : [preguntaNueva()],
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiarPregunta = (llave: string, cambios: Partial<PreguntaEditable>) =>
    setPreguntas((ps) => ps.map((p) => (p.llave === llave ? { ...p, ...cambios } : p)));

  const mover = (indice: number, delta: -1 | 1) =>
    setPreguntas((ps) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= ps.length) return ps;
      const copia = [...ps];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });

  /** Lo mismo que rechazaría guardar_encuesta, dicho antes de ir a la base. */
  const problema = (): string | null => {
    if (!titulo.trim()) return "Ponle un título a la encuesta.";
    if (preguntas.length === 0) return "Agrega al menos una pregunta.";
    for (const [i, p] of preguntas.entries()) {
      if (!p.texto.trim()) return `La pregunta ${i + 1} no tiene texto.`;
      if (LLEVA_OPCIONES(p.tipo) && p.opciones.filter((o) => o.texto.trim()).length < 2) {
        return `La pregunta ${i + 1} necesita al menos dos opciones.`;
      }
    }
    return null;
  };

  const guardar = async () => {
    const falta = problema();
    if (falta) {
      setError(falta);
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await guardarEncuesta({
      id: inicial?.id,
      titulo,
      descripcion,
      incluye_registro: incluyeRegistro,
      mensaje_final: mensajeFinal,
      congelada,
      preguntas: preguntas.map((p) => ({
        tipo: p.tipo,
        texto: p.texto,
        obligatoria: p.obligatoria,
        opciones: LLEVA_OPCIONES(p.tipo)
          ? p.opciones.filter((o) => o.texto.trim())
          : [],
      })),
    });
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo guardar la encuesta.");
      setGuardando(false);
      return;
    }
    router.push(`/encuestas/${r.datos}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Caja icono={MessageSquareText} titulo="La encuesta">
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Título" apoyo="Es lo primero que ve quien escanea">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={120}
              className="campo"
            />
          </Campo>
          <Campo etiqueta="Descripción" apoyo="Opcional">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={600}
              rows={3}
              className="campo min-h-24 resize-y py-2"
            />
          </Campo>
        </div>
      </Caja>

      <Caja icono={UserPlus} titulo="Registro de la persona">
        <button
          type="button"
          role="switch"
          aria-checked={incluyeRegistro}
          disabled={congelada}
          onClick={() => setIncluyeRegistro((v) => !v)}
          className={cn(
            "flex w-full items-start gap-3 rounded-[var(--radio-control)] border p-3 text-left transition-colors",
            incluyeRegistro
              ? "border-[var(--naranja)] bg-[var(--naranja-suave)]"
              : "border-[var(--borde)] bg-[var(--superficie)]",
            congelada && "opacity-70",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors",
              incluyeRegistro ? "bg-[var(--naranja)]" : "bg-[var(--superficie-hundida)]",
            )}
          >
            <span
              className={cn(
                "size-5 rounded-full bg-white shadow transition-transform",
                incluyeRegistro && "translate-x-4",
              )}
            />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-tinta">
              Pedir sus datos antes de las preguntas
            </span>
            <span className="text-sm text-tinta-suave">
              Como un registro de brigadista: nombre, teléfono, colonia y calle, ubicación si la
              comparte, género, fecha de nacimiento, si quiere participar o recibir información,
              y el aviso de privacidad. La persona entra a Personas alcanzadas.
            </span>
            {congelada && (
              <span className="text-xs text-tinta-tenue">
                Ya tiene respuestas: esto ya no se puede cambiar.
              </span>
            )}
          </span>
        </button>
      </Caja>

      <Caja
        icono={ListChecks}
        titulo={`Preguntas (${preguntas.length})`}
      >
        {congelada && (
          <p className="mb-3 text-sm text-tinta-suave">
            Esta encuesta ya recibió respuestas, así que sus preguntas quedan como están. Para
            preguntar otra cosa, crea una encuesta nueva.
          </p>
        )}
        <ol className="flex flex-col gap-3">
          {preguntas.map((p, i) => (
            <li
              key={p.llave}
              className="rounded-[var(--radio-tarjeta)] border border-[var(--borde)] bg-[var(--superficie)] p-3.5"
            >
              <fieldset disabled={congelada} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="cifras grid size-7 shrink-0 place-items-center rounded-full bg-[var(--superficie-hundida)] text-xs font-semibold text-tinta-suave">
                    {i + 1}
                  </span>
                  <div className="segmento min-w-0 flex-1 overflow-x-auto">
                    {TIPOS_PREGUNTA.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={p.tipo === t}
                        onClick={() => cambiarPregunta(p.llave, { tipo: t })}
                      >
                        {ETIQUETA_TIPO_PREGUNTA[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={p.texto}
                  onChange={(e) => cambiarPregunta(p.llave, { texto: e.target.value })}
                  maxLength={300}
                  rows={2}
                  placeholder="Escribe la pregunta"
                  aria-label={`Texto de la pregunta ${i + 1}`}
                  className="campo min-h-12 resize-y py-2"
                />

                {LLEVA_OPCIONES(p.tipo) && (
                  <EditorOpciones
                    opciones={p.opciones}
                    alCambiar={(opciones) => cambiarPregunta(p.llave, { opciones })}
                    numero={i + 1}
                  />
                )}
                {p.tipo === "escala" && (
                  <p className="text-xs text-tinta-tenue">
                    Se contesta del 1 (nada) al 5 (mucho). La gráfica muestra el reparto y el
                    promedio.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-auto flex min-h-11 items-center gap-2 text-sm text-tinta-suave">
                    <input
                      type="checkbox"
                      checked={p.obligatoria}
                      onChange={(e) => cambiarPregunta(p.llave, { obligatoria: e.target.checked })}
                      className="size-4 accent-[var(--naranja)]"
                      style={{ minHeight: 0 }}
                    />
                    Obligatoria
                  </label>
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    className="boton px-3"
                    aria-label={`Subir pregunta ${i + 1}`}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === preguntas.length - 1}
                    className="boton px-3"
                    aria-label={`Bajar pregunta ${i + 1}`}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreguntas((ps) => ps.filter((x) => x.llave !== p.llave))}
                    disabled={preguntas.length === 1}
                    className="boton px-3"
                    aria-label={`Quitar pregunta ${i + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        {!congelada && (
          <button
            type="button"
            onClick={() => setPreguntas((ps) => [...ps, preguntaNueva()])}
            disabled={preguntas.length >= 40}
            className="boton mt-3 w-full"
          >
            <Plus className="size-4" aria-hidden />
            Agregar pregunta
          </button>
        )}
      </Caja>

      <Caja icono={MessageSquareText} titulo="Al terminar">
        <Campo
          etiqueta="Mensaje final"
          apoyo="Opcional. Debajo aparecen los mensajes de las opciones que eligió"
        >
          <textarea
            value={mensajeFinal}
            onChange={(e) => setMensajeFinal(e.target.value)}
            maxLength={600}
            rows={3}
            placeholder="Por ejemplo: Gracias. Te buscaremos para invitarte a la próxima jornada."
            className="campo min-h-24 resize-y py-2"
          />
        </Campo>
      </Caja>

      {error && (
        <p role="alert" className="text-sm text-alerta">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="boton-primario min-h-12 px-6 text-base"
        >
          {guardando ? "Guardando…" : inicial ? "Guardar cambios" : "Crear encuesta y generar QR"}
        </button>
        <button type="button" onClick={() => router.back()} className="boton min-h-12">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function EditorOpciones({
  opciones,
  alCambiar,
  numero,
}: {
  opciones: OpcionPregunta[];
  alCambiar: (o: OpcionPregunta[]) => void;
  numero: number;
}) {
  // Qué opciones tienen abierto su mensaje. Las que ya traen uno arrancan abiertas.
  const [conMensaje, setConMensaje] = useState<Set<string>>(
    () => new Set(opciones.filter((o) => o.mensaje).map((o) => o.id)),
  );

  const cambiar = (id: string, cambios: Partial<OpcionPregunta>) =>
    alCambiar(opciones.map((o) => (o.id === id ? { ...o, ...cambios } : o)));

  return (
    <div className="flex flex-col gap-2">
      {opciones.map((o, j) => (
        <div key={o.id} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              value={o.texto}
              onChange={(e) => cambiar(o.id, { texto: e.target.value })}
              maxLength={160}
              placeholder={`Opción ${j + 1}`}
              aria-label={`Pregunta ${numero}, opción ${j + 1}`}
              className="campo min-w-0 flex-1"
            />
            <button
              type="button"
              aria-pressed={conMensaje.has(o.id)}
              onClick={() => {
                const n = new Set(conMensaje);
                if (n.has(o.id)) {
                  n.delete(o.id);
                  cambiar(o.id, { mensaje: undefined });
                } else n.add(o.id);
                setConMensaje(n);
              }}
              className="chip px-3"
              title="Mensaje al final para quien elija esta opción"
            >
              <MessageSquareText className="size-4" aria-hidden />
              <span className="sr-only">Mensaje para quien elija la opción {j + 1}</span>
            </button>
            <button
              type="button"
              onClick={() => alCambiar(opciones.filter((x) => x.id !== o.id))}
              disabled={opciones.length <= 2}
              className="boton px-3"
              aria-label={`Quitar opción ${j + 1}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
          {conMensaje.has(o.id) && (
            <input
              value={o.mensaje ?? ""}
              onChange={(e) => cambiar(o.id, { mensaje: e.target.value })}
              maxLength={400}
              placeholder="Mensaje al final para quien elija esta opción"
              aria-label={`Mensaje de la opción ${j + 1}`}
              className="campo ml-4 w-[calc(100%-1rem)] border-dashed text-sm"
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => alCambiar([...opciones, { id: idOpcion(opciones), texto: "" }])}
        disabled={opciones.length >= 20}
        className="boton self-start"
      >
        <Plus className="size-4" aria-hidden />
        Opción
      </button>
    </div>
  );
}
