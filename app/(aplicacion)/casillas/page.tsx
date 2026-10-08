import { redirect } from "next/navigation";

/**
 * Casillas ya no es una pantalla aparte: es una vista más del mapa principal, dentro de su
 * selector de capas (ver components/mapa/mapa-pagina.tsx y components/mapa/mapa-lienzo.tsx). Este
 * archivo solo redirige para que el destino "Casillas" de la navegación (components/navegacion/
 * destinos.ts) siga apuntando a algo, sin mantener dos implementaciones del mismo mapa de puntos.
 */
export default function Pagina() {
  redirect("/mapa?vista=casillas");
}
