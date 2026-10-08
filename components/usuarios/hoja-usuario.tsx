"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/campo";
import { Hoja } from "@/components/actividades/hoja";
import { DEMARCACIONES } from "@/lib/demarcaciones";
import { ETIQUETA_ROL, ROLES, type RolUsuario } from "@/lib/tipos";
import {
  actualizarUsuario,
  crearUsuario,
  type Usuario,
} from "@/lib/datos/usuarios";
import type { UsuarioActuante } from "@/lib/tipos";

/**
 * Alta y edición de un usuario, en la hoja que ya usa el resto del sistema.
 *
 * El alta y la edición son caminos distintos por una razón de fondo, no de interfaz: dar de alta
 * necesita crear primero una cuenta de acceso, y eso solo se puede con la llave secreta, desde un
 * handler del servidor. Editar una ficha que ya existe se escribe directo desde aquí.
 */
export function HojaUsuario({
  actuante,
  usuario,
  abierta,
  alCerrar,
  alGuardar,
}: {
  actuante: UsuarioActuante;
  /** Null para dar de alta; la ficha para editar. */
  usuario: Usuario | null;
  abierta: boolean;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const editando = usuario !== null;

  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [rol, setRol] = useState<RolUsuario>(usuario?.rol ?? "brigadista");
  const [demarcacionId, setDemarcacionId] = useState<number | null>(
    usuario?.demarcacion_id ?? null,
  );
  const [seccionClave, setSeccionClave] = useState(usuario?.seccion_clave ?? "");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{ correo: string; contrasena: string } | null>(
    null,
  );
  const [copiada, setCopiada] = useState(false);

  const territorial = rol === "resp_demarcacion" || rol === "resp_seccion";
  const listo = nombre.trim().length > 1 && (editando || correo.includes("@"));

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || guardando) return;
    setGuardando(true);
    setError(null);

    if (editando) {
      const r = await actualizarUsuario(actuante, usuario.id, {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        rol,
        demarcacion_id: demarcacionId,
        seccion_clave: seccionClave.trim() || null,
      });
      setGuardando(false);
      if (r.aviso) {
        setError(r.aviso);
        return;
      }
      alGuardar();
      alCerrar();
      return;
    }

    const r = await crearUsuario({
      nombre: nombre.trim(),
      correo: correo.trim(),
      telefono: telefono.trim() || null,
      rol,
      demarcacionId,
      seccionClave: seccionClave.trim() || null,
    });
    setGuardando(false);
    if (r.aviso || !r.datos) {
      setError(r.aviso ?? "No se pudo dar de alta.");
      return;
    }
    // La contraseña se muestra aquí y nunca más: no hay correo de recuperación.
    setCredencial({ correo: r.datos.correo, contrasena: r.datos.contrasena });
    alGuardar();
  }

  // Una vez creada la cuenta, la hoja deja de ser un formulario y se vuelve la entrega de la
  // contraseña. Cerrarla es lo único que queda por hacer.
  if (credencial) {
    return (
      <Hoja titulo="Cuenta creada" abierta={abierta} alCerrar={alCerrar}>
        <div className="flex flex-col gap-4">
          <p className="medida text-sm text-tinta-suave">
            Cópiala ahora y entrégala en persona. No se vuelve a mostrar y este sistema no manda
            correos de recuperación.
          </p>

          <div className="flex flex-col gap-1 rounded-control border border-borde bg-superficie-hundida p-3">
            <span className="text-xs text-tinta-tenue">Correo</span>
            <span className="cifras text-sm text-tinta">{credencial.correo}</span>
            <span className="mt-2 text-xs text-tinta-tenue">Contraseña</span>
            <span className="cifras text-base text-tinta">{credencial.contrasena}</span>
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(credencial.contrasena);
                setCopiada(true);
              } catch {
                setError("No se pudo copiar. Selecciónala y cópiala a mano.");
              }
            }}
            className="transicion-ui toque-actividad flex items-center justify-center gap-2 rounded-control border border-borde bg-superficie text-sm text-tinta hover:bg-superficie-hundida"
          >
            {copiada ? (
              <>
                <Check className="size-4" aria-hidden /> Copiada
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden /> Copiar contraseña
              </>
            )}
          </button>

          {error && (
            <p role="alert" className="text-sm text-alerta">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={alCerrar}
            className="transicion-ui toque-actividad rounded-control bg-naranja text-base font-medium text-sobre-naranja"
          >
            Listo
          </button>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja
      titulo={editando ? "Editar usuario" : "Agregar usuario"}
      abierta={abierta}
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre">
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </Campo>

        {editando ? (
          <p className="text-sm text-tinta-suave">
            El correo de acceso no se cambia desde aquí. Si hace falta, se da de alta otra cuenta
            y se desactiva esta.
          </p>
        ) : (
          <Campo etiqueta="Correo de acceso" apoyo="con este entra al sistema">
            <input
              className="campo"
              type="email"
              autoCapitalize="none"
              spellCheck={false}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
            />
          </Campo>
        )}

        <Campo etiqueta="Teléfono" apoyo="opcional">
          <input
            className="campo cifras"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Rol">
          <select
            className="campo"
            value={rol}
            onChange={(e) => setRol(e.target.value as RolUsuario)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
        </Campo>

        {/* Es el único lugar donde alguien podría crear una cuenta inútil sin darse cuenta, así
            que se le dice ahí mismo. */}
        {territorial && (
          <p className="flex items-start gap-2 text-sm text-alerta">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="medida">
              Estos dos roles todavía no tienen permisos definidos: una cuenta con este rol entra
              y no ve nada.
            </span>
          </p>
        )}

        {territorial && (
          <>
            <Campo etiqueta="Demarcación">
              <select
                className="campo"
                value={demarcacionId ?? ""}
                onChange={(e) =>
                  setDemarcacionId(e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">Sin demarcación</option>
                {DEMARCACIONES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            {rol === "resp_seccion" && (
              <Campo etiqueta="Sección" apoyo="cuatro dígitos">
                <input
                  className="campo cifras"
                  inputMode="numeric"
                  maxLength={4}
                  value={seccionClave}
                  onChange={(e) => setSeccionClave(e.target.value)}
                />
              </Campo>
            )}
          </>
        )}

        {!editando && (
          <p className="medida text-sm text-tinta-suave">
            La contraseña la genera el sistema y se muestra una sola vez al terminar.
          </p>
        )}

        <button
          type="submit"
          disabled={!listo || guardando}
          className="transicion-ui toque-actividad rounded-control bg-naranja text-base font-medium text-sobre-naranja disabled:opacity-50"
        >
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cuenta"}
        </button>

        {error && (
          <p role="alert" className="medida text-sm text-alerta">
            {error}
          </p>
        )}
      </form>
    </Hoja>
  );
}
