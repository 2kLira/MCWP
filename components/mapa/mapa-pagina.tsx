"use client";

import { useEffect, useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { cargarSecciones, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import { BarraMapa } from "./barra-mapa";
import { cargarDatosMapa, DATOS_MAPA_VACIOS, type DatosMapa, type VistaMapa } from "./datos-mapa";
import { EsqueletoMapa } from "./esqueleto-mapa";
import { FichaSeccion } from "./ficha-seccion";
import { MapaLienzo } from "./mapa-lienzo";
import { SelectorCapas } from "./selector-capas";

type Seleccion = { rasgo: RasgoSeccion; origen: { x: number; y: number } };

/**
 * Orquesta el mapa: carga el GeoJSON de secciones una vez (nunca desde la base) y el resumen real
 * por sección cada vez que cambia el actuante (el recorte por territorio vive en lib/permisos.ts,
 * vía seccionesResumen/problematicasPorSeccion). Alrededor del lienzo arma la barra superior, el
 * selector de capas y la ficha lateral, las tres únicas superficies de vidrio de esta pantalla.
 */
export function MapaPagina() {
  const { actuante } = useActuante();
  const [coleccion, setColeccion] = useState<ColeccionSecciones | null>(null);
  const [errorColeccion, setErrorColeccion] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosMapa | null>(null);
  const [vista, setVista] = useState<VistaMapa>("estructura");
  const [seleccionCruda, setSeleccion] = useState<(Seleccion & { actuanteId: string }) | null>(
    null,
  );
  // La ficha caduca sola si el actuante cambió de territorio con ella abierta, en vez de
  // mostrar una sección ajena a su alcance.
  const seleccion = seleccionCruda?.actuanteId === actuante.id ? seleccionCruda : null;
  const [enMovimiento, setEnMovimiento] = useState(false);

  useEffect(() => {
    let cancelado = false;
    cargarSecciones()
      .then((datos) => {
        if (!cancelado) setColeccion(datos);
      })
      .catch((motivo: unknown) => {
        if (cancelado) return;
        setErrorColeccion(
          motivo instanceof Error
            ? motivo.message
            : "No se pudo cargar el mapa de secciones.",
        );
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Se vuelve a pedir cada vez que cambia el actuante: el recorte territorial cambia el conjunto
  // de secciones que trae la base, y con él los cortes por cuantiles de cada vista.
  useEffect(() => {
    let cancelado = false;
    cargarDatosMapa(actuante)
      .then((resultado) => {
        if (!cancelado) setDatos(resultado);
      })
      .catch(() => {
        if (!cancelado) setDatos(DATOS_MAPA_VACIOS);
      });
    return () => {
      cancelado = true;
    };
  }, [actuante]);

  const listo = (coleccion != null && datos != null) || errorColeccion != null;

  const claveSeleccionada = seleccion?.rasgo.properties.clave ?? null;
  const datoSeleccion = claveSeleccionada
    ? (datos?.porClave.get(claveSeleccionada) ?? null)
    : null;


  return (
    <div
      className={
        // Sangra fuera del acolchado de <main> (app/layout.tsx) para ocupar la pantalla
        // completa: el mapa es el protagonista, no un recuadro más del tablero. La ficha usa
        // position: fixed y calcula su propio margen sobre la barra inferior de celular, así que
        // sangrar aquí no la tapa ni la deja tapada.
        "relative -mx-4 -mt-4 -mb-24 h-[calc(100%+7rem)] w-[calc(100%+2rem)] overflow-hidden " +
        "bg-superficie-hundida md:-mx-6 md:-mt-6 md:-mb-8 md:h-[calc(100%+3.5rem)] md:w-[calc(100%+3rem)]"
      }
    >
      <EsqueletoMapa listo={listo} />

      {errorColeccion && !coleccion && (
        <div className="absolute inset-0 z-20 grid place-items-center p-6">
          <p className="medida text-center text-sm text-tinta-suave">{errorColeccion}</p>
        </div>
      )}

      {coleccion && datos && (
        <>
          <MapaLienzo
            coleccion={coleccion}
            datos={datos}
            vista={vista}
            claveSeleccionada={claveSeleccionada}
            onClicSeccion={(rasgo, origen) =>
              setSeleccion({ rasgo, origen, actuanteId: actuante.id })
            }
            onMovimiento={setEnMovimiento}
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-3 p-3 md:p-4">
            <BarraMapa enMovimiento={enMovimiento} className="pointer-events-auto" />
            <SelectorCapas
              vista={vista}
              onCambiar={setVista}
              enMovimiento={enMovimiento}
              className="pointer-events-auto"
            />
          </div>

          {seleccion && (
            <FichaSeccion
              key={seleccion.rasgo.properties.clave}
              rasgo={seleccion.rasgo}
              dato={datoSeleccion}
              origen={seleccion.origen}
              enMovimiento={enMovimiento}
              onCerrar={() => setSeleccion(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
