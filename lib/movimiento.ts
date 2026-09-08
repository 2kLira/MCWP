"use client";

import { useCallback, useSyncExternalStore } from "react";

const CONSULTA = "(prefers-reduced-motion: reduce)";

/**
 * Respeta prefers-reduced-motion sin efectos: cuando está activo, todo se reduce a cambios
 * instantáneos. En el servidor se asume que no está activo y React reconcilia al hidratar.
 */
export function useMovimientoReducido(): boolean {
  const suscribir = useCallback((alCambiar: () => void) => {
    const mq = window.matchMedia(CONSULTA);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
