/**
 * Atributos de la cookie de sesión.
 *
 * Vive en su propio módulo porque **los tres clientes tienen que usar exactamente los mismos**:
 * el de navegador, el de servidor y el de `proxy.ts`. Si uno escribiera con atributos distintos a
 * los que otro espera, el navegador guardaría dos cookies con el mismo nombre y distinto ámbito y
 * la sesión se caería de formas difíciles de reproducir.
 *
 * Qué se cambió aquí y por qué, de la auditoría del 9 de octubre de 2026:
 *
 * - **`secure` en producción.** Los valores por omisión de `@supabase/ssr` no lo traen. El HSTS
 *   ya evita que el navegador haga una petición en claro a este dominio, así que es cinturón
 *   sobre tirante, pero es gratis. **No en desarrollo**, porque en `http://localhost` una cookie
 *   `Secure` no se guarda y el login dejaría de funcionar.
 *
 * - **`maxAge` de 30 días en lugar de 400.** Cuatrocientos días es el máximo que acepta un
 *   navegador, no una decisión. En un sistema con datos personales reales, sin segundo factor y
 *   con el acceso repartido por invitación, un teléfono perdido no debe seguir entrando trece
 *   meses después. Treinta días no molesta a nadie que entre a trabajar cada semana.
 *
 *   **Ojo: `@supabase/ssr` ignora este `maxAge`.** Se leyó su código, no su documentación:
 *   `cookies.js` arma las opciones de escritura con `{...DEFAULT_COOKIE_OPTIONS,
 *   ...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge}`, o sea que vuelve a poner los 400
 *   días **después** de aplicar los nuestros, en las dos rutas de escritura (líneas 230 y 470 de
 *   la versión 0.12.7). `secure` y `sameSite` sí pasan. Por eso el recorte se impone además en
 *   `proxy.ts`, que es donde esta aplicación controla de verdad el `Set-Cookie`, y por eso esta
 *   constante exporta el número aparte: para que haya **un solo** valor y no dos que se
 *   contradigan.
 *
 *   Lo que queda sin recortar es la cookie que escribe el navegador al entrar, porque eso pasa en
 *   `document.cookie` y el proxy no lo ve. La primera navegación posterior la reescribe con el
 *   tope correcto, y de todos modos el acceso real lo gobierna el refresh token del lado de
 *   Supabase, no la vigencia de la cookie: una cuenta suspendida no refresca aunque la cookie
 *   viva.
 *
 * Lo que **no** se toca: `httpOnly`. La librería la deja en false a propósito y no es un
 * descuido: el cliente de navegador lee el token con JavaScript para ponerlo en el
 * `Authorization` de cada consulta. Hacerla httpOnly rompería toda la capa de datos. Lo que
 * contiene esa exposición es el CSP de `next.config.ts`, que no admite ningún origen de script
 * externo y limita `connect-src` a Supabase y CARTO.
 */

export const MAX_EDAD_COOKIE_SESION = 60 * 60 * 24 * 30;

export const OPCIONES_COOKIE_SESION = {
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: MAX_EDAD_COOKIE_SESION,
} as const;
