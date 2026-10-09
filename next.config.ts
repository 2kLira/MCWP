import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad de la capa HTTP.
 *
 * Todo lo que sigue sale de `headers()` de next.config, que la documentación de Next 16 describe
 * como "checked before the filesystem which includes pages and /public files": alcanza las
 * páginas, los handlers de /api, los archivos de _next/static y la cartografía de public/datos/.
 * Eso importa porque proxy.ts **no** alcanza nada de eso —su matcher excluye a propósito
 * `_next/static`, `api/` y `datos/`— así que una cabecera puesta en el proxy habría dejado fuera
 * justo las respuestas que más se sirven.
 *
 * No se usa nonce. El nonce se genera en proxy.ts y obliga a render dinámico en todas las
 * páginas; hoy las 16 pantallas se prerrenderizan estáticas (`compute: "static"` en
 * .next/prerender-manifest.json) y son cáscaras sin un solo dato: los datos los pide el navegador
 * a Supabase. Cambiar eso por un nonce costaría el prerrenderizado completo. La decisión y su
 * precio están en el informe de auditoría.
 */

const enDesarrollo = process.env.NODE_ENV === "development";

/**
 * El origen de Supabase se deriva de la variable de entorno, no se escribe a mano: así el CSP
 * sigue siendo correcto si el proyecto cambia de instancia. Si la variable falta, se queda vacío
 * y la aplicación ya degrada con su propio aviso.
 */
const origenSupabase = (() => {
  const crudo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!crudo) return [] as string[];
  try {
    const { origin, host } = new URL(crudo);
    // El websocket de Realtime es el mismo host con otro esquema, y `connect-src` distingue
    // esquemas: sin la entrada `wss:` una suscripción futura moriría sin explicación visible.
    return [origin, `wss://${host}`];
  } catch {
    return [] as string[];
  }
})();

/**
 * Dominios del mapa base, verificados pidiendo los estilos reales:
 *
 * - `basemaps.cartocdn.com` sirve los dos style.json (positron y dark-matter).
 * - `tiles.basemaps.cartocdn.com` sirve el sprite y los glifos ({fontstack}/{range}.pbf).
 * - `tiles-a…d.basemaps.cartocdn.com` sirven las teselas vectoriales .mvt.
 *
 * El comodín cubre los cuatro turnos de teselas y cualquiera que CARTO agregue después, sin
 * abrirle la puerta a todo cartocdn.com.
 */
const origenesCarto = ["https://basemaps.cartocdn.com", "https://*.basemaps.cartocdn.com"];

