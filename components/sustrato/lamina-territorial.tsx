"use client";

import { useEffect, useRef } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId, MUNICIPIO } from "@/lib/demarcaciones";
import { alcanceDe } from "@/lib/permisos";
import { cargarSecciones, type ColeccionSecciones } from "@/lib/territorio";

/**
 * La lámina territorial: las 157 secciones dibujadas en un lienzo, detrás de toda la aplicación.
 *
 * No es adorno. Es lo que hace legítimo el vidrio del resto de la interfaz: cuando una tarjeta
 * es translúcida, lo que se ve a través es el territorio, y cambia según el rol con el que
 * entraste. El territorio propio se pinta en naranja pleno y el resto queda como trazo.
 *
 * Va en un canvas y no en SVG a propósito: son ciento cincuenta y siete polígonos con muchos
 * vértices y se pintan una sola vez por tamaño y por rol, en lugar de meter miles de nodos al
 * árbol del documento detrás de cada pantalla.
 */
export function LaminaTerritorial() {
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const { actuante } = useActuante();
  const alcance = alcanceDe(actuante);
  const llaveAlcance = JSON.stringify(alcance);

  useEffect(() => {
    const lienzo = lienzoRef.current;
    if (!lienzo) return;

    let vigente = true;
    let coleccion: ColeccionSecciones | null = null;

    function pintar() {
      if (!vigente || !lienzo || !coleccion) return;
      const ctx = lienzo.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ancho = lienzo.clientWidth;
      const alto = lienzo.clientHeight;
      if (ancho === 0 || alto === 0) return;

      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);

      const raiz = getComputedStyle(document.documentElement);
      const trazo = raiz.getPropertyValue("--lamina-trazo").trim();
      const relleno = raiz.getPropertyValue("--lamina-relleno").trim();
      const propio = raiz.getPropertyValue("--lamina-propio").trim();

      // Encuadre: el municipio completo, cubriendo la ventana sin deformarse.
      const [oeste, sur, este, norte] = MUNICIPIO.bbox;
      const gradosAncho = este - oeste;
      const gradosAlto = norte - sur;
      // La longitud se comprime con el coseno de la latitud; sin esto el municipio sale estirado.
      const compresion = Math.cos((((norte + sur) / 2) * Math.PI) / 180);
      const escala = Math.max(ancho / (gradosAncho * compresion), alto / gradosAlto) * 1.35;
      const centroX = ancho / 2;
      const centroY = alto / 2;
      const medioLng = (este + oeste) / 2;
      const medioLat = (norte + sur) / 2;

      const proyectar = (lng: number, lat: number): [number, number] => [
        centroX + (lng - medioLng) * compresion * escala,
        centroY - (lat - medioLat) * escala,
      ];

      const dentroDelAlcance = (clave: string, demarcacion: string): boolean => {
        if (alcance.tipo === "todo") return true;
        if (alcance.tipo === "seccion") return clave === alcance.seccionClave;
        if (alcance.tipo === "demarcacion") {
          return demarcacion === demarcacionPorId(alcance.demarcacionId)?.nombre;
        }
        return false;
      };

      ctx.lineJoin = "round";

      for (const rasgo of coleccion.features) {
        const { clave, demarcacion } = rasgo.properties;
        const suyo = dentroDelAlcance(clave, demarcacion);

        const poligonos =
          rasgo.geometry.type === "Polygon"
            ? [rasgo.geometry.coordinates as number[][][]]
            : (rasgo.geometry.coordinates as number[][][][]);

        ctx.beginPath();
        for (const poligono of poligonos) {
          for (const anillo of poligono) {
            anillo.forEach(([lng, lat], i) => {
              const [x, y] = proyectar(lng, lat);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.closePath();
          }
        }

        ctx.fillStyle = suyo ? propio : relleno;
        ctx.globalAlpha = suyo ? 1 : 0.5;
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = trazo;
        ctx.lineWidth = suyo ? 1.1 : 0.6;
        ctx.stroke();
      }
    }

    cargarSecciones()
      .then((c) => {
        if (!vigente) return;
        coleccion = c;
        pintar();
      })
      .catch(() => {
        // Sin cartografía la aplicación sigue: la lámina simplemente no se dibuja.
      });

    const observador = new ResizeObserver(() => pintar());
    observador.observe(lienzo);

    const modo = window.matchMedia("(prefers-color-scheme: dark)");
    modo.addEventListener("change", pintar);

    return () => {
      vigente = false;
      observador.disconnect();
      modo.removeEventListener("change", pintar);
    };
  }, [llaveAlcance, alcance]);

  return (
    <>
      <canvas ref={lienzoRef} className="lamina" aria-hidden />
      <div className="bruma" aria-hidden />
    </>
  );
}
