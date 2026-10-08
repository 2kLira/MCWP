import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/**
 * Layout raíz, a propósito desnudo: html, body, la fuente y los metadatos. Nada más.
 *
 * La cáscara de la aplicación —proveedor de identidad, lámina territorial, dock y barras— vive en
 * app/(aplicacion)/layout.tsx. Está separada porque la pantalla de entrada no debe llevarla: un
 * layout anidado se renderiza *dentro* del raíz, así que si el cromo viviera aquí, /entrar saldría
 * con el dock encima y envuelta por el proveedor de identidad, que es justo lo que produce bucles
 * de redirección. Los grupos de ruta no cambian ninguna URL.
 */

/**
 * Una sola familia. Se eligió por linaje institucional, por su tratamiento de acentos y eñes y
 * sobre todo porque tiene cifras tabulares reales.
 */
const plex = IBM_Plex_Sans({
  variable: "--fuente-plex",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Estructura territorial · Oaxaca de Juárez",
  description:
    "Sistema de operación y estructura territorial del municipio de Oaxaca de Juárez.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${plex.variable} h-full`}>
      <body className="min-h-full bg-fondo text-tinta">{children}</body>
    </html>
  );
}
