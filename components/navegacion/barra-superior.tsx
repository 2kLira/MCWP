"use client";

import { Buscador } from "@/components/buscador";
import { ConmutadorRol } from "@/components/conmutador-rol";

/**
 * Barra superior. Ocupa alto real en el armazón: es una fila hermana del contenido, no una capa
 * que flota encima de él. Se queda pegada al desplazarse, y por eso su superficie es casi opaca
 * y lleva un filete abajo, para que nada se lea a través de ella.
 *
 * Es una de las dos únicas superficies con desenfoque de toda la aplicación; la otra es lo que
 * se monta sobre el mapa.
 */
export function BarraSuperior() {
  return (
    <div className="barra-superior sticky top-0 z-30">
      <div className="mx-auto flex h-[var(--alto-barra)] w-full max-w-tope items-center gap-2 px-4 md:gap-4 md:px-8">
        <Buscador className="min-w-0 flex-1 md:max-w-[35rem]" compacto />
        <ConmutadorRol className="ml-auto shrink-0" compacto />
      </div>
    </div>
  );
}