const csp = [
  "default-src 'self'",

  // Nada de <base href>: no hay ninguno en la aplicación y es el vector clásico para desviar
  // todas las URL relativas de la página.
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",

  // El mapa no se embebe en ningún lado y no hay nada que embeber aquí. frame-ancestors es la
  // versión moderna de X-Frame-Options; se manda también el viejo, más abajo, por clientes
  // antiguos.
  "frame-ancestors 'none'",

  // El único formulario que postea de verdad es <form action="/salir" method="post">. El login
  // no postea: habla con Supabase por fetch, así que cae en connect-src.
  "form-action 'self'",

  // `unsafe-inline` es obligado sin nonce: Next inyecta los scripts de arranque en línea
  // (self.__next_f.push) y sin nonce no hay forma de distinguirlos. Lo que esta directiva sí
  // compra es que no se pueda cargar un script desde un dominio ajeno y que no haya `eval`.
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,

  // `unsafe-inline` aquí no es negociable y no lo arreglaría un nonce: React escribe los `style`
  // de Recharts y MapLibre como atributos, y los atributos de estilo no llevan nonce.
  "style-src 'self' 'unsafe-inline'",

  // `next/font/google` autoaloja: los woff2 salen de /_next/static/media/, no de Google.
  "font-src 'self'",

  // `data:` por los SVG en línea; `blob:` por la vista previa de las fotos antes de subirlas;
  // Supabase por las URL firmadas de la cubeta de evidencia; CARTO por el sprite del mapa.
  `img-src 'self' data: blob: ${[...origenSupabase.filter((o) => o.startsWith("https:")), ...origenesCarto].join(" ")}`,

  // Toda la aplicación lee de Supabase desde el navegador, así que esta es la directiva que de
  // verdad limita a dónde se podrían exfiltrar datos si alguien lograra inyectar un script.
  `connect-src 'self' ${[...origenSupabase, ...origenesCarto].join(" ")}${enDesarrollo ? " ws:" : ""}`,

  // **Esta línea es la que mantiene vivo el mapa.** maplibre-gl arranca su worker con
  // `URL.createObjectURL(new Blob([...]))` (dist/maplibre-gl.js, setWorkerUrl): sin `blob:` el
  // mapa no pinta una sola tesela. `child-src` es el mismo valor para navegadores viejos que
  // ignoran worker-src.
  "worker-src 'self' blob:",
  "child-src 'self' blob:",

  "manifest-src 'self'",

  // Fuera de desarrollo, porque en http://localhost no hay nada que elevar.
  ...(enDesarrollo ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const cabecerasDeSeguridad = [
  {
    /**
     * Dos años, que es el valor que pide la lista de precarga y el que recomienda la propia
     * documentación de Next.
     *
     * `includeSubDomains` sí, `preload` **no**. En un `*.vercel.app` da igual: el dominio
     * `vercel.app` ya está precargado con includeSubDomains, así que el navegador nunca hace una
     * petición en claro. El valor real de esta cabecera aparece el día que haya dominio propio, y
     * ahí `preload` sería un error: entrar a la lista se decide por release del navegador y salir
     * tarda meses, así que un dominio institucional quedaría obligado a HTTPS en **todos** sus
     * subdominios aunque alguno siga sirviéndose en claro. `includeSubDomains` tiene el mismo
     * riesgo pero reversible en `max-age`; si el despliegue acaba en un ápice compartido con
     * otros servicios del municipio, hay que quitarlo.
     */
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    // Impide que el navegador adivine el tipo. Aquí pesa por la cartografía: /datos/*.geojson se
    // sirve como application/geo+json, un tipo que el navegador no renderiza, y por las fotos de
    // evidencia, que son contenido subido.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Redundante con frame-ancestors en navegador moderno. Se manda igual porque no cuesta nada.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Las URL de esta aplicación llevan identificadores (/personas/<uuid>, /actividades/<uuid>) y
    // la página hace peticiones a CARTO y a Supabase. Esto recorta el referente a solo el origen
    // cuando sale de casa. Es el valor que ya traen por defecto los navegadores actuales; se
    // escribe para no depender de ese defecto.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    /**
     * `geolocation=(self)` es el único permiso que se concede, y se concede porque es el corazón
     * del sistema: la resolución de sección por GPS.
     *
     * `camera=()` **no** rompe la captura de fotos: evidencia.tsx y fotos-actividad.tsx usan
     * <input type="file" capture="environment">, que abre la cámara del sistema operativo y no
     * pasa por getUserMedia. Se verificó en el código antes de cerrarla.
     */
    key: "Permissions-Policy",
    value: [
      "geolocation=(self)",
      "camera=()",
      "microphone=()",
      "display-capture=()",
      "payment=()",
      "usb=()",
      "serial=()",
      "bluetooth=()",
      "idle-detection=()",
      "midi=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    // No se abre ninguna ventana emergente —no hay proveedores OAuth, el login es correo y
    // contraseña— así que aislar el grupo de contexto no tiene contraindicación.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    // Rendimiento, no seguridad. Se declara para que el navegador resuelva cartocdn.com antes de
    // que el mapa pida la primera tesela.
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Content-Security-Policy",
    value: csp,
  },
];

const nextConfig: NextConfig = {
  // Anuncia versión exacta del framework en cada respuesta. No es una vulnerabilidad, es
  // reconocimiento gratis para quien busque un CVE de esta versión.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Todo: páginas, /api, _next/static y public/datos. Es a propósito que no haya
        // excepciones: una excepción en una cabecera de seguridad es una excepción que alguien
        // va a encontrar.
        source: "/:ruta*",
        headers: cabecerasDeSeguridad,
      },
    ];
  },
};

export default nextConfig;
