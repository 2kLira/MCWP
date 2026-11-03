/**
 * Envío de una captura del registro rápido a la base.
 *
 * Es lo que antes hacía `guardar()` de formulario-registro.tsx en línea, paso por paso: persona,
 * nota de revisión, participación con sus problemáticas, petición. Se mudó aquí cuando la captura
 * empezó a poder esperar en el teléfono (lib/sin-conexion/cola.ts), y con la mudanza cambiaron
 * dos cosas:
 *
 * 1. **Todo paso se puede repetir sin duplicar.** Sin señal, lo normal es que un envío se corte a
 *    la mitad, o peor, que la base sí escriba y la respuesta no regrese. Por eso los ids los pone
 *    el teléfono y cada escritura es `ON CONFLICT DO NOTHING` sobre el id (o el upsert natural de
 *    participaciones y menciones): repetir el envío completo es seguro. Además el avance se va
 *    anotando, para no rehacer lo que ya se sabe hecho.
 * 2. **Se distingue "no hubo red" de "la base dijo que no".** Lo primero deja la captura
 *    esperando; lo segundo es un rechazo con motivo, igual que antes.
 *
 * Los permisos no cambian: cada escritura va con la sesión de quien envía y la juzga RLS
 * (supabase/seguridad.sql), igual que en línea. Los triggers de sellado siguen poniendo autor y
 * fecha; la fecha es la de llegada a la base, no la de captura (ver PENDIENTES.md).
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { db, resultado } from "@/lib/datos/cliente";
import type { EntradaPersona } from "@/lib/datos/personas";
import { difuminarPunto, normalizarTelefono } from "@/lib/territorio";
import type { Genero, RangoEdad } from "@/lib/tipos";

/** Cuánto se espera a la base por escritura. Con señal a medias, `fetch` no se rinde solo. */
const LIMITE_MS = 20_000;

/** Lo que el formulario dejó listo para enviar. Todo id lo generó el teléfono al capturar. */
export type CapturaPersona = {
  tipo: "persona";
  /** Id de la captura. Si la persona es nueva, es también su id en la base. */
  id: string;
  actividadId: string | null;
  /** La persona nueva. Null cuando solo se le agrega la participación a alguien que ya existe. */
  persona: EntradaPersona | null;
  personaExistenteId: string | null;
  /**
   * Al capturar ya se sabía que el teléfono existía en otra ficha: se guarda sin teléfono, y si
   * captura el administrador, con nota de revisión.
   */
  telefonoDuplicado: boolean;
  /** La nota de revisión va a seguimientos, que solo escribe el administrador. */
  esAdmin: boolean;
  comentario: string | null;
  problematicas: number[];
  peticion: string | null;
  solicitudId: string;
  seguimientoId: string;
};

export type CapturaContacto = {
  tipo: "contacto";
  id: string;
  actividadId: string | null;
  /** La resolvió el celular con el punto exacto, antes de difuminarlo. */
  seccionClave: string;
  coloniaId: number | null;
  /** El punto exacto. Se difumina antes de salir del celular, al enviar. */
  lat: number | null;
  lng: number | null;
  genero: Genero | null;
  rangoEdad: RangoEdad | null;
  peticion: string | null;
  comentario: string | null;
  problematicas: number[];
};

export type Captura = CapturaPersona | CapturaContacto;

/**
 * Lo que ya se sabe hecho. Se guarda junto con la captura en el teléfono entre intento e intento.
 * Ningún paso depende de esto para no duplicar —eso lo hacen los ids—; sirve para no repetir
 * viajes y para no perder lo que se averiguó en un intento anterior.
 */
export type Avance = {
  persona?: true;
  /** El teléfono resultó estar en otra ficha al enviar, y la persona se guardó sin él. */
  sinTelefono?: true;
  seguimiento?: true;
  participacionId?: string;
  menciones?: true;
  solicitud?: true;
  contacto?: true;
  /** Lo que no se guardó aunque la captura sí: se le muestra a quien capturó. */
  avisos?: string[];
};

export type ResultadoEnvio =
  | { estado: "enviada"; avisos: string[] }
  /** No hubo red, se agotó el tiempo o el servidor no contestó bien. Se reintenta después. */
  | { estado: "sin_red" }
  /** La sesión se venció y no se pudo renovar. Se reintenta al volver a entrar. */
  | { estado: "sesion" }
  /** La base no lo aceptó. Reintentar no lo arregla. */
  | { estado: "rechazada"; motivo: string };

type Respuesta = { error: PostgrestError | null; status: number };

class Interrupcion extends Error {
  constructor(readonly resultado: Exclude<ResultadoEnvio, { estado: "enviada" }>) {
    super(resultado.estado);
  }
}

function limite(): AbortSignal {
  return AbortSignal.timeout(LIMITE_MS);
}

