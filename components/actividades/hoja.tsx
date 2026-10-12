"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Hoja que sube desde abajo en celular y flota centrada en escritorio. Radio 20, la única forma
 * que usa el sistema para paneles que se abren sobre la pantalla completa.
 */
export function Hoja({
  titulo,
  abierta,
  alCerrar,
  children,
}: {
  titulo: string;
  abierta: boolean;
  alCerrar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") alCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierta, alCerrar]);

  if (!abierta) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/40 md:items-center md:p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={alCerrar}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="tarjeta transicion-panel relative flex max-h-[90dvh] w-full flex-col max-md:rounded-t-hoja max-md:rounded-b-none md:max-w-lg md:rounded-hoja"
        // Opaca a propósito: una hoja se abre sobre la pantalla y no debe dejar ver lo de atrás.
        // La sombra va aquí y no como clase para que no compita con la de `tarjeta`.
        style={{ background: "var(--superficie)", boxShadow: "var(--sombra-flotante)" }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-separador py-3 pl-5 pr-3">
          <h2 className="text-base font-semibold text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
