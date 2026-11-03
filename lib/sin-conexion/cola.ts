/**
 * La cola de capturas: lo que se registró en campo y todavía no llega a la base.
 *
 * Toda captura del registro rápido pasa por aquí, con señal o sin ella. Primero se escribe en el
 * teléfono y después se intenta mandar: así no hay dos caminos que mantener, y una captura nunca
 * vive solo en la memoria de una pestaña que el sistema puede matar.
 *
 * Sin librería de sincronización, por CLAUDE.md. No hace falta una: el teléfono solo **escribe**
 * capturas nuevas, nunca edita lo que ya está en la base, así que no hay conflictos que resolver.
 * El único choque posible —el teléfono repetido— lo resuelve lib/datos/capturas.ts igual que en
 * línea.
 *
 * Qué no hace: enviar en segundo plano con la app cerrada. Background Sync no existe en Safari de
 * iPhone, que es la mitad de los teléfonos de campo; el envío ocurre con la app abierta, al volver
 * la señal, al regresar a la app o con el botón "Enviar ahora" (components/sin-conexion).
 */

import {
  borrarDelAlmacen,
  delUsuario,
  guardarEnAlmacen,
  leerDelAlmacen,
} from "@/lib/sin-conexion/almacen";
import {
  enviarCaptura,
  type Avance,
  type Captura,
  type ResultadoEnvio,
} from "@/lib/datos/capturas";

export type EstadoPendiente =
  /** Esperando señal. */
  | "pendiente"
  /** La base no la aceptó. Se queda en el teléfono hasta que alguien la reintente o la descarte. */
  | "rechazada"
  /** Llegó, pero algo de ella no se guardó. Se queda hasta que quien capturó lo lea. */
  | "con_avisos";

export type Pendiente = {
  id: string;
  usuarioId: string;
  /** Cuándo se capturó, en el reloj del teléfono. Solo para mostrar: la base pone su propia fecha. */
  capturadaEn: string;
  captura: Captura;
  avance: Avance;
  estado: EstadoPendiente;
  /** Por qué no se ha enviado o qué no se guardó. */
  motivo: string | null;
  intentos: number;
  /** Lo que se le muestra a quien capturó para reconocerla: nombre y sección. */
  titulo: string;
  detalle: string;
};

const EVENTO = "soet:cola";
const MOTIVO_SESION = "Tu sesión terminó. Vuelve a entrar para enviarla.";

// Otras pestañas de la misma app también pintan el contador.
const canal =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("soet-cola");

function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO));
  canal?.postMessage("cambio");
}

/** Para redibujar cuando la cola cambie, en esta pestaña o en otra. Devuelve con qué desuscribirse. */
export function alCambiarLaCola(hacer: () => void): () => void {
  const oyenteCanal = () => hacer();
  window.addEventListener(EVENTO, hacer);
  canal?.addEventListener("message", oyenteCanal);
  return () => {
    window.removeEventListener(EVENTO, hacer);
    canal?.removeEventListener("message", oyenteCanal);
  };
}

export async function listarCola(usuarioId: string): Promise<Pendiente[]> {
  const todos = await delUsuario<Pendiente>(usuarioId);
  return todos.sort((a, b) => a.capturadaEn.localeCompare(b.capturadaEn));
}

/**
 * Un solo envío a la vez, también entre pestañas. Sin esto, el formulario y el envío automático
 * podían mandar la misma captura al mismo tiempo: no duplicaría nada —los ids lo impiden—, pero
 * los dos anotarían avances encima del otro.
 */
let cadena: Promise<unknown> = Promise.resolve();
function conCandado<T>(hacer: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("soet-cola", hacer) as Promise<T>;
  }
  const siguiente = cadena.then(hacer, hacer);
  cadena = siguiente.catch(() => undefined);
  return siguiente;
}

