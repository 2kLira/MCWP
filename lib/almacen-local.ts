"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Lectura y escritura de localStorage sin efectos ni renders en cascada. Se usa para
 * preferencias de sesión, nunca para datos: el conmutador de rol y el estado de la barra lateral.
 */

const oyentes = new Set<() => void>();

function avisar() {
  for (const oyente of oyentes) oyente();
}

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

export function useAlmacenLocal(
  llave: string,
  porDefecto: string,
): [string, (valor: string) => void] {
  const leer = useCallback(() => {
    try {
      return window.localStorage.getItem(llave) ?? porDefecto;
    } catch {
      // Modo privado o almacenamiento bloqueado.
      return porDefecto;
    }
  }, [llave, porDefecto]);

  // En el servidor siempre vale el valor por defecto, así el marcado coincide al hidratar.
  const valor = useSyncExternalStore(suscribir, leer, () => porDefecto);

  const guardar = useCallback(
    (nuevo: string) => {
      try {
        window.localStorage.setItem(llave, nuevo);
      } catch {
        // El cambio vale para esta sesión y ya.
      }
      avisar();
    },
    [llave],
  );

  return [valor, guardar];
}
