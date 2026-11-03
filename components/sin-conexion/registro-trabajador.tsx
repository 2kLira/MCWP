"use client";

import { useEffect } from "react";

/**
 * Registra el trabajador de servicio (public/sw.js) y le pide que deje listas las pantallas de
 * campo para cuando no haya señal.
 *
 * Vive dentro de la cáscara con sesión y no en el layout raíz: la preparación descarga /registrar
 * y las demás con las cookies de quien entró, y sin sesión proxy.ts las redirigiría a /entrar.
 *
 * Solo en producción. En desarrollo un trabajador con caché pelea con la recarga en caliente y
 * sirve código viejo; para probarlo se usa `npm run build && npm start`.
 */
export function RegistroTrabajador() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let vigente = true;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registro) => {
        if (vigente) registro.active?.postMessage({ tipo: "preparar" });
      })
      .catch((e) => console.error("No se pudo registrar el trabajador de servicio.", e));

    return () => {
      vigente = false;
    };
  }, []);

  return null;
}
