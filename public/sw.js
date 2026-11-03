/**
 * Trabajador de servicio: que la captura de campo abra sin señal.
 *
 * Guarda tres cosas y nada más:
 *
 * - **Las pantallas de campo** (PANTALLAS). Son cáscaras: el HTML no lleva un solo dato, los datos
 *   los pide el navegador a Supabase. Por eso se pueden guardar sin guardar a nadie.
 * - **El código de la app**, `/_next/static/`. Sus nombres llevan huella de contenido y no
 *   cambian nunca, así que se sirven de caché sin preguntar.
 * - **La cartografía** de `/datos/`, que es lo que resuelve la sección con el GPS sin red.
 *
 * Lo que **no** toca nunca: Supabase (otro origen, ni siquiera pasa por aquí), `/api/`, `/salir`,
 * `/e/` (la encuesta pública), ni ninguna petición que no sea GET. Las capturas tampoco viven
 * aquí: las guarda la cola en IndexedDB (lib/sin-conexion/cola.ts).
 *
 * Las peticiones RSC de la navegación suave tampoco se interceptan. Sin red fallan, y el router de
 * Next responde a ese fallo con una navegación completa (fetch-server-response.js), que sí llega
 * aquí como `navigate` y se sirve de caché.
 */

const VERSION = "1";
const CACHE_PAGINAS = `soet-paginas-${VERSION}`;
const CACHE_CODIGO = `soet-codigo-${VERSION}`;
const CACHE_DATOS = `soet-datos-${VERSION}`;
const VIGENTES = [CACHE_PAGINAS, CACHE_CODIGO, CACHE_DATOS];

/**
 * Se guardan bajo su ruta sin la búsqueda: /registrar?actividad=X se sirve con la cáscara de
 * /registrar. Eso es correcto **solo** porque el formulario lee la actividad en el navegador; una
 * pantalla que leyera `searchParams` en el servidor no puede entrar en esta lista.
 */
const PANTALLAS = ["/", "/registrar", "/agenda", "/mas"];

/** La ficha de una actividad sí lleva su id en el HTML: se guarda cada una con su ruta exacta. */
const FICHA_ACTIVIDAD = /^\/actividades\/[0-9a-f-]{36}$/;

const DATOS = [
  "/datos/secciones.geojson",
  "/datos/secciones-catalogo.json",
  "/datos/colonias-catalogo.json",
];

/**
 * Cuánto se espera a la red antes de servir la cáscara guardada. Con señal a medias `fetch` no se
 * rinde solo y la pantalla se quedaría en blanco; la respuesta que llegue tarde igual se guarda.
 */
const ESPERA_RED_MS = 4000;

/** Cada cuánto, como mucho, se vuelven a descargar las pantallas de campo. */
const PREPARAR_CADA_MS = 10 * 60 * 1000;
let ultimaPreparacion = 0;

/** Código servido en esta vida del trabajador. No se poda aunque ninguna página guardada lo nombre. */
const codigoUsado = new Set();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("soet-") && !VIGENTES.includes(nombre)) await caches.delete(nombre);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data && evento.data.tipo === "preparar") {
    evento.waitUntil(preparar());
  }
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  const ruta = url.pathname;
  if (ruta.startsWith("/api/") || ruta === "/salir" || ruta.startsWith("/e/")) return;

  if (peticion.mode === "navigate") {
    evento.respondWith(navegar(peticion, url));
    return;
  }
  if (ruta.startsWith("/_next/static/")) {
    codigoUsado.add(url.href);
    evento.respondWith(primeroCache(peticion, CACHE_CODIGO));
    return;
  }
  if (DATOS.includes(ruta)) {
    evento.respondWith(cacheYRevalidar(peticion, CACHE_DATOS));
  }
});

/** La ruta bajo la que se guarda una pantalla, o null si no es de las que se guardan. */
function claveDePantalla(url) {
  if (PANTALLAS.includes(url.pathname)) return url.pathname;
  if (FICHA_ACTIVIDAD.test(url.pathname)) return url.pathname;
  return null;
}

function esHtml(respuesta) {
  return (respuesta.headers.get("content-type") || "").includes("text/html");
}

/**
 * Se guarda solo una respuesta 200 de HTML que no fue redirigida. Sin sesión, proxy.ts redirige a
 * /entrar: esa respuesta no puede quedar guardada como si fuera /registrar.
 */
function sirveParaGuardar(respuesta) {
  return respuesta.ok && respuesta.type === "basic" && !respuesta.redirected && esHtml(respuesta);
}

async function navegar(peticion, url) {
  const clave = claveDePantalla(url);
  const cache = await caches.open(CACHE_PAGINAS);

  const desdeRed = fetch(peticion).then((respuesta) => {
    if (clave && sirveParaGuardar(respuesta)) {
      // Las dos copias se sacan ya: cuando la escritura termine, el navegador puede haber leído
      // el cuerpo original y clone() lanzaría.
      const paraCache = respuesta.clone();
      const paraCodigo = respuesta.clone();
      void cache.put(clave, paraCache).then(() => guardarCodigoDe(paraCodigo));
    }
    return respuesta;
  });
  // Si gana el límite de tiempo, esta promesa puede fallar después sin que nadie la espere.
  desdeRed.catch(() => undefined);

  try {
    return await conLimite(desdeRed, clave ? ESPERA_RED_MS : null);
  } catch {
    const guardada = clave ? await cache.match(clave) : undefined;
    if (guardada) return guardada;
    // Sin red y sin la pantalla guardada. Si la red llegara tarde, igual gana.
    return paginaSinSenal();
  }
}

