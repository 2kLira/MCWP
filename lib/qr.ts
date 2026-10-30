/**
 * Generador de códigos QR, propio y sin dependencias.
 *
 * Existe porque la pila de CLAUDE.md no trae uno y lo único que se necesita es codificar el enlace
 * de una encuesta: modo byte, corrección de errores nivel M (aguanta ~15 % del código tapado o
 * manchado, de sobra para una lona o una hoja impresa) y versiones 1 a 10, que llegan a 213 bytes.
 * Un enlace de encuesta mide unos 50.
 *
 * Sigue la norma ISO/IEC 18004 en la misma estructura que el generador de referencia de Nayuki
 * (MIT): bits de datos → Reed-Solomon por bloques → intercalado → patrones fijos → máscara.
 * La elección de máscara usa tres de las cuatro reglas de penalización (corridas, bloques 2×2 y
 * balance); la regla de patrones parecidos al buscador se omite. Cualquier máscara es válida para
 * un lector, la penalización solo mejora la lectura en condiciones difíciles.
 */

/** Por versión 1–10, nivel M: codewords de corrección por bloque y número de bloques. */
const ECC_POR_BLOQUE = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOQUES = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Bits de formato del nivel M. */
const FORMATO_NIVEL_M = 0;

export type MatrizQr = boolean[][];

export function generarQr(texto: string): MatrizQr {
  const bytes = Array.from(new TextEncoder().encode(texto));

  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const capacidadBits = codewordsDeDatos(v) * 8;
    const usados = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (usados <= capacidadBits) {
      version = v;
      break;
    }
  }
  if (version === 0) throw new Error("El texto es demasiado largo para un código QR de versión 10.");

  // 1. Bits: modo byte, longitud, datos, terminador y relleno.
  const bits: number[] = [];
  const agregar = (valor: number, largo: number) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  agregar(0b0100, 4);
  agregar(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) agregar(b, 8);
  const capacidad = codewordsDeDatos(version) * 8;
  agregar(0, Math.min(4, capacidad - bits.length));
  agregar(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) agregar(relleno, 8);

  const datos: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    datos.push(b);
  }

  // 2. Corrección de errores e intercalado.
  const codewords = conCorreccion(datos, version);

  // 3. Matriz.
  const tamano = version * 4 + 17;
  const modulos: boolean[][] = Array.from({ length: tamano }, () => Array(tamano).fill(false));
  const fijos: boolean[][] = Array.from({ length: tamano }, () => Array(tamano).fill(false));
  const fijar = (x: number, y: number, oscuro: boolean) => {
    modulos[y][x] = oscuro;
    fijos[y][x] = true;
  };

  for (let i = 0; i < tamano; i++) {
    fijar(6, i, i % 2 === 0);
    fijar(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [tamano - 4, 3],
    [3, tamano - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= tamano || y < 0 || y >= tamano) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        fijar(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const alineacion = posicionesAlineacion(version);
  const ultima = alineacion.length - 1;
  alineacion.forEach((ay, i) =>
    alineacion.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === ultima) || (i === ultima && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          fijar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }),
  );
  dibujarFormato(0, tamano, fijar);
  if (version >= 7) {
    let resto = version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const v = (version << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const oscuro = ((v >>> i) & 1) !== 0;
      const a = tamano - 11 + (i % 3);
      const b = Math.floor(i / 3);
      fijar(a, b, oscuro);
      fijar(b, a, oscuro);
    }
  }

  // 4. Datos en zigzag, de abajo a la derecha hacia arriba, de dos en dos columnas.
  let i = 0;
  for (let derecha = tamano - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vertical = 0; vertical < tamano; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const subiendo = ((derecha + 1) & 2) === 0;
        const y = subiendo ? tamano - 1 - vertical : vertical;
        if (!fijos[y][x] && i < codewords.length * 8) {
          modulos[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  // 5. La máscara con menos penalización.
  let mejor = 0;
  let menor = Infinity;
  for (let m = 0; m < 8; m++) {
    aplicarMascara(modulos, fijos, m);
    dibujarFormato(m, tamano, fijar);
    const p = penalizacion(modulos);
    if (p < menor) {
      menor = p;
      mejor = m;
    }
    aplicarMascara(modulos, fijos, m); // XOR: aplicarla otra vez la deshace
  }
  aplicarMascara(modulos, fijos, mejor);
  dibujarFormato(mejor, tamano, fijar);
  return modulos;
}

/** Trazado SVG de los módulos oscuros, con margen de 4 módulos alrededor (zona de silencio). */
export function trazoSvgQr(matriz: MatrizQr): { lado: number; d: string } {
  const margen = 4;
  let d = "";
  matriz.forEach((fila, y) =>
    fila.forEach((oscuro, x) => {
      if (oscuro) d += `M${x + margen} ${y + margen}h1v1h-1z`;
    }),
  );
  return { lado: matriz.length + margen * 2, d };
}

/* ---------------------------------------------------------------------------
 * Internas
 * ------------------------------------------------------------------------- */

function modulosDeDatos(version: number): number {
  let r = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (version >= 7) r -= 36;
  }
  return r;
}

function codewordsDeDatos(version: number): number {
  return (
    Math.floor(modulosDeDatos(version) / 8) - ECC_POR_BLOQUE[version - 1] * BLOQUES[version - 1]
  );
}

function posicionesAlineacion(version: number): number[] {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const paso = Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = version * 4 + 17 - 7; r.length < n; pos -= paso) r.splice(1, 0, pos);
  return r;
}

function dibujarFormato(
  mascara: number,
  tamano: number,
  fijar: (x: number, y: number, oscuro: boolean) => void,
) {
  const dato = (FORMATO_NIVEL_M << 3) | mascara;
  let resto = dato;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  const bits = ((dato << 10) | resto) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i++) fijar(8, i, bit(i));
  fijar(8, 7, bit(6));
  fijar(8, 8, bit(7));
  fijar(7, 8, bit(8));
  for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) fijar(tamano - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) fijar(8, tamano - 15 + i, bit(i));
  fijar(8, tamano - 8, true);
}

