"use client";

import { useEffect, useMemo, useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { cargarSecciones, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import { BarraMapa } from "./barra-mapa";
import {
  calcularConteoPrioritarias,
  cargarDatosMapa,
  DATOS_MAPA_VACIOS,
  grupoDePrioritarias,
  type DatosMapa,
  type VistaMapa,
} from "./datos-mapa";
import { EsqueletoMapa } from "./esqueleto-mapa";
import { FichaSeccion } from "./ficha-seccion";
import { LeyendaMapa } from "./leyenda-mapa";
import { MapaLienzo } from "./mapa-lienzo";
import { ResumenPrioritarias } from "./resumen-prioritarias";
import { SelectorCapas } from "./selector-capas";

type Seleccion = { rasgo: RasgoSeccion; origen: { x: number; y: number } };

/**
 * Orquesta el mapa: carga el GeoJSON de secciones una vez (nunca desde la base) y el resumen real
 * por sección cada vez que cambia el actuante (el recorte por territorio vive en lib/permisos.ts,
 * vía seccionesResumen).
 *
 * El cromo dejó de flotar encima del territorio: el selector de capas, el contexto y el avance de
 * prioritarias viven en una cabecera del panel, en flujo normal. Solo la leyenda y la ficha de
 * sección se montan sobre el mapa, que son las que de verdad necesitan tener territorio detrás.
 * Con eso el mapa gana la franja que antes tapaba la barra, y el desenfoque queda limitado a dos
 * superficies: la barra superior de la aplicación y lo que se monta aquí encima.
 */
export function MapaPagina({ conBarra = true }: { conBarra?: boolean }) {
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

  // El grupo lo decide la vista activa: cada mapa de prioritarias cuenta solo el suyo.
  const grupoPrioritario = grupoDePrioritarias(vista);
  const conteoPrioritarias = useMemo(
    () =>
      coleccion && datos && grupoPrioritario
        ? calcularConteoPrioritarias(datos, coleccion, grupoPrioritario)
        : null,
    [coleccion, datos, grupoPrioritario],
  );

  return (
    // Llena a su contenedor y nada más. Quién le da tamaño depende de dónde se monte: la pantalla
    // del mapa lo pone a pantalla completa, el tablero lo mete en un panel de altura fija.
    <div className="flex size-full flex-col overflow-hidden">
      {/* Cabecera del panel. Ocupa alto real: no le quita territorio al mapa por debajo. */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-borde bg-superficie px-3 py-2 md:px-4">
        {(conBarra || (grupoPrioritario && conteoPrioritarias)) && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            {conBarra && <BarraMapa />}
            {grupoPrioritario && conteoPrioritarias && (
              <ResumenPrioritarias grupo={grupoPrioritario} conteo={conteoPrioritarias} />
            )}
          </div>
        )}
        <SelectorCapas vista={vista} onCambiar={setVista} />
      </div>

      <div className="relative min-h-0 flex-1 bg-superficie-hundida">
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
              onClicSeccion={(rasgo, origen) => {
                setSeleccion({ rasgo, origen, actuanteId: actuante.id });
              }}
              onMovimiento={setEnMovimiento}
            />

            <LeyendaMapa vista={vista} enMovimiento={enMovimiento} />

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
    </div>
  );
}
