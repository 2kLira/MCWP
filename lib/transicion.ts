"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Route } from "next";

/**
 * Navegación con transición de elemento compartido donde el navegador la soporta, y navegación
 * sencilla donde no. Se usa entre la lista de personas y la ficha: el nombre viaja, no desaparece
 * y reaparece.
 */
export function useNavegarConTransicion() {
  const router = useRouter();

  return useCallback(
    (destino: Route) => {
      const doc = document as Document & {
        startViewTransition?: (callback: () => void) => unknown;
      };
      if (
        typeof doc.startViewTransition !== "function" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        router.push(destino);
        return;
      }
      doc.startViewTransition(() => {
        router.push(destino);
      });
    },
    [router],
  );
}

/** Nombre de transición estable para el nombre de una persona. */
export function nombreCompartido(id: string): string {
  return `persona-${id}`;
}
