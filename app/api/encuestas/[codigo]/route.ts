import { avisarFaltaConfiguracion, json } from "@/lib/api/porton-admin";
import { clienteAdministrador } from "@/lib/supabase-administrador";

/**
 * Respuestas de una encuesta pública, sin cuenta.
 *
 * Es la única puerta del sistema por la que entra gente sin sesión, y no abre la sección 1 de
 * seguridad.sql: anon sigue sin acceso a nada. Este handler llama a `responder_encuesta` con la
 * llave secreta, y esa función —que solo service_role puede ejecutar— es la que decide si la
 * encuesta sigue abierta, qué preguntas existen, qué opciones valen y qué pasa con un teléfono que
 * ya está en el padrón. Aquí no se repite nada de eso.
 *
 * Lo que sí se hace aquí, porque la base no lo puede ver:
 *
 * - **Tamaño.** Un cuerpo de más de 32 KB no es una encuesta contestada a mano.
 * - **Trampa para bots.** El formulario trae un campo `sitio` escondido que una persona nunca
 *   llena. Si llega lleno se contesta que sí se guardó y no se guarda nada: a un bot no se le
 *   enseña qué lo delató.
 * - **Prisa.** `abierta_ms` es cuánto tardó la persona desde que abrió la página. Menos de tres
 *   segundos tampoco es una persona. Mismo trato que la trampa.
 *
 * No hay límite por IP. Está anotado en PENDIENTES.md: se resuelve con una regla de límite de
 * tasa en el firewall de Vercel sobre /api/encuestas, sin código.
 */

const TAMANO_MAXIMO = 32 * 1024;
const PRISA_MINIMA_MS = 3000;

export async function POST(peticion: Request, contexto: RouteContext<"/api/encuestas/[codigo]">) {
  const { codigo } = await contexto.params;
  if (!/^[a-z0-9]{10}$/.test(codigo)) {
    return json({ mensaje: "Esta encuesta no existe." }, 404);
  }

  const crudo = await peticion.text();
  if (crudo.length > TAMANO_MAXIMO) {
    return json({ mensaje: "La respuesta es demasiado grande." }, 413);
  }

  let cuerpo: {
    respuestas?: unknown;
    persona?: unknown;
    sitio?: unknown;
    abierta_ms?: unknown;
  };
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return json({ mensaje: "La respuesta llegó mal formada." }, 400);
  }

  const esBot =
    (typeof cuerpo.sitio === "string" && cuerpo.sitio !== "") ||
    typeof cuerpo.abierta_ms !== "number" ||
    cuerpo.abierta_ms < PRISA_MINIMA_MS;
  if (esBot) return json({ ok: true });

  const supabase = clienteAdministrador();
  if (!supabase) {
    avisarFaltaConfiguracion("llave secreta", "respuestas de encuesta");
    return json({ mensaje: "No se pudo guardar por una falla del sistema. Intenta más tarde." }, 503);
  }

  const { error } = await supabase.rpc("responder_encuesta", {
    p_codigo: codigo,
    p_respuestas: cuerpo.respuestas ?? {},
    p_persona: cuerpo.persona ?? null,
  });

  if (error) {
    // Los raise de responder_encuesta llegan con P0001 y ya están escritos para quien contesta.
    // Cualquier otra cosa es una falla nuestra: el detalle va al registro, no a la pantalla.
    if (error.code === "P0001") return json({ mensaje: error.message }, 422);
    console.error("[encuestas] responder_encuesta:", error);
    return json({ mensaje: "No se pudo guardar. Intenta de nuevo en un momento." }, 500);
  }

  return json({ ok: true });
}
