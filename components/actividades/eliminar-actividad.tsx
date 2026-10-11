"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Hoja } from "@/components/actividades/hoja";
import { eliminarActividad, type ResumenEliminacion } from "@/lib/datos/actividades";
import { borrarArchivos } from "@/lib/datos/almacenamiento";

/**
 * Eliminar una actividad con todo lo que se registró en ella. Solo se pinta para el administrador,
 * y la base lo vuelve a exigir en `eliminar_actividad`.
 *
 * Dos confirmaciones, a propósito distintas entre sí para que no se puedan pasar con el mismo dedo
 * en el mismo lugar:
 *  1. Ver qué se va a borrar, con los números que cuenta la base, y decidir continuar.
 *  2. Escribir ELIMINAR. El botón final no se habilita hasta que la palabra coincide.
 * Cancelar es siempre el botón cómodo; el destructivo nunca está donde estaba el anterior.
 */

const PALABRA = "ELIMINAR";

type Paso = "resumen" | "confirmar" | "borrando";

export function EliminarActividad({ actividadId }: { actividadId: string }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [paso, setPaso] = useState<Paso>("resumen");
  const [resumen, setResumen] = useState<ResumenEliminacion | null>(null);
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
    const r = await eliminarActividad(actividadId, true);
    setCargando(false);
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo revisar qué se borraría. Intenta de nuevo.");
      return;
    }
    setResumen(r.datos);
  }

  function cerrar() {
    // Mientras se borra no se cierra: el borrado ya va en camino y cerrar a la mitad solo
    // escondería si terminó bien o no.
    if (paso === "borrando") return;
    setAbierta(false);
  }

  async function eliminar() {
    if (!coincide || paso === "borrando") return;
    setPaso("borrando");
    setError(null);
    const r = await eliminarActividad(actividadId, false);
    if (!r.datos) {
      setPaso("confirmar");
      setError(r.aviso ?? "No se pudo eliminar la actividad. No se borró nada.");
      return;
    }
    await borrarArchivos(r.datos.rutas);
    router.replace("/actividades");
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="transicion-ui flex items-center justify-center gap-2 rounded-control border border-alerta/40 px-4 text-base font-medium text-alerta toque-actividad hover:bg-alerta/10"
      >
        <Trash2 className="size-5" aria-hidden />
        Eliminar actividad
      </button>

      <Hoja titulo="Eliminar actividad" abierta={abierta} alCerrar={cerrar}>
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
            <p className="text-base text-tinta">
              Vas a eliminar <strong className="font-semibold">{resumen.nombre}</strong>.
            </p>

            <div className="rounded-control border border-alerta/40 bg-alerta/10 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-alerta">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                Se borra para siempre, no se puede deshacer:
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-tinta">
                <Renglon n={resumen.personas_borradas} uno="persona registrada aquí" varios="personas registradas aquí" siempre />
                <Renglon n={resumen.participaciones} uno="registro de asistencia" varios="registros de asistencia" />
                <Renglon n={resumen.menciones} uno="problemática mencionada" varios="problemáticas mencionadas" />
                <Renglon n={resumen.solicitudes} uno="solicitud" varios="solicitudes" />
                <Renglon n={resumen.fotos} uno="foto" varios="fotos" />
                <Renglon n={resumen.invitaciones} uno="brigadista invitado" varios="brigadistas invitados" />
              </ul>
            </div>

            {resumen.personas_conservadas > 0 && (
              <p className="text-sm text-tinta-suave">
                {resumen.personas_conservadas === 1
                  ? "1 persona que se registró aquí se conserva"
                  : `${resumen.personas_conservadas} personas que se registraron aquí se conservan`}{" "}
                porque también aparecen en otras actividades, en seguimiento o como representantes
                de casilla. Solo se les quita esta actividad.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <BotonCancelar onClick={cerrar} />
              <button
                type="button"
                onClick={() => setPaso("confirmar")}
                className="transicion-ui flex-1 rounded-control border border-alerta/40 text-base font-medium text-alerta toque-actividad hover:bg-alerta/10"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-base text-tinta">
              Último paso. Para eliminar{" "}
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
                className="transicion-ui flex flex-1 items-center justify-center gap-2 rounded-control bg-alerta/15 text-base font-semibold text-alerta ring-1 ring-alerta toque-actividad disabled:opacity-40"
              >
                {paso === "borrando" ? (
                  <>
                    Eliminando…
                  </>
                ) : (
                  <>
                    <Trash2 className="size-5" aria-hidden />
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

function Renglon({
  n,
  uno,
  varios,
  siempre,
}: {
  n: number;
  uno: string;
  varios: string;
  siempre?: boolean;
}) {
  if (n === 0 && !siempre) return null;
  return (
    <li>
      <span className="font-semibold tabular-nums">{n}</span> {n === 1 ? uno : varios}
    </li>
  );
}

function BotonCancelar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transicion-ui flex-1 rounded-control bg-naranja text-base font-medium text-sobre-naranja toque-actividad"
    >
      Cancelar
    </button>
  );
}
