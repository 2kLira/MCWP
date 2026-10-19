import { EsqueletoPagina } from "@/components/sistema/esqueleto";

/**
 * Lo que se ve al instante al cambiar de pantalla, mientras llega la nueva. Sin esto Next se
 * quedaba en la pantalla anterior hasta tener lista la siguiente, y parecía que el toque no había
 * hecho nada. Vive dentro del layout del grupo, así que el riel, las barras y el buscador no se
 * mueven: solo el contenido pasa a esqueleto.
 */
export default function Cargando() {
  return <EsqueletoPagina />;
}
