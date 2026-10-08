import { generarContrasena, json, portonAdmin } from "@/lib/api/porton-admin";
import { clienteAdministrador } from "@/lib/supabase-administrador";

/**
 * Reponer la contraseña de alguien.
 *
 * Este handler existe porque se decidió no tener servidor de correo: no hay recuperación por
 * enlace, así que el administrador general repone la contraseña y la entrega en persona. Los
 * brigadistas además tienen correos `@soet.local`, que no es un dominio que exista.
 *
 * La contraseña se genera **en el servidor** y viaja una sola vez, en la respuesta. No se guarda.
 */
export async function PATCH(_peticion: Request, contexto: RouteContext<"/api/admin/usuarios/[id]/contrasena">) {
  const porton = await portonAdmin();
  if (!porton.ok) return json({ mensaje: porton.mensaje }, porton.estado);

  const { id } = await contexto.params;
  if (!id) return json({ mensaje: "Falta el usuario." }, 400);

  const admin = clienteAdministrador();
  if (!admin) {
    return json({ mensaje: "Este despliegue no tiene configurada la llave secreta." }, 503);
  }

  // Que la ficha exista se comprueba antes de tocar Auth: si alguien manda un id que no es de
  // este sistema, no hay por qué cambiarle la contraseña a una cuenta ajena al proyecto.
  const { data: ficha } = await admin
    .from("usuarios")
    .select("nombre")
    .eq("id", id)
    .maybeSingle<{ nombre: string }>();

  if (!ficha) return json({ mensaje: "Ese usuario no existe en el sistema." }, 404);

  const contrasena = generarContrasena();
  const { error } = await admin.auth.admin.updateUserById(id, { password: contrasena });

  if (error) {
    console.error("No se pudo reponer la contraseña:", error);
    return json({ mensaje: error.message ?? "No se pudo reponer la contraseña." }, 500);
  }

  return json({ nombre: ficha.nombre, contrasena });
}
