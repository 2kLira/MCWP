"use client";

import { useEffect, useRef, useState } from "react";
import { useMovimientoReducido } from "@/lib/movimiento";

/**
 * Los indicadores cuentan hacia su número una sola vez al montar, con desaceleración, en unos 700
 * milisegundos. No se repite al volver con scroll. Con prefers-reduced-motion, el número aparece.
 */
function useCuentaHacia(destino: number, activo: boolean): number {
  const [avance, setAvance] = useState(0);
  const yaCorrio = useRef(false);

  useEffect(() => {
    if (!activo || yaCorrio.current) return;
    yaCorrio.current = true;

    const duracion = 700;
    const inicio = performance.now();
    let cuadro = 0;

    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      // Desaceleración, sin sobrepaso ni rebote.
      setAvance(1 - Math.pow(1 - t, 3));
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [activo]);

  if (!activo) return destino;
  return Math.round(destino * avance);
}

export function Indicador({
  etiqueta,
  valor,
  apoyo,
  cargando,
  orden = 0,
}: {
  etiqueta: string;
  valor: number;
  apoyo?: string;
  cargando?: boolean;
  /** Posición en el escalonado de entrada: 60 milisegundos entre elementos. */
  orden?: number;
}) {
  const reducido = useMovimientoReducido();
  const mostrado = useCuentaHacia(valor, !reducido && !cargando);

  return (
    <div
      className="entrada vidrio filo rounded-tarjeta p-4"
      style={{ "--retraso": `${orden * 60}ms` } as React.CSSProperties}
    >
      <p className="text-sm text-tinta-suave">{etiqueta}</p>
      {cargando ? (
        <div className="mt-2 h-9 w-20 animate-pulse rounded-control bg-superficie-hundida" />
      ) : (
        <p className="cifra-atlas mt-1 text-tinta" style={{ fontSize: "var(--texto-cifra)" }}>{mostrado.toLocaleString("es-MX")}</p>
      )}
      {apoyo && <p className="mt-1 text-xs text-tinta-tenue">{apoyo}</p>}
    </div>
  );
}
