import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { BarraInferior } from "@/components/navegacion/barra-inferior";
import { BarraLateral } from "@/components/navegacion/barra-lateral";
import { BarraSuperior } from "@/components/navegacion/barra-superior";
import { ProveedorActuante } from "@/components/proveedor-actuante";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${plex.variable} h-full`}>
      <body className="min-h-full bg-fondo text-tinta">
        <ProveedorActuante>
          <div className="flex min-h-dvh">
            <BarraLateral />
            <div className="flex min-w-0 flex-1 flex-col">
              <BarraSuperior />
              {/* El espacio de abajo deja libre la barra inferior de celular. */}
              <main className="mx-auto w-full max-w-tope flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6">
                {children}
              </main>
            </div>
          </div>
          <BarraInferior />
        </ProveedorActuante>
      </body>
    </html>
  );
}