async function intentar(p: Pendiente): Promise<ResultadoEnvio> {
  const r = await enviarCaptura(p.captura, p.avance, async () => {
    await guardarEnAlmacen(p);
  });
  p.intentos += 1;

  if (r.estado === "enviada") {
    if (r.avisos.length > 0) {
      p.estado = "con_avisos";
      p.motivo = r.avisos.join(" ");
      await guardarEnAlmacen(p);
    } else {
      await borrarDelAlmacen(p.id);
    }
  } else if (r.estado === "rechazada") {
    p.estado = "rechazada";
    p.motivo = r.motivo;
    await guardarEnAlmacen(p);
  } else {
    p.motivo = r.estado === "sesion" ? MOTIVO_SESION : null;
    await guardarEnAlmacen(p);
  }

  avisarCambio();
  return r;
}

/**
 * Desde el formulario: la guarda en el teléfono y la intenta mandar en el acto.
 *
 * Si la base la rechaza en ese primer intento se borra del teléfono, porque quien captura está
 * viendo el error en el formulario y la va a corregir ahí mismo, igual que antes de la cola. Si
 * llega con avisos, también se borra: el formulario se los muestra en la pantalla de éxito.
 */
export async function guardarCaptura(
  usuarioId: string,
  captura: Captura,
  rotulo: { titulo: string; detalle: string },
): Promise<ResultadoEnvio & { enTelefono: boolean }> {
  const p: Pendiente = {
    id: captura.id,
    usuarioId,
    capturadaEn: new Date().toISOString(),
    captura,
    avance: {},
    estado: "pendiente",
    motivo: null,
    intentos: 0,
    ...rotulo,
  };

  let enTelefono = true;
  try {
    await guardarEnAlmacen(p);
    avisarCambio();
  } catch (e) {
    // Sin almacén (navegación privada estricta, disco lleno) se manda directo, como antes de la
    // cola. Lo que no se puede es prometer que se guardó si tampoco hay red.
    console.error(e);
    enTelefono = false;
  }

  if (enTelefono && typeof navigator !== "undefined" && !navigator.onLine) {
    return { estado: "sin_red", enTelefono };
  }

  const r = enTelefono
    ? await conCandado(() => intentar(p))
    : await enviarCaptura(captura, p.avance, async () => {});

  if (enTelefono && (r.estado === "rechazada" || r.estado === "enviada")) {
    await borrarDelAlmacen(p.id);
    avisarCambio();
  }

  if (!enTelefono && (r.estado === "sin_red" || r.estado === "sesion")) {
    return {
      estado: "rechazada",
      motivo:
        "No hay señal y este navegador no deja guardar en el teléfono. Intenta de nuevo cuando haya señal.",
      enTelefono,
    };
  }
  return { ...r, enTelefono };
}

/**
 * Manda todo lo pendiente de este usuario, en el orden en que se capturó. Se detiene en la primera
 * falta de red o de sesión: si una no pasó, las demás tampoco van a pasar ahora.
 */
export function enviarPendientes(usuarioId: string): Promise<{ enviadas: number }> {
  return conCandado(async () => {
    let enviadas = 0;
    for (const { id } of await listarCola(usuarioId)) {
      // Se vuelve a leer dentro del candado: el formulario pudo haberla mandado o avanzado.
      const p = await leerDelAlmacen<Pendiente>(id);
      if (!p || p.estado !== "pendiente") continue;
      const r = await intentar(p);
      if (r.estado === "enviada") enviadas += 1;
      if (r.estado === "sin_red" || r.estado === "sesion") break;
    }
    return { enviadas };
  });
}

/** Una rechazada vuelve a la fila. Sirve cuando el administrador reabrió la actividad. */
export async function reintentar(id: string): Promise<void> {
  const p = await leerDelAlmacen<Pendiente>(id);
  if (!p) return;
  p.estado = "pendiente";
  p.motivo = null;
  await guardarEnAlmacen(p);
  avisarCambio();
}

/** Borra una captura del teléfono. Si no llegó a la base, se pierde: la interfaz lo confirma antes. */
export async function descartar(id: string): Promise<void> {
  await borrarDelAlmacen(id);
  avisarCambio();
}

/** Al cerrar sesión. Lo que no se envió se pierde: la salida lo advierte antes. */
export async function borrarColaDeUsuario(usuarioId: string): Promise<void> {
  for (const p of await delUsuario<Pendiente>(usuarioId)) {
    await borrarDelAlmacen(p.id);
  }
  avisarCambio();
}
