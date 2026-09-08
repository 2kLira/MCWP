import { esAdmin } from "@/lib/permisos";
import type { RolUsuario, UsuarioActuante } from "@/lib/tipos";
import { db, lista, uno, type Resultado } from "@/lib/datos/cliente";

export type Usuario = {
  id: string;
  nombre: string;
  telefono: string | null;
  rol: RolUsuario;
  demarcacion_id: number | null;
  seccion_clave: string | null;
  activo: boolean;
  created_at: string;
};

/** La pantalla de usuarios solo existe para el administrador; el recorte lo decide permisos.ts. */
export function listarUsuarios(
  usuario: UsuarioActuante | null,
): Promise<Resultado<Usuario[]>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({
      datos: [],
      sinEsquema: false,
      aviso: "Solo el administrador ve los usuarios.",
    });
  }
  return lista<Usuario>(db().from("usuarios").select("*").order("rol").order("nombre"));
}

export function cambiarActivo(
  usuario: UsuarioActuante | null,
  id: string,
  activo: boolean,
): Promise<Resultado<Usuario | null>> {
  if (!esAdmin(usuario)) {
    return Promise.resolve({ datos: null, sinEsquema: false, aviso: "No tienes permiso." });
  }
  return uno<Usuario>(db().from("usuarios").update({ activo }).eq("id", id).select().single());
}
