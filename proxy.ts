import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextProxy } from "next/server";

/**
 * Portón de rutas y refresco de sesión.
 *
 * Se llama `proxy.ts` y no `middleware.ts`: en Next 16 el archivo `middleware.js` está deprecado
 * y renombrado. El runtime es Node.js forzoso, así que **no se declara `runtime`** — hacerlo
 * lanza error.
 *
 * Responde **una sola pregunta**: ¿hay un JWT con firma válida y no expirado? Ni el rol, ni si
 * la cuenta está activa, ni si tiene ficha en `usuarios`. Eso requeriría leer la base en cada
 * petición, incluidas las precargas del router, y la documentación de Next es explícita en que
 * el proxy no debe hacer consultas ni ser la única defensa.
 *
 * Esto es la primera de tres capas, y la más débil: la segunda es el proveedor de identidad
 * (cosmética) y la tercera, la única que de verdad protege, es Row Level Security.
 *
 * Que la verificación sea criptográfica y no una lectura optimista de la cookie se puede pagar
 * aquí porque el proyecto firma con ES256 y publica su JWKS: `getClaims()` valida firma y `exp`
 * **localmente**, contra el JWKS cacheado, sin viaje de red. Con HS256 habría que llamar
 * `getUser()` y pagar un viaje al servidor de Auth en cada navegación.
 */
export const proxy: NextProxy = async (peticion) => {
  // Se declara ANTES de crear el cliente y se reasigna dentro de setAll. Si se creara después,
  // el closure de setAll escribiría en un objeto que ya se devolvió y el refresco se perdería.
  let respuesta = NextResponse.next({ request: peticion });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sin configuración no hay nada que verificar. Se deja pasar a propósito: la aplicación ya
  // degrada con su propio aviso, y redirigir a una pantalla de entrada que tampoco podría
  // funcionar solo produciría un bucle.
  if (!url || !publicable) return respuesta;

  const supabase = createServerClient(url, publicable, {
    cookies: {
      getAll() {
        return peticion.cookies.getAll();
      },
      // Dos argumentos, no uno. El segundo trae las cabeceras anti-caché y **solo llega en la
      // primera escritura de cookies de este cliente**. Omitirlo compila sin un solo aviso y
      // deja la respuesta con Set-Cookie cacheable por un CDN, o sea la sesión de una persona
      // servida a otra.
      setAll(cookiesAEscribir, cabeceras) {
        // 1. A la petición, para que el render de abajo vea el token nuevo.
        for (const { name, value } of cookiesAEscribir) {
          peticion.cookies.set(name, value);
        }
        // 2. Se rehace la respuesta, ya con la petición mutada.
        respuesta = NextResponse.next({ request: peticion });
        // 3. A la respuesta, para que el navegador guarde el token nuevo.
        for (const { name, value, options } of cookiesAEscribir) {
          respuesta.cookies.set(name, value, options);
        }
        // 4. Las anti-caché. Este paso no es opcional.
        for (const [clave, valor] of Object.entries(cabeceras)) {
          respuesta.headers.set(clave, valor);
        }
      },
    },
  });

  // Temprano y antes de generar cualquier respuesta: si el refresco terminara después, la sesión
  // nueva no se podría escribir y la petición siguiente volvería a refrescar.
  const { data } = await supabase.auth.getClaims();
  const haySesion = Boolean(data?.claims);

  const ruta = peticion.nextUrl.pathname;
  const esRutaPublica = ruta === "/entrar" || ruta === "/salir";

  if (!haySesion && !esRutaPublica) {
    const destino = peticion.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    destino.searchParams.set("siguiente", ruta + peticion.nextUrl.search);
    return heredar(NextResponse.redirect(destino), respuesta);
  }

  // Con sesión abierta, /entrar no tiene nada que ofrecer. Evita que el botón de atrás deje a
  // alguien mirando un formulario de acceso estando dentro.
  if (haySesion && ruta === "/entrar") {
    const destino = peticion.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return heredar(NextResponse.redirect(destino), respuesta);
  }

  return respuesta;
};

/**
 * Pasa a la redirección las cookies y las cabeceras anti-caché que setAll escribió en la
 * respuesta original. Sin esto se tira el token recién refrescado justo en la petición que
 * redirige, y la siguiente vuelve a refrescar.
 */
function heredar(destino: NextResponse, origen: NextResponse): NextResponse {
  for (const cookie of origen.cookies.getAll()) {
    destino.cookies.set(cookie);
  }
  for (const cabecera of ["cache-control", "expires", "pragma"]) {
    const valor = origen.headers.get(cabecera);
    if (valor) destino.headers.set(cabecera, valor);
  }
  return destino;
}

export const config = {
  /**
   * Sin matcher, el proxy corre en cada petición, incluidos los archivos estáticos.
   *
   * Las exclusiones, con su motivo:
   * - `_next/static` y `_next/image`: sin esto se redirigen el CSS y el JS y la pantalla queda
   *   en blanco.
   * - `datos/` y la extensión `.geojson`: scripts/publicar-datos.mjs publica la cartografía a
   *   public/datos/ y lib/territorio.ts la pide con fetch desde el navegador. Si el proxy la
   *   redirige, cargarSecciones() recibe HTML, truena al parsear y **se cae la resolución de
   *   sección por GPS**, que es el corazón del sistema.
   * - `api/`: los handlers privilegiados hacen su propia comprobación de admin, más estricta
   *   que ésta, y un fetch que espera JSON no debe recibir una redirección HTML.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|datos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|json|geojson|txt|xml|woff|woff2)$).*)",
  ],
};
