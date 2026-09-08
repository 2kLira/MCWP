"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { ACTUANTES, ACTUANTE_INICIAL } from "@/lib/actuantes";
import { useAlmacenLocal } from "@/lib/almacen-local";
import { alcanceDe, type Alcance } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";

const LLAVE = "actuante";

type Contexto = {
  /** El usuario que está actuando. Todo el recorte del sistema cuelga de aquí. */
  actuante: UsuarioActuante;
  /** Los usuarios entre los que puede cambiar el conmutador. */
  disponibles: readonly UsuarioActuante[];
  cambiarActuante: (id: string) => void;
  alcance: Alcance;
};

const ContextoActuante = createContext<Contexto | null>(null);

export function ProveedorActuante({ children }: { children: React.ReactNode }) {
  const [id, guardarId] = useAlmacenLocal(LLAVE, ACTUANTE_INICIAL.id);
  const actuante = ACTUANTES.find((u) => u.id === id) ?? ACTUANTE_INICIAL;

  const cambiarActuante = useCallback(
    (nuevo: string) => {
      if (!ACTUANTES.some((u) => u.id === nuevo)) return;
      guardarId(nuevo);
    },
    [guardarId],
  );

  const valor = useMemo<Contexto>(
    () => ({
      actuante,
      disponibles: ACTUANTES,
      cambiarActuante,
      alcance: alcanceDe(actuante),
    }),
    [actuante, cambiarActuante],
  );

  return (
    <ContextoActuante.Provider value={valor}>
      {children}
    </ContextoActuante.Provider>
  );
}

export function useActuante(): Contexto {
  const contexto = useContext(ContextoActuante);
  if (!contexto) {
    throw new Error("useActuante debe usarse dentro de ProveedorActuante.");
  }
  return contexto;
}
