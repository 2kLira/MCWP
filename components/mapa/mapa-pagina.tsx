"use client";

import { useEffect, useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { cargarSecciones, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import { BarraMapa } from "./barra-mapa";
import {
  cargarDatosMapa,
  DATOS_MAPA_VACIOS,
  vistaEsDeColonias,
  type DatosMapa,
  type VistaMapa,
} from "./datos-mapa";
import { EsqueletoMapa } from "./esqueleto-mapa";
import { FichaColonia, FichaSeccion } from "./ficha-seccion";
import { MapaLienzo, type RasgoColonia } from "./mapa-lienzo";
import { SelectorCapas } from "./selector-capas";

type Seleccion = { rasgo: RasgoSeccion; origen: { x: number; y: number } };
type SeleccionColonia = { rasgo: RasgoColonia; origen: { x: number; y: number } };

/**
 * Orquesta el mapa: carga el GeoJSON de secciones una vez (nunca desde la base) y el resumen real
 * por sección cada vez que cambia el actuante (el recorte por territorio vive en lib/permisos.ts,
 * vía seccionesResumen/problematicasPorSeccion). Alrededor del lienzo arma la barra superior, el
 * selector de capas y la ficha lateral, las tres únicas superficies de vidrio de esta pantalla.
 */
/**
 * `cromoDesplazado` baja la barra y el selector de capas para que no choquen con el buscador
 * global, que en la pantalla completa del mapa flota justo encima. En el tablero el mapa va
 * dentro de una tarjeta y ahí no hace falta.
 */
export function MapaPagina({
  cromoDesplazado = false,
  sangradoIzquierdo = false,
  conBarra = true,
}: {
  cromoDesplazado?: boolean;
  sangradoIzquierdo?: boolean;
  conBarra?: boolean;
}) {
  const { actuante } = useActuante();
  const [coleccion, setColeccion] = useState<ColeccionSecciones | null>(null);
  const [errorColeccion, setErrorColeccion] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosMapa | null>(null);
  const [vista, setVista] = useState<VistaMapa>("estructura");
  const [seleccionCruda, setSeleccion] = useState<(Seleccion & { actuanteId: string }) | null>(
    null,
  );
  const [seleccionColoniaCruda, setSeleccionColonia] = useState<
    (SeleccionColonia & { actuanteId: string }) | null
  >(null);
  // La ficha caduca sola si el actuante cambió de territorio con ella abierta, en vez de
  // mostrar una sección o colonia ajena a su alcance.
  const seleccion = seleccionCruda?.actuanteId === actuante.id ? seleccionCruda : null;
  const seleccionColonia =
    seleccionColoniaCruda?.actuanteId === actuante.id ? seleccionColoniaCruda : null;
  const [enMovimiento, setEnMovimiento] = useState(false);

  // Una colonia seleccionada solo tiene sentido dentro de la vista de colonias: al salir de ella
  // se limpia, en vez de quedar viva de fondo esperando a que se vuelva a entrar.
  useEffect(() => {
    if (!vistaEsDeColonias(vista)) setSeleccionColonia(null);
  }, [vista]);

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

  const coloniaSeleccionada = seleccionColonia?.rasgo.properties.colonia_id ?? null;
  const datoColoniaSeleccion =
    coloniaSeleccionada != null ? (datos?.porColonia.get(coloniaSeleccionada) ?? null) : null;


  return (
    <div
      // Llena a su contenedor y nada más. Quién le da tamaño depende de dónde se monte: la
      // pantalla del mapa lo pone a pantalla completa, el tablero lo mete en una caja de altura
      // fija. Antes esto usaba altura en porcentaje contra <main> y se quedaba en cero.
      className="relative size-full overflow-hidden bg-superficie-hundida"
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
            coloniaSeleccionada={coloniaSeleccionada}
            onClicSeccion={(rasgo, origen) => {
              setSeleccion({ rasgo, origen, actuanteId: actuante.id });
              setSeleccionColonia(null);
            }}
            onClicColonia={(rasgo, origen) => {
              setSeleccionColonia({ rasgo, origen, actuanteId: actuante.id });
              setSeleccion(null);
            }}
            onMovimiento={setEnMovimiento}
          />

          <div
            className={
              "pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-3 p-3 md:p-4" +
              (cromoDesplazado ? " md:pt-20" : "") +
              // Cuando el mapa sangra por debajo del riel de navegación, su cromo tiene que
              // arrancar a la derecha de él o queda tapado.
              (sangradoIzquierdo ? " md:pl-24" : "")
            }
          >
            {conBarra && (
              <BarraMapa enMovimiento={enMovimiento} className="pointer-events-auto" />
            )}
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

          {seleccionColonia && (
            <FichaColonia
              key={seleccionColonia.rasgo.properties.colonia_id}
              rasgo={seleccionColonia.rasgo}
              dato={datoColoniaSeleccion}
              origen={seleccionColonia.origen}
              enMovimiento={enMovimiento}
              onCerrar={() => setSeleccionColonia(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
