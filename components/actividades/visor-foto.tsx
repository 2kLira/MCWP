"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { Hoja } from "@/components/actividades/hoja";
import { firmarFotos } from "@/lib/datos/almacenamiento";

/**
 * Una foto en grande, sobre la pantalla. Se vuelve a firmar al abrir: la firma de la miniatura
 * dura cinco minutos (lib/datos/almacenamiento.ts) y la ficha pudo quedarse abierta más tiempo.
 */
export function VisorFoto({
  ruta,
  titulo,
  alCerrar,
}: {
  ruta: string;
  titulo: string;
  alCerrar: () => void;
}) {
  const [firmada, setFirmada] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void firmarFotos([ruta]).then((mapa) => {
      if (!vivo) return;
      const url = mapa.get(ruta) ?? null;
      setFirmada(url);
      setFallo(url == null);
    });
    return () => {
      vivo = false;
    };
  }, [ruta]);

  return (
    <Hoja titulo={titulo} abierta alCerrar={alCerrar}>
      <div className="flex flex-col gap-4">
        {firmada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={firmada}
            alt={titulo}
            className="max-h-[70dvh] w-full rounded-control border border-borde bg-superficie-hundida object-contain"
          />
        ) : fallo ? (
          <p className="flex items-center gap-2 text-sm text-tinta-suave">
            <ImageOff className="size-4 shrink-0" aria-hidden />
            No se pudo cargar esta foto.
          </p>
        ) : (
          <div className="aspect-[4/3] w-full animate-pulse rounded-control bg-superficie-hundida" />
        )}

        {firmada && (
          <a
            href={firmada}
            target="_blank"
            rel="noreferrer"
            className="boton self-start"
          >
            <ExternalLink className="size-4" aria-hidden />
            Abrir en tamaño original
          </a>
        )}
      </div>
    </Hoja>
  );
}
