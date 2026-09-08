/**
 * Compresión obligatoria en el navegador antes de subir una foto de actividad: canvas, lado mayor
 * 1600 píxeles, WebP calidad 0.75. Si después de comprimir el archivo sigue arriba de 400 KB, se
 * rechaza con un mensaje claro en vez de subir algo pesado.
 */

const LADO_MAYOR = 1600;
const CALIDAD = 0.75;
const LIMITE_BYTES = 400 * 1024;

export type ResultadoCompresion =
  | { ok: true; archivo: File }
  | { ok: false; error: string };

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

  const escala = Math.min(1, LADO_MAYOR / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext("2d");
  if (!contexto) {
    bitmap.close();
    return { ok: false, error: "Este navegador no puede comprimir imágenes." };
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolver) =>
    lienzo.toBlob(resolver, "image/webp", CALIDAD),
  );

  if (!blob) {
    return { ok: false, error: "No se pudo comprimir la imagen." };
  }

  if (blob.size > LIMITE_BYTES) {
    const kb = Math.round(blob.size / 1024);
    return {
      ok: false,
      error: `La foto pesa ${kb} KB después de comprimirla; el máximo son 400 KB. Prueba con otra foto o recórtala antes.`,
    };
  }

  const nombre = original.name.replace(/\.[^.]+$/, "") + ".webp";
  return { ok: true, archivo: new File([blob], nombre, { type: "image/webp" }) };
}
