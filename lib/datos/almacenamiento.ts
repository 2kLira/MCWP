import { clienteSupabase } from "@/lib/supabase";

/**
 * Entrega de fotos desde un bucket privado.
 *
 * El bucket `fotos` no es público, así que no hay URL permanente: cada imagen se firma en el
 * momento de mostrarla y la firma caduca. Por eso **la columna `fotos.url` guarda la ruta dentro
 * del bucket, no una URL**: persistir una URL firmada haría que la columna se pudriera sola.
 *
 * Se firma en lote, un viaje para toda la galería, no uno por foto.
 */

export const CUBETA_FOTOS = "fotos";

/** Una hora. Si una jornada dura más, se recarga la pantalla y se vuelve a firmar. */
const SEGUNDOS_POR_OMISION = 3600;

/**
 * Firma varias rutas de una sola vez. Devuelve un mapa de ruta a URL firmada.
 *
 * Degrada en silencio y nunca lanza: si falta configuración devuelve el mapa vacío, y si una foto
 * concreta no se puede firmar —porque la política no la alcanza— esa se queda fuera del mapa y el
 * resto de la galería se pinta igual. `createSignedUrls` reporta el fallo por elemento, no tira
 * toda la llamada.
 */
export async function firmarFotos(
  rutas: readonly string[],
  segundos = SEGUNDOS_POR_OMISION,
): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>();
  if (rutas.length === 0) return firmadas;

  const supabase = clienteSupabase();
  if (!supabase) return firmadas;

  const unicas = [...new Set(rutas)];
  const { data, error } = await supabase.storage
    .from(CUBETA_FOTOS)
    .createSignedUrls(unicas, segundos);

  if (error || !data) return firmadas;

  for (const entrada of data) {
    // `path` viene en la respuesta por elemento; si esa foto falló, trae error y no signedUrl.
    if (entrada.path && entrada.signedUrl) firmadas.set(entrada.path, entrada.signedUrl);
  }
  return firmadas;
}

/**
 * La ruta de una foto nueva dentro del bucket.
 *
 * El prefijo `actividades/` no es decorativo: las políticas de `storage.objects` leen el segundo
 * segmento como el id de la actividad, con `privado.actividad_de_ruta`. Sin el prefijo, leerían
 * el nombre del archivo como si fuera un uuid.
 */
export function rutaDeFoto(actividadId: string, prefijo?: string): string {
  const azar = Math.random().toString(36).slice(2);
  const nombre = [prefijo, Date.now(), azar].filter(Boolean).join("-");
  return `actividades/${actividadId}/${nombre}.webp`;
}

/**
 * Traducción de los rechazos de Storage.
 *
 * Existe aparte de la tabla de códigos de `lib/datos/cliente.ts` por una razón concreta: esa
 * traduce `PostgrestError`, y la subida del archivo la contesta Storage con un `StorageError`,
 * que nunca pasa por `resultado()`. Sin esto, un rechazo de `almacen_fotos_insert` se mostraba
 * crudo y en inglés.
 *
 * Misma regla que en cliente.ts: lo desconocido NO se tapa con una frase amable, se muestra tal
 * cual y el objeto completo va a la consola.
 */
export function avisoDeAlmacenamiento(mensaje: string): string {
  if (/row-level security|unauthorized|not authorized|forbidden|permission/i.test(mensaje)) {
    return "No puedes subir fotos a esta actividad. Revisa que sigas invitado y que no esté cerrada.";
  }
  if (/jwt|token|expired/i.test(mensaje)) {
    return "Tu sesión terminó. Vuelve a entrar.";
  }
  if (/exceeded the maximum allowed size|payload too large/i.test(mensaje)) {
    return "La foto pesa más de lo que acepta el sistema, incluso comprimida.";
  }
  if (/mime type|not supported/i.test(mensaje)) {
    return "Ese formato de imagen no se acepta.";
  }
  return `No se pudo subir la foto: ${mensaje}.`;
}
