/**
 * Lectura de tokens del sistema de diseño directo de app/globals.css con getComputedStyle.
 *
 * MapLibre no entiende `var(--algo)`: sus expresiones de pintado necesitan colores y números ya
 * resueltos. Este módulo es el único lugar donde se leen esos valores, para no copiarlos a mano
 * ni aquí ni en ningún otro archivo de components/mapa/.
 */

function leerVariable(nombre: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

/** Un paso de la escala del mapa, `--mapa-0` a `--mapa-4`. */
export function leerColorMapa(paso: 0 | 1 | 2 | 3 | 4): string {
  return leerVariable(`--mapa-${paso}`) || "#efedea";
}

/** Los cinco pasos de la escala, en orden, tal como están hoy en app/globals.css. */
export function leerEscalaMapa(): [string, string, string, string, string] {
  return [
    leerColorMapa(0),
    leerColorMapa(1),
    leerColorMapa(2),
    leerColorMapa(3),
    leerColorMapa(4),
  ];
}

/** Cualquier otro token de color del sistema, por nombre de variable ("--borde", "--tinta"...). */
export function leerColor(nombreToken: string, alternativo = "#000000"): string {
  return leerVariable(nombreToken) || alternativo;
}

/** Milisegundos de un token de duración tipo "600ms" o "0.24s". */
export function leerDuracionMs(nombreToken: string, alternativo: number): number {
  const crudo = leerVariable(nombreToken);
  if (!crudo) return alternativo;
  const numero = parseFloat(crudo);
  if (Number.isNaN(numero)) return alternativo;
  return crudo.endsWith("ms") ? numero : numero * 1000;
}

/** Los cuatro puntos de control de "cubic-bezier(x1, y1, x2, y2)". */
export function leerCurva(nombreToken = "--curva"): [number, number, number, number] {
  const alternativa: [number, number, number, number] = [0.2, 0, 0, 1];
  const crudo = leerVariable(nombreToken);
  const coincidencia = crudo.match(/cubic-bezier\(([^)]+)\)/);
  if (!coincidencia) return alternativa;
  const partes = coincidencia[1].split(",").map((n) => parseFloat(n.trim()));
  if (partes.length !== 4 || partes.some((n) => Number.isNaN(n))) return alternativa;
  return partes as [number, number, number, number];
}

/**
 * Construye una función de easing (t: 0..1) => avance a partir de una curva cubic-bezier, para
 * las animaciones de cámara de MapLibre (easeTo/fitBounds), que piden una función de JavaScript
 * y no el valor CSS. Es la misma familia de curva del resto del sistema, --curva, resuelta a mano
 * porque el navegador no expone su solver interno de cubic-bezier.
 */
export function crearFuncionCurva(
  puntos: [number, number, number, number],
): (t: number) => number {
  const [x1, y1, x2, y2] = puntos;

  function bezierComponente(t: number, a: number, b: number): number {
    // Polinomio de Bézier cúbico para un componente, con puntos de control en 0 y 1 fijos.
    const c = 3 * a;
    const bTerm = 3 * (b - a) - c;
    const aTerm = 1 - c - bTerm;
    return ((aTerm * t + bTerm) * t + c) * t;
  }

  function derivadaComponente(t: number, a: number, b: number): number {
    const c = 3 * a;
    const bTerm = 3 * (b - a) - c;
    const aTerm = 1 - c - bTerm;
    return (3 * aTerm * t + 2 * bTerm) * t + c;
  }

  function tParaX(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xActual = bezierComponente(t, x1, x2) - x;
      const derivada = derivadaComponente(t, x1, x2);
      if (Math.abs(derivada) < 1e-6) break;
      t -= xActual / derivada;
    }
    return Math.min(1, Math.max(0, t));
  }

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return bezierComponente(tParaX(x), y1, y2);
  };
}

/** True si el sistema pide menos movimiento: el mapa entonces salta en vez de animar. */
export function prefiereMenosMovimiento(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
