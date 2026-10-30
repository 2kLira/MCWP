"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";
import { Caja } from "@/components/sistema/caja";
import { generarQr, trazoSvgQr } from "@/lib/qr";
import { rutaPublica } from "@/lib/encuestas";

/**
 * El QR de una encuesta y su enlace. El origen sale del navegador, no de una variable: el QR
 * apunta al mismo despliegue desde el que el administrador lo generó, así que uno sacado de una
 * vista previa de Vercel lleva a la vista previa. Para imprimir, generarlo desde producción.
 */
export function TarjetaQr({ codigo, titulo, activa }: { codigo: string; titulo: string; activa: boolean }) {
  const [origen, setOrigen] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setOrigen(window.location.origin);
  }, []);

  const enlace = origen ? `${origen}${rutaPublica(codigo)}` : null;
  const trazo = useMemo(() => (enlace ? trazoSvgQr(generarQr(enlace)) : null), [enlace]);

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles el enlace sigue visible para copiarlo a mano.
    }
  };

  /** PNG de 1200 px, blanco y negro puro: lo que pide una imprenta, sin depender del tema. */
  const descargar = () => {
    if (!trazo) return;
    const lado = 1200;
    const lienzo = document.createElement("canvas");
    lienzo.width = lado;
    lienzo.height = lado;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lado, lado);
    ctx.scale(lado / trazo.lado, lado / trazo.lado);
    ctx.fillStyle = "#000000";
    ctx.fill(new Path2D(trazo.d));
    const a = document.createElement("a");
    a.href = lienzo.toDataURL("image/png");
    a.download = `qr-${titulo.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || codigo}.png`;
    a.click();
  };

  return (
    <Caja icono={QrCode} titulo="Código QR">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-[15rem] rounded-xl bg-white p-1">
          {trazo ? (
            <svg
              viewBox={`0 0 ${trazo.lado} ${trazo.lado}`}
              className="block aspect-square w-full"
              shapeRendering="crispEdges"
              role="img"
              aria-label={`Código QR que abre la encuesta ${titulo}`}
            >
              <path d={trazo.d} fill="#000" />
            </svg>
          ) : (
            <div className="esqueleto aspect-square w-full rounded-lg" />
          )}
          {!activa && (
            <div className="absolute inset-0 grid place-items-center rounded-xl bg-superficie/90 p-4 text-center text-sm font-medium text-tinta">
              Encuesta cerrada: quien escanee verá que ya no recibe respuestas.
            </div>
          )}
        </div>

        <p className="w-full break-all rounded-[var(--radio-control)] bg-[var(--superficie-hundida)] px-3 py-2 text-center text-xs text-tinta-suave">
          {enlace ?? "…"}
        </p>

        <div className="grid w-full grid-cols-3 gap-2">
          <button type="button" onClick={copiar} className="boton px-2" disabled={!enlace}>
            {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
          <button type="button" onClick={descargar} className="boton px-2" disabled={!trazo}>
            <Download className="size-4" aria-hidden />
            PNG
          </button>
          <a
            href={rutaPublica(codigo)}
            target="_blank"
            rel="noopener"
            className="boton px-2"
          >
            <ExternalLink className="size-4" aria-hidden />
            Abrir
          </a>
        </div>
      </div>
    </Caja>
  );
}
