"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Hoja } from "@/components/actividades/hoja";
import { eliminarPersona, type ResumenEliminacionPersona } from "@/lib/datos/personas";

/**
 * Eliminar a una persona con su historia. Solo se pinta para el administrador, y la base lo vuelve
 * a exigir en `eliminar_persona`.
 *
 * Mismas dos confirmaciones que eliminar-actividad.tsx, distintas entre sí para que no se puedan
 * pasar con el mismo dedo en el mismo lugar:
 *  1. Ver qué se va a borrar, con los números que cuenta la base, y decidir continuar.
 *  2. Escribir ELIMINAR. El botón final no se habilita hasta que la palabra coincide.
 * Cancelar es siempre el botón cómodo; el destructivo nunca está donde estaba el anterior.
 */

const PALABRA = "ELIMINAR";

type Paso = "resumen" | "confirmar" | "borrando";

export function EliminarPersona({ personaId }: { personaId: string }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [paso, setPaso] = useState<Paso>("resumen");
  const [resumen, setResumen] = useState<ResumenEliminacionPersona | null>(null);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  const coincide = texto.trim().toUpperCase() === PALABRA;

  async function abrir() {
    setAbierta(true);
    setPaso("resumen");
    setTexto("");
    setError(null);
    setResumen(null);
    setCargando(true);
    const r = await eliminarPersona(personaId, true);
    setCargando(false);
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo revisar qué se borraría. Intenta de nuevo.");
      return;
    }
    setResumen(r.datos);
  }

  function cerrar() {
    // Mientras se borra no se cierra: cerrar a la mitad solo escondería si terminó bien o no.
    if (paso === "borrando") return;
    setAbierta(false);
  }

  async function eliminar() {
    if (!coincide || paso === "borrando") return;
    setPaso("borrando");
    setError(null);
    const r = await eliminarPersona(personaId, false);
    if (!r.datos) {
      setPaso("confirmar");
      setError(r.aviso ?? "No se pudo eliminar a la persona. No se borró nada.");
      return;
    }
    router.replace("/personas");
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="transicion-ui inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium text-alerta transition-colors hover:bg-alerta/10"
      >
        <Trash2 className="size-4" aria-hidden />
        Eliminar persona
      </button>

      <Hoja titulo="Eliminar persona" abierta={abierta} alCerrar={cerrar}>
        {cargando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-tinta-suave">
            Revisando qué se borraría…
          </div>
        ) : !resumen ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-alerta">{error}</p>
            <BotonCancelar onClick={cerrar} />
          </div>
        ) : paso === "resumen" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-tinta">
              Vas a eliminar a <strong className="font-semibold">{resumen.nombre}</strong>.
            </p>

            <div className="rounded-control border border-alerta/40 bg-alerta/10 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-alerta">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                Se borra para siempre, no se puede deshacer:
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-tinta">
                <li>Sus datos: nombre, teléfono, dirección, intereses y consentimiento.</li>
                <Renglon n={resumen.participaciones} uno="registro de asistencia" varios="registros de asistencia" />
                <Renglon n={resumen.menciones} uno="problemática mencionada" varios="problemáticas mencionadas" />
                <Renglon n={resumen.solicitudes} uno="solicitud" varios="solicitudes" />
                <Renglon n={resumen.seguimientos} uno="seguimiento" varios="seguimientos" />
              </ul>
            </div>

            {(resumen.promovidos > 0 || resumen.representante > 0) && (
              <ul className="flex flex-col gap-1.5 text-sm text-tinta-suave">
                {resumen.promovidos > 0 && (
                  <li>
                    {resumen.promovidos === 1
                      ? "1 persona que ella trajo se conserva"
                      : `${resumen.promovidos} personas que ella trajo se conservan`}
                    ; solo se quedan sin promotor.
                  </li>
                )}
                {resumen.representante > 0 && (
                  <li>
                    Es representante de casilla. Ese registro no se borra, porque es de la casilla:
                    si ya no debe estar, quítalo desde la casilla.
                  </li>
                )}
              </ul>
            )}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <BotonCancelar onClick={cerrar} />
              <button
                type="button"
                onClick={() => setPaso("confirmar")}
                className="boton flex-1 text-alerta!"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-tinta">
              Último paso. Para eliminar a{" "}
              <strong className="font-semibold">{resumen.nombre}</strong> escribe{" "}
              <strong className="font-semibold tracking-wide">{PALABRA}</strong>.
            </p>

            <input
              type="text"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setError(null);
              }}
              disabled={paso === "borrando"}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={`Escribe ${PALABRA} para confirmar`}
              placeholder={PALABRA}
              className="campo"
            />

            {error && <p className="text-sm text-alerta">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              {paso !== "borrando" && <BotonCancelar onClick={cerrar} />}
              <button
                type="button"
                onClick={eliminar}
                disabled={!coincide || paso === "borrando"}
                className="transicion-ui toque-actividad flex flex-1 items-center justify-center gap-2 rounded-control bg-alerta px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-40 dark:text-fondo"
              >
                {paso === "borrando" ? (
                  "Eliminando…"
                ) : (
                  <>
                    <Trash2 className="size-4" aria-hidden />
                    Eliminar para siempre
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Hoja>
    </>
  );
}

function Renglon({ n, uno, varios }: { n: number; uno: string; varios: string }) {
  if (n === 0) return null;
  return (
    <li>
      <span className="font-semibold tabular-nums">{n}</span> {n === 1 ? uno : varios}
    </li>
  );
}

function BotonCancelar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="boton-primario flex-1">
      Cancelar
    </button>
  );
}