/**
 * Status 0 es que `fetch` ni siquiera recibió respuesta: sin red, sin DNS o tiempo agotado
 * (postgrest-js convierte el AbortError en un error con status 0). Un 5xx o un 429 tampoco dicen
 * nada del dato. En los tres casos la captura se queda esperando.
 */
function esFallaDeTransporte({ status }: Respuesta): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function esSesionVencida({ error }: Respuesta): boolean {
  if (!error) return false;
  // Con el refresh token vencido, supabase-js manda la llave pública en lugar de un JWT, y anon
  // no tiene permiso sobre nada (sección 1 de seguridad.sql): de ahí el "permission denied".
  return (
    error.code === "PGRST301" ||
    error.code === "PGRST303" ||
    (error.code === "42501" && /permission denied/i.test(error.message))
  );
}

/** Si la respuesta no es éxito y no es un rechazo que quien llama quiera manejar, interrumpe. */
function exigir(r: Respuesta, contexto: string): void {
  if (!r.error) return;
  if (esFallaDeTransporte(r)) throw new Interrupcion({ estado: "sin_red" });
  if (esSesionVencida(r)) throw new Interrupcion({ estado: "sesion" });
  const motivo = resultado(null, r.error, null, contexto).aviso ?? "No se pudo guardar.";
  throw new Interrupcion({ estado: "rechazada", motivo });
}

/** Igual que `exigir`, pero un rechazo de la base no detiene la captura: queda como aviso. */
function tolerar(r: Respuesta, aviso: string, avance: Avance): boolean {
  if (!r.error) return true;
  if (esFallaDeTransporte(r)) throw new Interrupcion({ estado: "sin_red" });
  if (esSesionVencida(r)) throw new Interrupcion({ estado: "sesion" });
  console.error(r.error);
  avance.avisos = [...(avance.avisos ?? []), aviso];
  return false;
}

function esTelefonoRepetido({ error }: Respuesta): boolean {
  return error?.code === "23505" && /telefono/i.test(`${error.message} ${error.details}`);
}

const CONTEXTO_ACTIVIDAD =
  "Para registrar a alguien necesitas estar invitado a una actividad programada o en curso, y " +
  "capturar desde ella.";

function escribirPersona(id: string, persona: EntradaPersona, conTelefono: boolean) {
  const telefono = conTelefono ? persona.telefono_raw : null;
  return db()
    .from("personas")
    .upsert(
      { ...persona, id, telefono_raw: telefono, telefono_norm: normalizarTelefono(telefono) },
      // DO NOTHING sobre el id: si un intento anterior sí escribió, este no hace nada. El choque
      // con el teléfono de **otra** ficha sí se reporta, porque no es el árbitro del conflicto.
      { onConflict: "id", ignoreDuplicates: true },
    )
    .abortSignal(limite());
}

