"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Hoja } from "@/components/actividades/hoja";
import { reponerContrasena, type Usuario } from "@/lib/datos/usuarios";

/**
 * Reponer la contraseña de alguien.
 *
 * Existe porque se decidió no tener servidor de correo: no hay enlace de recuperación, así que la
 * repone el administrador general y la entrega en persona.
 */
export function HojaContrasena({
  usuario,
  abierta,
  alCerrar,
}: {
  usuario: Usuario | null;
  abierta: boolean;
  alCerrar: () => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  if (!usuario) return null;

  async function reponer() {
    if (trabajando || !usuario) return;
    setTrabajando(true);
    setError(null);
    const r = await reponerContrasena(usuario.id);
    setTrabajando(false);
    if (r.aviso || !r.datos) {
      setError(r.aviso ?? "No se pudo reponer la contraseña.");
      return;
    }
    setContrasena(r.datos.contrasena);
  }

  return (
    <Hoja titulo="Reponer contraseña" abierta={abierta} alCerrar={alCerrar}>
      <div className="flex flex-col gap-4">
        {contrasena ? (
          <>
            <p className="medida text-sm text-tinta-suave">
              Nueva contraseña de {usuario.nombre}. Cópiala ahora y entrégala en persona: no se
              vuelve a mostrar y este sistema no manda correos.
            </p>

            <div className="flex flex-col gap-1 rounded-control border border-borde bg-superficie-hundida p-3">
              <span className="text-xs text-tinta-tenue">Contraseña</span>
              <span className="cifras text-base text-tinta">{contrasena}</span>
            </div>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(contrasena);
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

            <button
              type="button"
              onClick={alCerrar}
              className="transicion-ui toque-actividad rounded-control bg-naranja text-base font-medium text-sobre-naranja"
            >
              Listo
            </button>
          </>
        ) : (
          <>
            <p className="medida text-sm text-tinta-suave">
              Se le va a generar una contraseña nueva a {usuario.nombre}. La anterior deja de
              funcionar en ese momento, así que hay que entregarle la nueva.
            </p>
            <button
              type="button"
              onClick={reponer}
              disabled={trabajando}
              className="transicion-ui toque-actividad rounded-control bg-naranja text-base font-medium text-sobre-naranja disabled:opacity-50"
            >
              {trabajando ? "Generando…" : "Generar contraseña nueva"}
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="medida text-sm text-alerta">
            {error}
          </p>
        )}
      </div>
    </Hoja>
  );
}
