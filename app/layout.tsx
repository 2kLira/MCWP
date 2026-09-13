import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AvisoConfiguracion } from "@/components/aviso-configuracion";
import { BarraInferior } from "@/components/navegacion/barra-inferior";
import { BarraSuperior } from "@/components/navegacion/barra-superior";
import { Dock } from "@/components/navegacion/dock";
import { ProveedorActuante } from "@/components/proveedor-actuante";
import { LaminaTerritorial } from "@/components/sustrato/lamina-territorial";

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
          {/* El territorio es el sustrato de toda la aplicación: por eso el vidrio de las
              tarjetas tiene algo real detrás y cambia con el rol activo. */}
          <LaminaTerritorial />

          <Dock />

          <div className="relative z-10 flex min-h-dvh flex-col">
            <BarraSuperior />
            {/* Espacio a la izquierda para el dock flotante y abajo para la píldora de celular. */}
            <main className="mx-auto w-full max-w-tope flex-1 px-4 pb-28 pt-4 md:pl-24 md:pr-6 md:pb-10 md:pt-5">
              <AvisoConfiguracion />
              {children}
            </main>
          </div>

          <BarraInferior />
        </ProveedorActuante>
      </body>
    </html>
  );
}
