/**
 * Compresión obligatoria en el navegador antes de subir una foto de actividad: canvas, lado mayor
 * 1600 píxeles, WebP calidad 0.75. Si después de comprimir el archivo sigue arriba de 400 KB, se
 * rechaza con un mensaje claro en vez de subir algo pesado.
 *
 * Safari de iPhone **no codifica WebP** desde canvas: `toBlob(..., "image/webp")` no falla, regresa
 * un PNG sin avisar, y una foto de cámara a 1600 px en PNG pesa 4 MB o más. Por eso se revisa el
 * `type` del blob que de verdad salió y, si no es WebP, se codifica en JPEG, que Safari sí produce.
 * Si aun así pasa del límite, se baja la calidad y luego el tamaño antes de rendirse.
 */

const LADO_MAYOR = 1600;
const LIMITE_BYTES = 400 * 1024;
const CALIDADES = [0.75, 0.6, 0.45];
const ESCALAS = [1, 0.75, 0.5];

export type ResultadoCompresion =
  | { ok: true; archivo: File }
  | { ok: false; error: string };

function codificar(lienzo: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad));
}

export async function comprimirFoto(original: File): Promise<ResultadoCompresion> {
  if (!original.type.startsWith("image/")) {
    return { ok: false, error: "Solo se pueden subir imágenes." };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original);
  } catch {
    return { ok: false, error: "No se pudo leer esta imagen." };
  }

  const lienzo = document.createElement("canvas");
  const contexto = lienzo.getContext("2d");
  if (!contexto) {
    bitmap.close();
    return { ok: false, error: "Este navegador no puede comprimir imágenes." };
  }

  const escalaBase = Math.min(1, LADO_MAYOR / Math.max(bitmap.width, bitmap.height));
  let tipo = "image/webp";
  let ultimo: Blob | null = null;

  try {
    for (const factor of ESCALAS) {
      lienzo.width = Math.max(1, Math.round(bitmap.width * escalaBase * factor));
      lienzo.height = Math.max(1, Math.round(bitmap.height * escalaBase * factor));
      contexto.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);

      for (const calidad of CALIDADES) {
        let blob = await codificar(lienzo, tipo, calidad);
        if (blob && blob.type !== tipo) {
          // El navegador ignoró el tipo pedido (Safari con WebP). De aquí en adelante, JPEG.
          tipo = "image/jpeg";
          blob = await codificar(lienzo, tipo, calidad);
        }
        if (!blob) continue;
        ultimo = blob;
        if (blob.size <= LIMITE_BYTES) {
          const extension = blob.type === "image/webp" ? "webp" : "jpg";
          const nombre = original.name.replace(/\.[^.]+$/, "") + "." + extension;
          return { ok: true, archivo: new File([blob], nombre, { type: blob.type }) };
        }
      }
    }
  } finally {
    bitmap.close();
  }

  if (!ultimo) {
    return { ok: false, error: "No se pudo comprimir la imagen." };
  }

  const kb = Math.round(ultimo.size / 1024);
  return {
    ok: false,
    error: `La foto pesa ${kb} KB después de comprimirla; el máximo son 400 KB. Prueba con otra foto o recórtala antes.`,
  };
}
