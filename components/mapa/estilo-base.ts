"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Mapa base de CARTO, sin llave. Positron en claro, Dark Matter en oscuro. */
export const ESTILO_CARTO_CLARO = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export const ESTILO_CARTO_OSCURO =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * La preferencia de color del sistema, y reacciona si cambia mientras el mapa está abierto. El
 * mapa no tiene conmutador propio de tema: sigue al sistema operativo.
 */
export function usePreferenciaOscura(): boolean {
  const suscribir = useCallback((alCambiar: () => void) => {
    const medio = window.matchMedia("(prefers-color-scheme: dark)");
    medio.addEventListener("change", alCambiar);
    return () => medio.removeEventListener("change", alCambiar);
  }, []);

  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

export function estiloCartoDe(oscura: boolean): string {
  return oscura ? ESTILO_CARTO_OSCURO : ESTILO_CARTO_CLARO;
}
