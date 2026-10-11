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

/**
 * Cinco minutos.
 *
 * Una URL firmada es una credencial al portador: quien la tenga ve la foto, sin sesión y sin que
 * importe que se le haya quitado el acceso. Estaba en una hora, y eso significaba que una URL
 * copiada del inspector seguía sirviendo evidencia una hora después de dar de baja a quien la
 * copió. Cinco minutos cubre el uso real —se abre la galería y se mira— porque cada montaje de la
 * galería vuelve a firmar en lote; no cubre guardarse el enlace, que es justo lo que no debe
 * funcionar.
 */
const SEGUNDOS_POR_OMISION = 300;

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
 * Sube una foto y devuelve su **ruta** dentro de la cubeta.
 *
 * No sube a Storage directamente, aunque antes sí lo hacía. Va por `POST /api/fotos`, que valida
 * los bytes en el servidor y quita los metadatos, porque la cubeta compara el `Content-Type` que
 * declara el cliente y no el contenido: con la subida directa se podía meter cualquier cosa de
 * hasta 500 KB etiquetándola `image/webp`. Medido, no supuesto.
 *
 * El nombre del archivo lo pone el servidor. Aquí solo se dice en qué actividad va y si es la foto
 * de inicio, la de fin o una de la galería, porque la ruta es lo que las políticas de lectura usan
 * para decidir quién ve la foto: no la elige el cliente.
 *
 * Degrada con aviso en español en lugar de lanzar, igual que el resto de la capa de datos.
 */
/**
 * Los tres destinos posibles de una foto. Son los de `MomentoFoto` más la galería, y el servidor
 * no acepta otro: la ruta es lo que las políticas de lectura usan para decidir quién ve la foto,
 * así que no la elige el cliente.
 */
export type PrefijoFoto = "inicio" | "cierre" | "galeria";

export type SubidaFoto = { ok: true; ruta: string } | { ok: false; aviso: string };

export async function subirFoto(
  actividadId: string,
  archivo: File,
  prefijo?: PrefijoFoto,
): Promise<SubidaFoto> {
  const cuerpo = new FormData();
  cuerpo.set("actividadId", actividadId);
  cuerpo.set("archivo", archivo);
  if (prefijo) cuerpo.set("prefijo", prefijo);

  try {
    const respuesta = await fetch("/api/fotos", { method: "POST", body: cuerpo });
    const datos = (await respuesta.json().catch(() => null)) as
      | { ruta?: string; mensaje?: string }
      | null;

    if (!respuesta.ok || !datos?.ruta) {
      return { ok: false, aviso: datos?.mensaje ?? "No se pudo subir la foto." };
    }
    return { ok: true, ruta: datos.ruta };
  } catch {
    return { ok: false, aviso: "No se pudo contactar al servidor. Revisa tu conexión." };
  }
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

/**
 * Borra archivos de la cubeta. Lo usa la eliminación de actividades: la base no puede borrar
 * objetos de Storage desde SQL, así que regresa las rutas y el cliente las borra aquí. Si falla,
 * los renglones ya no existen y los archivos quedan huérfanos: nadie los enlaza y solo el
 * administrador los alcanza. Se avisa en consola; no se revierte nada.
 */
export async function borrarArchivos(rutas: string[]): Promise<boolean> {
  if (rutas.length === 0) return true;
  const supabase = clienteSupabase();
  if (!supabase) return false;
  const { error } = await supabase.storage.from(CUBETA_FOTOS).remove(rutas);
  if (error) console.warn("No se pudieron borrar los archivos de la actividad:", error);
  return !error;
}
