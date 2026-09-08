"use client";

import { useEffect, useState } from "react";
import type { Resultado } from "@/lib/datos/cliente";

type Estado<T> = {
  clave: string | null;
  datos: T;
  aviso: string | null;
  sinEsquema: boolean;
};

/**
 * Ejecuta una consulta y devuelve su estado. Se vuelve a disparar cuando cambian las
 * dependencias, que es lo que hace que el conmutador de rol recorte todo el sistema en vivo.
 *
 * El estado de carga se deriva comparando la clave de las dependencias con la del último
 * resultado, en lugar de escribirlo desde el efecto: así no hay renders en cascada.
 */
export function useConsulta<T>(
  consulta: () => Promise<Resultado<T>>,
  vacio: T,
  dependencias: unknown[],
): { datos: T; cargando: boolean; aviso: string | null; sinEsquema: boolean } {
  const clave = JSON.stringify(dependencias);
  const [estado, setEstado] = useState<Estado<T>>({
    clave: null,
    datos: vacio,
    aviso: null,
    sinEsquema: false,
  });

  useEffect(() => {
    let vigente = true;
    consulta().then((r) => {
      if (!vigente) return;
      setEstado({ clave, datos: r.datos, aviso: r.aviso, sinEsquema: r.sinEsquema });
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const cargando = estado.clave !== clave;

  return {
    datos: cargando ? vacio : estado.datos,
    cargando,
    aviso: cargando ? null : estado.aviso,
    sinEsquema: cargando ? false : estado.sinEsquema,
  };
}
