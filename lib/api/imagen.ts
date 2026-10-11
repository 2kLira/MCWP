import "server-only";

/**
 * Validación de imágenes por sus bytes, no por lo que diga el cliente.
 *
 * Por qué existe: la cubeta de Storage compara el `Content-Type` que **declara** quien sube, no el
 * contenido. Medido el 11 de octubre de 2026 con una sesión real de brigadista: un `POST` directo
 * a la API con texto plano y la cabecera `content-type: image/webp` devolvió **200**. El
 * compresor del navegador sí valida de verdad —`createImageBitmap` decodifica y el reencode por
 * canvas tira los bytes originales— pero es código de cliente, o sea opcional.
 *
 * Qué hace, en orden: comprueba el tamaño, comprueba la firma de los bytes, y quita los metadatos.
 *
 * Sobre los metadatos: el EXIF de una foto de celular lleva coordenadas GPS y el identificador del
 * dispositivo. La aplicación ya guarda a propósito la coordenada de cada foto en `fotos.lat/lng`,
 * así que el GPS no es la parte nueva; el identificador del equipo de una persona sí, y no hace
 * falta para nada. Se quita lo que no aporta.
 *
 * Deliberadamente **no** se usa una librería de imágenes. `sharp` está en el árbol como
 * dependencia transitiva de Next, pero usarla significaría declararla, y `CLAUDE.md` pide anotar
 * en `PENDIENTES.md` antes de sumar una librería. Recortar segmentos de un contenedor JPEG o RIFF
 * es caminar una lista encadenada; no hay que decodificar la imagen para eso.
 */

/** El mismo tope que la cubeta. Aquí se comprueba antes de gastar el viaje a Storage. */
export const LIMITE_BYTES = 512_000;

export type ImagenLimpia =
  | { ok: true; bytes: Uint8Array; tipo: "image/webp" | "image/jpeg"; extension: "webp" | "jpg" }
  | { ok: false; error: string };

/** `RIFF` …tamaño… `WEBP` */
function esWebp(b: Uint8Array): boolean {
  return (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  );
}

/** SOI: FF D8 FF */
function esJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/**
 * Quita de un JPEG los segmentos APP1 a APP15 y los comentarios, que es donde viven EXIF, XMP,
 * el perfil ICC y los bloques de Adobe.
 *
 * **APP0 se conserva** a propósito: es el JFIF, que solo trae densidad de píxeles y nada
 * personal, y es justo lo que escribe `canvas.toBlob("image/jpeg")` en Safari. Tirarlo también
 * sería correcto para un decodificador, pero no gana nada y abre la puerta a una sorpresa.
 *
 * Al llegar al inicio del escaneo (SOS, FF DA) se copia el resto tal cual: de ahí en adelante son
 * datos comprimidos, no segmentos, y buscar marcadores dentro produciría basura.
 */
function limpiarJpeg(b: Uint8Array): Uint8Array {
  const trozos: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let i = 2;

  while (i + 3 < b.length) {
    if (b[i] !== 0xff) break; // Estructura inesperada: se deja de recortar y se copia el resto.
    const marcador = b[i + 1];

    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      trozos.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marcador === 0xda || marcador === 0xd9) break; // SOS o EOI: el resto va entero.

    const largo = (b[i + 2] << 8) | b[i + 3];
    if (largo < 2 || i + 2 + largo > b.length) break;

    const esApp1aApp15 = marcador >= 0xe1 && marcador <= 0xef;
    const esComentario = marcador === 0xfe;
    if (!esApp1aApp15 && !esComentario) trozos.push(b.subarray(i, i + 2 + largo));
    i += 2 + largo;
  }

  if (i < b.length) trozos.push(b.subarray(i));

  const total = trozos.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(total);
  let desplazamiento = 0;
  for (const t of trozos) {
    salida.set(t, desplazamiento);
    desplazamiento += t.length;
  }
  return salida;
}

const CHUNKS_A_TIRAR = new Set(["EXIF", "XMP ", "ICCP"]);

/**
 * Quita de un WebP los chunks de metadatos y corrige las banderas de VP8X.
 *
 * El WebP que produce `canvas.toBlob` es de forma simple —`VP8 ` o `VP8L` justo después de
 * `WEBP`, sin contenedor extendido— y por tanto **no tiene metadatos que quitar**: el camino
 * normal de la aplicación sale por el `return` temprano sin tocar un byte. La parte que reescribe
 * solo se ejecuta con archivos que vienen de otro lado, que son precisamente los que hay que
 * limpiar.
 *
 * Si se recorta un chunk hay que apagar su bandera en VP8X o el archivo queda anunciando
 * metadatos que ya no están. Bits del primer byte de VP8X: 0x20 ICC, 0x08 EXIF, 0x04 XMP.
 */
function limpiarWebp(b: Uint8Array): Uint8Array {
  const leerFourCC = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  const leerU32 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);

  const conservados: Uint8Array[] = [];
  let hayQueTirar = false;
  let vp8xRelativo = -1;
  let i = 12;

  while (i + 8 <= b.length) {
    const nombre = leerFourCC(i);
    const tamano = leerU32(i + 4);
    if (tamano < 0 || i + 8 + tamano > b.length) break;
    const conRelleno = 8 + tamano + (tamano % 2); // los chunks se alinean a par

    if (CHUNKS_A_TIRAR.has(nombre)) {
      hayQueTirar = true;
    } else {
      if (nombre === "VP8X") vp8xRelativo = conservados.reduce((n, t) => n + t.length, 0);
      conservados.push(b.subarray(i, Math.min(i + conRelleno, b.length)));
    }
    i += conRelleno;
  }

  if (!hayQueTirar) return b;

  const cuerpo = conservados.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(12 + cuerpo);
  salida.set(b.subarray(0, 12), 0);
  let desplazamiento = 12;
  for (const t of conservados) {
    salida.set(t, desplazamiento);
    desplazamiento += t.length;
  }

  // El tamaño de RIFF cuenta todo lo que sigue a esos cuatro bytes, incluido "WEBP".
  const nuevoTamano = salida.length - 8;
  salida[4] = nuevoTamano & 0xff;
  salida[5] = (nuevoTamano >> 8) & 0xff;
  salida[6] = (nuevoTamano >> 16) & 0xff;
  salida[7] = (nuevoTamano >> 24) & 0xff;

  if (vp8xRelativo >= 0) {
    const banderas = 12 + vp8xRelativo + 8;
    if (banderas < salida.length) salida[banderas] &= ~0x20 & ~0x08 & ~0x04;
  }

  return salida;
}

export function validarYLimpiar(bytes: Uint8Array): ImagenLimpia {
  if (bytes.length === 0) return { ok: false, error: "El archivo llegó vacío." };
  if (bytes.length > LIMITE_BYTES) {
    const kb = Math.round(bytes.length / 1024);
    return { ok: false, error: `La foto pesa ${kb} KB y el máximo son 500 KB.` };
  }

  if (esWebp(bytes)) {
    return { ok: true, bytes: limpiarWebp(bytes), tipo: "image/webp", extension: "webp" };
  }
  if (esJpeg(bytes)) {
    return { ok: true, bytes: limpiarJpeg(bytes), tipo: "image/jpeg", extension: "jpg" };
  }

  // El mensaje no dice "firma de bytes" ni "magic number": dice qué hacer.
  return {
    ok: false,
    error: "Ese archivo no es una imagen WebP ni JPEG. Toma la foto desde la aplicación.",
  };
}
