import { json, portonSesion } from "@/lib/api/porton-admin";
import { validarYLimpiar } from "@/lib/api/imagen";
import { clienteAdministrador } from "@/lib/supabase-administrador";
import { clienteServidor } from "@/lib/supabase-servidor";
import { CUBETA_FOTOS } from "@/lib/datos/almacenamiento";

/**
 * Subida de fotos de evidencia.
 *
 * Antes el navegador subía directo a Storage con la sesión de quien capturaba, y la política
 * `almacen_fotos_insert` decidía si podía. Eso cubría **a quién** y **a dónde**, pero no **qué**:
 * la cubeta compara el `Content-Type` que declara el cliente, no los bytes. Medido el 11 de
 * octubre de 2026 con una sesión real de brigadista: texto plano con la cabecera
 * `content-type: image/webp` subió con **200**.
 *
 * Así que la subida pasa por aquí, y la política de INSERT directo se quitó. Dos consecuencias
 * que conviene tener presentes:
 *
 * - **Es el único camino.** Si este handler falla, no se suben fotos. A cambio, no hay un segundo
 *   camino sin validar, que es exactamente lo que se quería cerrar.
 * - La autorización **no se reimplementa aquí**. Se le pregunta a la base con el cliente de la
 *   petición: si RLS no le entrega esa actividad abierta, no puede subirle fotos. Mismo principio
 *   que el portón de administración, y la misma fuente de verdad que
 *   `privado.actividad_abierta_mia`. Nunca se confía en un id que venga del cuerpo sin
 *   contrastarlo contra lo que esa sesión alcanza.
 *
 * La inserción en la tabla `fotos` sigue haciéndola el cliente con `agregarFoto`, bajo RLS. No se
 * movió a propósito: aquí solo se cierra el agujero de los bytes.
 */

/** Los mismos prefijos que usaba rutaDeFoto. Nada más, para que la ruta no la elija el cliente. */
const PREFIJOS = new Set(["inicio", "cierre", "galeria"]);

export async function POST(peticion: Request) {
  const porton = await portonSesion();
  if (!porton.ok) return json({ mensaje: porton.mensaje }, porton.estado);

  let formulario: FormData;
  try {
    formulario = await peticion.formData();
  } catch {
    return json({ mensaje: "La petición no trae un formulario válido." }, 400);
  }

  const actividadId = formulario.get("actividadId");
  const prefijoCrudo = formulario.get("prefijo");
  const archivo = formulario.get("archivo");

  if (typeof actividadId !== "string" || !actividadId) {
    return json({ mensaje: "Falta la actividad." }, 400);
  }
  if (!(archivo instanceof File)) {
    return json({ mensaje: "Falta la foto." }, 400);
  }
  // Un prefijo libre dejaría que el cliente escribiera la ruta, y la ruta es lo que las políticas
  // de lectura usan para decidir quién ve la foto.
  const prefijo =
    typeof prefijoCrudo === "string" && PREFIJOS.has(prefijoCrudo) ? prefijoCrudo : "galeria";

  // La autorización, preguntada a la base y no decidida aquí.
  const supabase = await clienteServidor();
  if (!supabase) {
    return json({ mensaje: "Este despliegue no está conectado a la base de datos." }, 503);
  }
  const { data: actividad } = await supabase
    .from("actividades")
    .select("id")
    .eq("id", actividadId)
    .in("estatus", ["programada", "en_curso"])
    .maybeSingle<{ id: string }>();

  if (!actividad) {
    return json(
      { mensaje: "No puedes subir fotos a esta actividad. Revisa que sigas invitado y que no esté cerrada." },
      403,
    );
  }

  const limpia = validarYLimpiar(new Uint8Array(await archivo.arrayBuffer()));
  if (!limpia.ok) return json({ mensaje: limpia.error }, 400);

  const admin = clienteAdministrador();
  if (!admin) {
    return json({ mensaje: "Este despliegue no tiene configurada la llave secreta." }, 503);
  }

  // El nombre lo pone el servidor, con marca de tiempo y azar: nunca se sobreescribe un objeto, y
  // por eso la cubeta tampoco necesita política de UPDATE.
  const azar = crypto.randomUUID().slice(0, 8);
  const ruta = `actividades/${actividadId}/${prefijo}-${Date.now()}-${azar}.${limpia.extension}`;

  const { error } = await admin.storage
    .from(CUBETA_FOTOS)
    .upload(ruta, limpia.bytes, { contentType: limpia.tipo, upsert: false });

  if (error) {
    console.error("No se pudo subir la foto:", error);
    return json({ mensaje: "No se pudo subir la foto. Intenta de nuevo." }, 502);
  }

  return json({ ruta });
}
