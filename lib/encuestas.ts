/**
 * Encuestas con QR: tipos y reglas que comparten la pantalla del administrador, la página pública
 * /e/[codigo] y el handler que recibe las respuestas.
 *
 * Aquí no hay acceso a datos. La validación de fondo vive en la base (`responder_encuesta` y
 * `guardar_encuesta`, supabase/seguridad.sql, sección 14); lo de este archivo solo sirve para que
 * la pantalla no deje avanzar con algo que la base va a rechazar.
 */

export type TipoPregunta = "opcion_unica" | "opcion_multiple" | "escala" | "texto";

export const TIPOS_PREGUNTA: readonly TipoPregunta[] = [
  "opcion_unica",
  "opcion_multiple",
  "escala",
  "texto",
];

export const ETIQUETA_TIPO_PREGUNTA: Record<TipoPregunta, string> = {
  opcion_unica: "Una opción",
  opcion_multiple: "Varias opciones",
  escala: "Escala 1 a 5",
  texto: "Texto libre",
};

export type OpcionPregunta = {
  /** Corto, en minúsculas y dígitos. Lo genera el editor; la respuesta guarda este id. */
  id: string;
  texto: string;
  /** Se le muestra al final a quien eligió esta opción. */
  mensaje?: string;
};

export type PreguntaEncuesta = {
  id: string;
  orden: number;
  tipo: TipoPregunta;
  texto: string;
  obligatoria: boolean;
  opciones: OpcionPregunta[];
};

/** Lo único que sale de la base hacia una persona sin cuenta. */
export type EncuestaPublica = {
  codigo: string;
  titulo: string;
  descripcion: string | null;
  incluye_registro: boolean;
  mensaje_final: string | null;
  preguntas: PreguntaEncuesta[];
};

/** Valor de una respuesta: id de opción, ids de opciones, punto de la escala o texto. */
export type ValorRespuesta = string | string[] | number;

export type DatosRegistroPublico = {
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  telefono: string;
  calle: string;
  colonia_id: number | null;
  lat: number | null;
  lng: number | null;
  genero: string | null;
  fecha_nacimiento: string;
  quiere_participar: boolean;
  quiere_info: boolean;
  consiente: boolean;
  aviso_version: string;
};

/** Mismo texto y versión que el registro de brigadista: un solo aviso, provisional. */
export const AVISO_VERSION_ENCUESTA = "provisional-1";

/** Escala fija. Si algún día se quiere de 1 a 10, cambia aquí y en responder_encuesta. */
export const PUNTOS_ESCALA = [1, 2, 3, 4, 5] as const;

export function respuestaVacia(valor: ValorRespuesta | undefined): boolean {
  if (valor === undefined) return true;
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

/**
 * Los mensajes del final: el general de la encuesta y, debajo, el de cada opción elegida que
 * traiga uno, en el orden de las preguntas. Sin repetir el mismo texto dos veces.
 */
export function mensajesFinales(
  encuesta: Pick<EncuestaPublica, "mensaje_final" | "preguntas">,
  respuestas: Record<string, ValorRespuesta>,
): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const p of encuesta.preguntas) {
    const valor = respuestas[p.id];
    const elegidas = Array.isArray(valor) ? valor : typeof valor === "string" ? [valor] : [];
    for (const o of p.opciones) {
      if (o.mensaje && elegidas.includes(o.id) && !vistos.has(o.mensaje)) {
        vistos.add(o.mensaje);
        salida.push(o.mensaje);
      }
    }
  }
  return salida;
}

/** Id corto para una opción nueva. No necesita ser secreto, solo único dentro de la pregunta. */
export function idOpcion(existentes: readonly { id: string }[]): string {
  const usados = new Set(existentes.map((o) => o.id));
  for (;;) {
    const id = Math.random().toString(36).slice(2, 8);
    if (/^[a-z0-9]{1,12}$/.test(id) && !usados.has(id)) return id;
  }
}

/** La ruta pública. El QR codifica esta ruta sobre el origen del despliegue. */
export function rutaPublica(codigo: string): string {
  return `/e/${codigo}`;
}
