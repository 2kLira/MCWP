"use client";

import { useEffect, useMemo, useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { EsqueletoMapa } from "@/components/mapa/esqueleto-mapa";
import { cargarSecciones } from "@/lib/territorio";
import {
  avanceDeCasilla,
  calcularAvance,
  listarCasillas,
  type CasillaConRepresentantes,
  type RepresentanteCasilla,
} from "@/lib/datos/casillas";
import { cn } from "@/lib/utils";
import { BarrasAvance } from "./barras-avance";
import { FichaCasilla } from "./ficha-casilla";
import { FiltroSeccion } from "./filtro-seccion";
import { LeyendaCasillas, MapaCasillas } from "./mapa-casillas";

type Seleccion = { id: number; origen: { x: number; y: number } };

/**
 * Orquesta la pantalla de casillas: carga la lista (ya recortada al territorio del actuante por
 * lib/datos/casillas.ts) y alrededor del mapa arma el filtro de sección, las dos barras de
 * avance y la ficha de edición. Mismo reparto que components/mapa/mapa-pagina.tsx: el lienzo por
 * un lado, el cromo flotante por otro, comunicados por props.
 */
export function CasillasPagina({
  cromoDesplazado = false,
  sangradoIzquierdo = false,
}: {
  cromoDesplazado?: boolean;
  sangradoIzquierdo?: boolean;
}) {
  const { actuante } = useActuante();
  const [casillas, setCasillas] = useState<CasillaConRepresentantes[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtroSeccion, setFiltroSeccion] = useState("");
  const [seleccionCruda, setSeleccion] = useState<(Seleccion & { actuanteId: string }) | null>(
    null,
  );
  // La ficha caduca sola si el actuante cambió de territorio con ella abierta, igual que en el
  // mapa de secciones.
  const seleccion = seleccionCruda?.actuanteId === actuante.id ? seleccionCruda : null;
  const [enMovimiento, setEnMovimiento] = useState(false);

  useEffect(() => {
    // La cartografía la usan tanto listarCasillas (para resolver la demarcación de un responsable
    // de demarcación) como la ficha (para mostrar el nombre de la demarcación). Si la petición de
    // red falla, cada quien degrada solo: no hace falta esperar aquí a que se resuelva.
    cargarSecciones().catch(() => {});

    let cancelado = false;
    listarCasillas(actuante).then((r) => {
      if (cancelado) return;
      setCasillas(r.datos);
      setAviso(r.aviso);
    });
    return () => {
      cancelado = true;
    };
  }, [actuante]);

  const listo = casillas != null;

  const casillasFiltradas = useMemo(() => {
    if (!casillas) return [];
    const clave = filtroSeccion.trim();
    return clave ? casillas.filter((c) => c.seccion_clave.includes(clave)) : casillas;
  }, [casillas, filtroSeccion]);

  const avance = useMemo(() => calcularAvance(casillasFiltradas), [casillasFiltradas]);

  // "¿Cómo vamos?" de verdad: una casilla con titular pero sin suplente no está resuelta, así
  // que el conteo de completas se calcula aparte de los dos totales por cargo.
  const completas = useMemo(
    () => casillasFiltradas.filter((c) => avanceDeCasilla(c) === "completa").length,
    [casillasFiltradas],
  );

  // Encuadre de cámara cuando el filtro deja un subconjunto: se calcula a mano porque son puntos,
  // no polígonos con bbox propio como en el mapa de secciones.
  const encuadre = useMemo<[number, number, number, number] | null>(() => {
    if (!filtroSeccion.trim() || casillasFiltradas.length === 0) return null;
    let oeste = Infinity;
    let sur = Infinity;
    let este = -Infinity;
    let norte = -Infinity;
    for (const c of casillasFiltradas) {
      if (c.lng < oeste) oeste = c.lng;
      if (c.lng > este) este = c.lng;
      if (c.lat < sur) sur = c.lat;
      if (c.lat > norte) norte = c.lat;
    }
    return [oeste, sur, este, norte];
  }, [casillasFiltradas, filtroSeccion]);

  const casillaSeleccionada = seleccion
    ? (casillas?.find((c) => c.id === seleccion.id) ?? null)
    : null;

  const sinCasillasEnTerritorio = listo && (casillas?.length ?? 0) === 0;
  const sinResultadosDeFiltro =
    listo && !sinCasillasEnTerritorio && casillasFiltradas.length === 0;

  function alGuardarRepresentante(representante: RepresentanteCasilla) {
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

  return (
    <div className="relative size-full overflow-hidden bg-superficie-hundida">
      <EsqueletoMapa listo={listo} />

      {sinCasillasEnTerritorio && (
        <div className="absolute inset-0 z-20 grid place-items-center p-6">
          <p className="medida text-center text-sm text-tinta-suave">
            {aviso ?? "No hay casillas en tu territorio."}
          </p>
        </div>
      )}

      {casillas && (
        <>
          <MapaCasillas
            casillas={casillasFiltradas}
            casillaSeleccionadaId={seleccion?.id ?? null}
            encuadre={encuadre}
            onClicCasilla={(id, origen) => setSeleccion({ id, origen, actuanteId: actuante.id })}
            onMovimiento={setEnMovimiento}
          />

          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-3 p-3 md:p-4",
              cromoDesplazado && "md:pt-20",
              sangradoIzquierdo && "md:pl-24",
            )}
          >
            <BarrasAvance
              avance={avance}
              completas={completas}
              enMovimiento={enMovimiento}
              className="pointer-events-auto md:max-w-md"
            />
            <FiltroSeccion
              valor={filtroSeccion}
              onCambiar={setFiltroSeccion}
              enMovimiento={enMovimiento}
              className="pointer-events-auto"
            />
            {sinResultadosDeFiltro && (
              <p className="vidrio elevacion-flotante rounded-pildora px-3 py-1.5 text-xs text-tinta-suave">
                Ninguna casilla coincide con esa sección.
              </p>
            )}
          </div>

          <LeyendaCasillas enMovimiento={enMovimiento} />

          {casillaSeleccionada && (
            <FichaCasilla
              key={casillaSeleccionada.id}
              casilla={casillaSeleccionada}
              origen={seleccion!.origen}
              enMovimiento={enMovimiento}
              onCerrar={() => setSeleccion(null)}
              onGuardado={alGuardarRepresentante}
            />
          )}
        </>
      )}
    </div>
  );
}
