import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AvisoConfiguracion } from "@/components/aviso-configuracion";
import { BarraInferior } from "@/components/navegacion/barra-inferior";
import { BarraSuperior } from "@/components/navegacion/barra-superior";
import { Dock } from "@/components/navegacion/dock";
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
    { media: "(prefers-color-scheme: light)", color: "#f7f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${plex.variable} h-full`}>
      <body className="min-h-full bg-fondo text-tinta">
        <ProveedorActuante>
          {/* El armazón se construye con flujo normal: el riel ocupa ancho real y la barra
              superior ocupa alto real. Nada del layout principal vive en posición absoluta. */}
          <div className="flex min-h-dvh">
            <Dock />

            <div className="flex min-w-0 flex-1 flex-col">
              <BarraSuperior />

              <main className="relative flex-1 pb-28 md:pb-12">
                {/* Lavado estático, tenue y localizado en el encabezado. */}
                <span className="lavado" aria-hidden />

                <div className="relative mx-auto w-full max-w-tope px-4 pt-4 md:px-8 md:pt-6">
                  <AvisoConfiguracion />
                  {children}
                </div>
              </main>
            </div>
          </div>

          <BarraInferior />
        </ProveedorActuante>
      </body>
    </html>
  );
}
