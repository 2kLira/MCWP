import { generarContrasena, json, portonAdmin } from "@/lib/api/porton-admin";
import { clienteAdministrador } from "@/lib/supabase-administrador";
import { ROLES } from "@/lib/tipos";
import type { RolUsuario } from "@/lib/tipos";

/**
 * Alta de usuarios. Es el único lugar del proyecto que usa la llave secreta.
 *
 * Por qué existe: `public.usuarios.id` referencia `auth.users(id)`, así que la ficha **no puede
 * existir antes que la cuenta de acceso**, y crear una cuenta de acceso solo se puede con la
 * llave secreta. Son dos pasos, en ese orden, y no hay transacción que abarque Auth y Postgres.
 *
 * El orden inverso es imposible por la llave foránea. Vale la pena escribirlo porque es lo
 * primero que alguien va a querer "mejorar".
 *
 * Es un Route Handler y no una Server Function porque tiene URL propia: su cobertura bajo el
 * matcher de proxy.ts es inspeccionable, y un refactor no puede dejarla fuera sin que se note.
 */

type Entrada = {
  nombre?: unknown;
  correo?: unknown;
  telefono?: unknown;
  rol?: unknown;
  demarcacionId?: unknown;
  seccionClave?: unknown;
};

function textoLimpio(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

export async function POST(peticion: Request) {
  const porton = await portonAdmin();
  if (!porton.ok) return json({ mensaje: porton.mensaje }, porton.estado);

  const cuerpo = (await peticion.json().catch(() => null)) as Entrada | null;
  if (!cuerpo) return json({ mensaje: "No se entendió la petición." }, 400);

  const nombre = textoLimpio(cuerpo.nombre);
  const correo = textoLimpio(cuerpo.correo)?.toLowerCase() ?? null;
  const rol = textoLimpio(cuerpo.rol) as RolUsuario | null;

  if (!nombre) return json({ mensaje: "Falta el nombre." }, 422);
  if (!correo || !correo.includes("@")) return json({ mensaje: "Falta un correo válido." }, 422);
  if (!rol || !ROLES.includes(rol)) return json({ mensaje: "Falta el rol." }, 422);

  const admin = clienteAdministrador();
  if (!admin) {
    return json({ mensaje: "Este despliegue no tiene configurada la llave secreta." }, 503);
  }

  const contrasena = generarContrasena();

  // ---- Paso 1: la cuenta de acceso ----
  // email_confirm en verdadero porque no hay servidor de correo: sin esto la cuenta nace sin
  // confirmar y el login contesta email_not_confirmed.
  const { data: creada, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
  });

  if (errorAuth || !creada?.user) {
    const codigo = errorAuth?.code;
    // Se usa el error de Auth en lugar de preguntar antes si el correo existe: listUsers es
    // paginado y una consulta previa deja abierta una carrera entre la consulta y el alta.
    if (codigo === "email_exists") {
      return json({ mensaje: "Ya existe una cuenta con ese correo." }, 409);
    }
    if (codigo === "weak_password") {
      return json({ mensaje: "La contraseña generada no cumple la política del proyecto." }, 422);
    }
    return json({ mensaje: errorAuth?.message ?? "No se pudo crear la cuenta de acceso." }, 500);
  }

  // ---- Paso 2: la ficha ----
  const { error: errorFicha } = await admin.from("usuarios").insert({
    id: creada.user.id,
    nombre,
    telefono: textoLimpio(cuerpo.telefono),
    rol,
    demarcacion_id: typeof cuerpo.demarcacionId === "number" ? cuerpo.demarcacionId : null,
    seccion_clave: textoLimpio(cuerpo.seccionClave),
    activo: true,
  });

  if (errorFicha) {
    // ---- Compensación: sin esto queda una cuenta de acceso huérfana que nadie sabe de dónde
    // salió, y el correo queda ocupado para siempre. ----
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(creada.user.id);

    if (errorBorrado) {
      // Tragarse este caso es exactamente cómo aparecen cuentas fantasma. Se nombra el problema.
      console.error("Alta a medias y sin deshacer:", { errorFicha, errorBorrado });
      return json(
        {
          mensaje:
            `Se creó la cuenta de acceso de ${correo} pero no se pudo crear su ficha, y tampoco ` +
            "se pudo deshacer. Hay una cuenta de acceso suelta: avísale a quien administre la base.",
        },
        500,
      );
    }

    console.error("Alta revertida:", errorFicha);
    return json({ mensaje: `No se pudo crear la ficha: ${errorFicha.message}` }, 500);
  }

  // La contraseña viaja una sola vez, en esta respuesta. No se guarda en ningún lado.
  return json({ id: creada.user.id, correo, contrasena }, 201);
}