async function enviarPersona(c: CapturaPersona, avance: Avance, avanzar: () => Promise<void>) {
  let personaId = c.personaExistenteId;

  if (c.persona && !avance.persona) {
    let r: Respuesta = await escribirPersona(c.id, c.persona, !c.telefonoDuplicado);
    // Sin señal no se pudo revisar el teléfono al capturar. Si al llegar ya estaba en otra ficha,
    // se hace lo mismo que se habría hecho en línea con un brigadista: guardarla sin teléfono.
    if (esTelefonoRepetido(r) && !c.telefonoDuplicado) {
      r = await escribirPersona(c.id, c.persona, false);
      if (!r.error) {
        avance.sinTelefono = true;
        avance.avisos = [
          ...(avance.avisos ?? []),
          "El teléfono ya estaba registrado en otra ficha. Se guardó sin teléfono.",
        ];
      }
    }
    exigir(r, CONTEXTO_ACTIVIDAD);
    avance.persona = true;
    await avanzar();
  }
  if (c.persona) personaId = c.id;
  if (!personaId) return;

  // La nota de "marcada para revisión" va a seguimientos, que es tabla de gabinete y solo el
  // admin puede escribir. Para un brigadista rebotaría, así que no se intenta. Queda pendiente
  // decidir si la política se ensancha.
  const sinTelefono = c.telefonoDuplicado || avance.sinTelefono;
  if (c.persona && sinTelefono && c.esAdmin && !avance.seguimiento) {
    const r = await db()
      .from("seguimientos")
      .upsert(
        {
          id: c.seguimientoId,
          persona_id: personaId,
          tipo: "otro",
          nota:
            "Capturada sin teléfono porque el número ya existía en otra ficha. Queda marcada para revisión.",
          responsable_id: c.persona.registrada_por ?? null,
          estado: "pendiente",
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .abortSignal(limite());
    tolerar(r, "La nota de revisión del teléfono repetido no se guardó.", avance);
    avance.seguimiento = true;
    await avanzar();
  }

  if (c.actividadId && !avance.participacionId) {
    const r = await db()
      .from("participaciones")
      .upsert(
        {
          persona_id: personaId,
          actividad_id: c.actividadId,
          tipo: c.persona ? "registro" : "asistencia",
          // Lo sobrescribe privado.sellar_participacion con auth.uid(): quien envía es quien
          // capturó, porque la cola no envía capturas de otra cuenta.
          registrada_por: c.persona?.registrada_por ?? null,
          // La nota va en la participación, que es lo que muestra la ficha de la persona.
          comentario: c.comentario,
        },
        { onConflict: "persona_id,actividad_id", ignoreDuplicates: false },
      )
      .select("id")
      .abortSignal(limite())
      .single();
    if (tolerar(r, "La persona sí quedó, pero no su participación en la actividad.", avance)) {
      avance.participacionId = (r.data as { id: string }).id;
    } else {
      // Sin participación no hay de dónde colgar las problemáticas.
      avance.menciones = true;
    }
    await avanzar();
  }

  if (avance.participacionId && c.problematicas.length > 0 && !avance.menciones) {
    const r = await db()
      .from("menciones_problematica")
      .upsert(
        c.problematicas.map((id) => ({
          participacion_id: avance.participacionId,
          problematica_id: id,
          // Se copia en cada problemática porque la hoja de Problemáticas de la exportación la
          // lee de ahí.
          comentario: c.comentario,
        })),
        { onConflict: "participacion_id,problematica_id" },
      )
      .abortSignal(limite());
    tolerar(r, "La persona sí quedó registrada, pero no sus problemáticas.", avance);
    avance.menciones = true;
    await avanzar();
  }

  // La petición particular cae en solicitudes con requiere_seguimiento en verdadero, para que la
  // persona aparezca en la bandeja de seguimiento igual que quien quiere participar.
  if (c.peticion && !avance.solicitud) {
    const r = await db()
      .from("solicitudes")
      .upsert(
        {
          id: c.solicitudId,
          persona_id: personaId,
          participacion_id: avance.participacionId ?? null,
          tema: "Petición particular",
          descripcion: c.peticion,
          requiere_seguimiento: true,
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .abortSignal(limite());
    tolerar(r, "La petición no se guardó. Anótala y avísale al administrador.", avance);
    avance.solicitud = true;
    await avanzar();
  }
}

async function enviarContacto(c: CapturaContacto, avance: Avance, avanzar: () => Promise<void>) {
  if (!avance.contacto) {
    // El punto exacto nunca sale del celular: se difumina aquí, y la base lo vuelve a difuminar.
    const punto = c.lat !== null && c.lng !== null ? difuminarPunto(c.lng, c.lat) : null;
    const r = await db()
      .from("contactos_anonimos")
      .upsert(
        {
          id: c.id,
          actividad_id: c.actividadId,
          seccion_clave: c.seccionClave,
          colonia_id: c.coloniaId,
          lat: punto?.lat ?? null,
          lng: punto?.lng ?? null,
          genero: c.genero,
          rango_edad: c.rangoEdad,
          peticion: c.peticion,
          comentario: c.comentario,
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .abortSignal(limite());
    exigir(r, CONTEXTO_ACTIVIDAD);
    avance.contacto = true;
    await avanzar();
  }

  if (c.problematicas.length > 0 && !avance.menciones) {
    const r = await db()
      .from("menciones_anonimas")
      .upsert(
        c.problematicas.map((id) => ({ contacto_id: c.id, problematica_id: id })),
        { onConflict: "contacto_id,problematica_id", ignoreDuplicates: true },
      )
      .abortSignal(limite());
    tolerar(r, "Las problemáticas no se guardaron. Anótalas y avísale al administrador.", avance);
    avance.menciones = true;
    await avanzar();
  }
}

/**
 * Manda una captura. `avance` se modifica en su sitio y `avanzar` se llama después de cada paso
 * para que quien llama lo guarde: si el teléfono se apaga a la mitad, el siguiente intento
 * retoma donde se quedó.
 */
export async function enviarCaptura(
  captura: Captura,
  avance: Avance,
  avanzar: () => Promise<void>,
): Promise<ResultadoEnvio> {
  try {
    if (captura.tipo === "persona") await enviarPersona(captura, avance, avanzar);
    else await enviarContacto(captura, avance, avanzar);
    return { estado: "enviada", avisos: avance.avisos ?? [] };
  } catch (e) {
    if (e instanceof Interrupcion) return e.resultado;
    // Lo que no es de la base —por ejemplo, IndexedDB que falla al anotar el avance— no se
    // disfraza de rechazo: la captura se queda y se reintenta.
    console.error(e);
    return { estado: "sin_red" };
  }
}