function aplicarMascara(modulos: boolean[][], fijos: boolean[][], m: number) {
  const n = modulos.length;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (fijos[y][x]) continue;
      let invertir: boolean;
      switch (m) {
        case 0: invertir = (x + y) % 2 === 0; break;
        case 1: invertir = y % 2 === 0; break;
        case 2: invertir = x % 3 === 0; break;
        case 3: invertir = (x + y) % 3 === 0; break;
        case 4: invertir = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invertir = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invertir = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invertir = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invertir) modulos[y][x] = !modulos[y][x];
    }
  }
}

function penalizacion(m: boolean[][]): number {
  const n = m.length;
  let p = 0;
  // Corridas de cinco o más del mismo color, en filas y columnas.
  for (let a = 0; a < n; a++) {
    for (const horizontal of [true, false]) {
      let color = false;
      let corrida = 0;
      for (let b = 0; b < n; b++) {
        const v = horizontal ? m[a][b] : m[b][a];
        if (b > 0 && v === color) {
          corrida++;
          if (corrida === 5) p += 3;
          else if (corrida > 5) p++;
        } else {
          color = v;
          corrida = 1;
        }
      }
    }
  }
  // Bloques de 2×2 del mismo color.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
  }
  // Balance entre oscuros y claros.
  let oscuros = 0;
  for (const fila of m) for (const v of fila) if (v) oscuros++;
  const total = n * n;
  p += (Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * 10;
  return p;
}

/* Reed-Solomon sobre GF(256) con el polinomio 0x11D. */

function multiplicarGf(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisorRs(grado: number): number[] {
  const r = Array(grado - 1).fill(0).concat([1]) as number[];
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicarGf(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicarGf(raiz, 0x02);
  }
  return r;
}

function restoRs(datos: number[], divisor: number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of datos) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => (r[i] ^= multiplicarGf(c, factor)));
  }
  return r;
}

function conCorreccion(datos: number[], version: number): number[] {
  const bloques = BLOQUES[version - 1];
  const eccPorBloque = ECC_POR_BLOQUE[version - 1];
  const crudos = Math.floor(modulosDeDatos(version) / 8);
  const cortos = bloques - (crudos % bloques);
  const largoCorto = Math.floor(crudos / bloques);
  const divisor = divisorRs(eccPorBloque);

  const partes: number[][] = [];
  for (let i = 0, k = 0; i < bloques; i++) {
    const dat = datos.slice(k, k + largoCorto - eccPorBloque + (i < cortos ? 0 : 1));
    k += dat.length;
    const ecc = restoRs(dat, divisor);
    if (i < cortos) dat.push(0);
    partes.push(dat.concat(ecc));
  }

  const salida: number[] = [];
  for (let i = 0; i < partes[0].length; i++) {
    partes.forEach((parte, j) => {
      if (i !== largoCorto - eccPorBloque || j >= cortos) salida.push(parte[i]);
    });
  }
  return salida;
}
