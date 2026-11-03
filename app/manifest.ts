import type { MetadataRoute } from "next";

/**
 * Lo que hace que el teléfono ofrezca "Agregar a pantalla de inicio" y abra la app sin la barra
 * del navegador. En iPhone instalarla no es cosmético: Safari puede borrar lo guardado de un sitio
 * que no se abre en varios días, y eso incluiría las capturas sin enviar. Instalada, no.
 *
 * Arranca en /registrar porque es lo único que funciona sin señal y lo primero que se hace en
 * campo; el tablero queda a un toque en la barra.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estructura territorial · Oaxaca de Juárez",
    short_name: "Territorial",
    description:
      "Sistema de operación y estructura territorial del municipio de Oaxaca de Juárez.",
    lang: "es-MX",
    start_url: "/registrar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1efec",
    theme_color: "#f1efec",
    icons: [
      { src: "/iconos/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