function conLimite(promesa, ms) {
  if (ms === null) return promesa;
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("tiempo")), ms)),
  ]);
}

async function primeroCache(peticion, nombre) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) void cache.put(peticion, respuesta.clone());
  return respuesta;
}

/** La cartografía se sirve al instante de caché y se refresca por detrás. */
async function cacheYRevalidar(peticion, nombre) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(peticion);
  const desdeRed = fetch(peticion)
    .then((respuesta) => {
      if (respuesta.ok) void cache.put(peticion, respuesta.clone());
      return respuesta;
    })
    .catch(() => undefined);
  return guardada || (await desdeRed) || Response.error();
}

/**
 * Las rutas de código que nombra una página. Salen de dos lados: las etiquetas <script> y <link>,
 * con `/_next/static/...`, y la carga RSC en línea (`self.__next_f.push`), que nombra los trozos
 * de los componentes de cliente como `static/chunks/...` sin el prefijo.
 */
function codigoNombradoEn(html) {
  const rutas = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) rutas.add(m[0]);
  for (const m of html.matchAll(/(?<![\w/])static\/(?:chunks|css|media)\/[^"'\\\s)]+/g)) {
    rutas.add(`/_next/${m[0]}`);
  }
  return [...rutas].map((ruta) => new URL(ruta, self.location.origin).href);
}

async function guardarCodigoDe(respuesta) {
  const cache = await caches.open(CACHE_CODIGO);
  const urls = codigoNombradoEn(await respuesta.text());
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const r = await fetch(url);
        if (r.ok) await cache.put(url, r);
      } catch {
        // Sin red a la mitad: lo que falte se guarda en la siguiente preparación.
      }
    }),
  );
}

/**
 * Descarga las pantallas de campo y todo el código que nombran, para que la primera vez sin señal
 * no dependa de qué pantallas se alcanzaron a abrir. La pide la app al cargar
 * (components/sin-conexion/registro-trabajador.tsx), ya con sesión.
 *
 * Al final poda el código que ya ninguna página guardada nombra: cada despliegue trae trozos
 * nuevos y, sin poda, el teléfono acumularía todos los de todas las versiones.
 */
async function preparar() {
  const ahora = Date.now();
  if (ahora - ultimaPreparacion < PREPARAR_CADA_MS) return;
  ultimaPreparacion = ahora;

  const paginas = await caches.open(CACHE_PAGINAS);
  for (const ruta of PANTALLAS) {
    try {
      const respuesta = await fetch(ruta, { credentials: "same-origin", cache: "no-store" });
      if (!sirveParaGuardar(respuesta)) continue;
      await paginas.put(ruta, respuesta.clone());
      await guardarCodigoDe(respuesta);
    } catch {
      // Sin red. Se queda lo que ya estaba.
      ultimaPreparacion = 0;
      return;
    }
  }

  const datos = await caches.open(CACHE_DATOS);
  await Promise.all(
    DATOS.map(async (ruta) => {
      try {
        const r = await fetch(ruta);
        if (r.ok) await datos.put(ruta, r);
      } catch {
        // Igual que arriba.
      }
    }),
  );

  await podarCodigo(paginas);
}

async function podarCodigo(paginas) {
  const vivas = new Set(codigoUsado);
  for (const peticion of await paginas.keys()) {
    const respuesta = await paginas.match(peticion);
    if (!respuesta) continue;
    for (const url of codigoNombradoEn(await respuesta.text())) vivas.add(url);
  }
  const codigo = await caches.open(CACHE_CODIGO);
  for (const peticion of await codigo.keys()) {
    if (!vivas.has(peticion.url)) await codigo.delete(peticion);
  }
}

function paginaSinSenal() {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin señal</title>
<style>
  :root { color-scheme: light dark; --fondo: #f1efec; --tinta: #24211e; --suave: #6b6966; --borde: #e4e3e1; }
  @media (prefers-color-scheme: dark) { :root { --fondo: #121110; --tinta: #f5f4f2; --suave: #a3a09b; --borde: #2e2c29; } }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--fondo);
         color: var(--tinta); font: 15px/1.5 system-ui, sans-serif; padding: 16px; box-sizing: border-box; }
  main { max-width: 22rem; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p { color: var(--suave); margin: 0 0 20px; }
  a { display: flex; align-items: center; justify-content: center; min-height: 48px; border-radius: 10px;
      border: 1px solid var(--borde); color: var(--tinta); text-decoration: none; font-weight: 500; }
</style>
</head>
<body>
<main>
  <h1>Esta pantalla necesita señal</h1>
  <p>Sin conexión solo se puede registrar personas. Lo que registres se guarda en el teléfono y se envía solo al volver la señal.</p>
  <a href="/registrar">Ir a registrar</a>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
