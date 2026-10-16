"use client";

import { useState } from "react";
import { MapPinned } from "lucide-react";
import { CampoSeccion } from "@/components/actividades/campo-seccion";
import { Hoja } from "@/components/actividades/hoja";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES } from "@/lib/demarcaciones";
import { actualizarActividad, type Actividad } from "@/lib/datos/actividades";
import { rasgoPorClave } from "@/lib/territorio";

/**
 * Cambiar la sección de una actividad, o dejarla sin sección. Solo el administrador: la política
 * `actividades_update` no se la permite a nadie más, así que el botón no se pinta para otros.
 *
 * Una actividad sin sección es válida (16 de octubre de 2026): un evento puede juntar gente de
 * varias secciones. Lo que nunca queda sin sección es la gente: cada asistente cuenta en la suya,
 * que sale de su propio punto al registrarlo, no de la actividad.
 */
export function EditarSeccionActividad({
  actividad,
  alGuardar,
}: {
  actividad: Actividad;
  alGuardar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="boton">
        <MapPinned className="size-4 text-tinta-suave" aria-hidden />
        Cambiar sección
      </button>
      {abierta && (
        <HojaSeccion
          actividad={actividad}
          alCerrar={() => setAbierta(false)}
          alGuardar={alGuardar}
        />
      )}
    </>
  );
}

function HojaSeccion({
  actividad,
  alCerrar,
  alGuardar,
}: {
  actividad: Actividad;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { actuante } = useActuante();
  const [seccionClave, setSeccionClave] = useState(actividad.seccion_clave ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError(null);
    // La demarcación sale de la sección, igual que en el alta. Sin sección, tampoco hay demarcación.
    const nombreDemarcacion = seccionClave
      ? rasgoPorClave(seccionClave)?.properties.demarcacion
      : null;
    const r = await actualizarActividad(actuante, actividad.id, {
      seccion_clave: seccionClave || null,
      demarcacion_id: DEMARCACIONES.find((d) => d.nombre === nombreDemarcacion)?.id ?? null,
    });
    setGuardando(false);
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo cambiar la sección.");
      return;
    }
    alGuardar();
    alCerrar();
  }

  return (
    <Hoja titulo="Sección de la actividad" abierta alCerrar={alCerrar}>
      <form onSubmit={guardar} className="flex flex-col gap-3.5">
        <CampoSeccion valor={seccionClave} onCambiar={setSeccionClave} />
        <p className="medida text-sm text-tinta-suave">
          Déjala vacía si el evento junta gente de varias secciones. Los asistentes siguen contando
          en la sección de cada quien.
        </p>
        <button type="submit" disabled={guardando} className="boton-primario min-h-12 w-full">
          {guardando ? "Guardando…" : seccionClave ? "Guardar sección" : "Guardar sin sección"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-alerta">
            {error}
          </p>
        )}
      </form>
    </Hoja>
  );
}
