"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { BarrasAvance } from "@/components/casillas/barras-avance";
import { FichaCasilla } from "@/components/casillas/ficha-casilla";
import {
  avanceDeCasilla,
  calcularAvance,
  listarCasillas,
  type CasillaConRepresentantes,
  type RepresentanteCasilla,
} from "@/lib/datos/casillas";
import { cargarSecciones, type ColeccionSecciones, type RasgoSeccion } from "@/lib/territorio";
import { cn } from "@/lib/utils";
import { BarraMapa } from "./barra-mapa";
import {
  calcularConteoPrioritarias,
  cargarDatosMapa,
  DATOS_MAPA_VACIOS,
  esIdentificadorDeVista,
  esVistaDeCasillas,
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
type SeleccionCasilla = { id: number; origen: { x: number; y: number } };

/**
 * Orquesta el mapa: carga el GeoJSON de secciones una vez (nunca desde la base) y el resumen real
 * por sección cada vez que cambia el actuante (el recorte por territorio vive en lib/permisos.ts,
 * vía seccionesResumen). Alrededor del lienzo arma la barra superior, el selector de capas y la
 * ficha lateral, las tres únicas superficies de vidrio de esta pantalla.
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
  // La ficha caduca sola si el actuante cambió de territorio con ella abierta, en vez de
  // mostrar una sección ajena a su alcance.
  const seleccion = seleccionCruda?.actuanteId === actuante.id ? seleccionCruda : null;
  const [enMovimiento, setEnMovimiento] = useState(false);

  // Casillas de la vista de puntos: null mientras no se han pedido. La selección sigue el mismo
  // patrón que la de sección (caduca si el actuante cambió de territorio con la ficha abierta).
  const [casillas, setCasillas] = useState<CasillaConRepresentantes[] | null>(null);
  const [seleccionCasillaCruda, setSeleccionCasilla] = useState<
    (SeleccionCasilla & { actuanteId: string }) | null
  >(null);
  const seleccionCasilla =
    seleccionCasillaCruda?.actuanteId === actuante.id ? seleccionCasillaCruda : null;

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

  // Vista inicial desde la URL: /casillas redirige aquí con "?vista=casillas" (ver
  // app/casillas/page.tsx) para que su destino de navegación siga funcionando sin mantener dos
  // pantallas del mismo mapa de puntos. Se lee una sola vez al montar, directo de
  // window.location: usar useSearchParams obligaría a envolver esto en un límite de Suspense para
  // no forzar el resto de la página a renderizarse en el cliente, y aquí no hace falta.
  useEffect(() => {
    const parametro = new URLSearchParams(window.location.search).get("vista");
    if (esIdentificadorDeVista(parametro)) setVista(parametro);
  }, []);

  const vistaEsCasillas = esVistaDeCasillas(vista);

  // Carga perezosa: las casillas no se piden hasta entrar a su vista, igual que el resto del mapa
  // evita pedir de más al arrancar. Se vuelve a pedir si el actuante cambió de territorio mientras
  // la vista ya estaba activa; si el actuante no cambió, no se repite la petición cada vez que se
  // entra y sale de la vista.
  const casillasActuanteCargadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vistaEsCasillas) return;
    if (casillasActuanteCargadoRef.current === actuante.id) return;
    let cancelado = false;
    casillasActuanteCargadoRef.current = actuante.id;
    listarCasillas(actuante).then((resultado) => {
      if (!cancelado) setCasillas(resultado.datos);
    });
    return () => {
      cancelado = true;
    };
  }, [vistaEsCasillas, actuante]);

  // Al salir de la vista de casillas, la casilla seleccionada se limpia: es la misma regla que ya
  // separa la selección de sección de la de colonia.
  useEffect(() => {
    if (!vistaEsCasillas) setSeleccionCasilla(null);
  }, [vistaEsCasillas]);

  const listo = (coleccion != null && datos != null) || errorColeccion != null;

  const claveSeleccionada = seleccion?.rasgo.properties.clave ?? null;
  const datoSeleccion = claveSeleccionada
    ? (datos?.porClave.get(claveSeleccionada) ?? null)
    : null;

  const casillaSeleccionada = seleccionCasilla
    ? (casillas?.find((c) => c.id === seleccionCasilla.id) ?? null)
    : null;

  const avanceCasillas = useMemo(
    () => (casillas ? calcularAvance(casillas) : null),
    [casillas],
  );
  const casillasCompletas = useMemo(
    () => (casillas ? casillas.filter((c) => avanceDeCasilla(c) === "completa").length : 0),
    [casillas],
  );

  function alGuardarRepresentanteCasilla(representante: RepresentanteCasilla) {
    setCasillas((actual) => {
      if (!actual) return actual;
      return actual.map((c) => {
        if (c.id !== representante.casilla_id) return c;
        return representante.cargo === "titular"
          ? { ...c, titular: representante }
          : { ...c, suplente: representante };
      });
    });
  }

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
            onClicSeccion={(rasgo, origen) => {
              setSeleccionCasilla(null);
              setSeleccion({ rasgo, origen, actuanteId: actuante.id });
            }}
            onMovimiento={setEnMovimiento}
            casillas={casillas}
            casillaSeleccionadaId={seleccionCasilla?.id ?? null}
            onClicCasilla={(id, origen) => {
              setSeleccion(null);
              setSeleccionCasilla({ id, origen, actuanteId: actuante.id });
            }}
          />

          {/* Arriba a la izquierda: municipio y territorio del actuante, y debajo el resumen que
              corresponda a la vista activa —prioritarias o casillas, nunca las dos—. Apiladas,
              no en fila: cada una es una tarjeta de vidrio aparte. */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-3 p-3 md:p-4",
              cromoDesplazado && "md:pt-20",
              // Cuando el mapa sangra por debajo del riel de navegación, su cromo tiene que
              // arrancar a la derecha de él o queda tapado.
              sangradoIzquierdo && "md:pl-24",
            )}
          >
            {conBarra && (
              <BarraMapa enMovimiento={enMovimiento} className="pointer-events-auto" />
            )}
            {grupoPrioritario && conteoPrioritarias && (
              <ResumenPrioritarias
                grupo={grupoPrioritario}
                conteo={conteoPrioritarias}
                enMovimiento={enMovimiento}
                className="pointer-events-auto"
              />
            )}
            {vistaEsCasillas && avanceCasillas && (
              <BarrasAvance
                avance={avanceCasillas}
                completas={casillasCompletas}
                enMovimiento={enMovimiento}
                className="pointer-events-auto md:max-w-md"
              />
            )}
          </div>

          {/* Abajo al centro: el selector de capas, en su propia cápsula, centrada e
              independiente del bloque de la izquierda y de la esquina derecha, que queda libre
              para el control de zoom de MapLibre y la atribución. */}
          <div
            // Se centra en el hueco que dejan la leyenda (izquierda) y el control de zoom con
            // la atribución (derecha), y se levanta por encima del renglón de atribución.
            className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 md:bottom-9 md:pl-[14rem] md:pr-[4.5rem]"
          >
            <SelectorCapas
              vista={vista}
              onCambiar={setVista}
              enMovimiento={enMovimiento}
              className="pointer-events-auto max-w-full"
            />
          </div>

          <LeyendaMapa
            vista={vista}
            enMovimiento={enMovimiento}
            sangradoIzquierdo={sangradoIzquierdo}
          />

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

          {seleccionCasilla && casillaSeleccionada && (
            <FichaCasilla
              key={casillaSeleccionada.id}
              casilla={casillaSeleccionada}
              origen={seleccionCasilla.origen}
              enMovimiento={enMovimiento}
              onCerrar={() => setSeleccionCasilla(null)}
              onGuardado={alGuardarRepresentanteCasilla}
            />
          )}
        </>
      )}
    </div>
  );
}
