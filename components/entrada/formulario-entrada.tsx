"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Campo } from "@/components/campo";
import { clienteSupabase } from "@/lib/supabase";

/**
 * Traducción de los códigos de Supabase Auth.
 *
 * Nunca se dice cuál de los dos campos está mal: decir "ese correo no existe" le confirma a
 * quien prueba al azar qué cuentas hay. Y nunca se muestra el mensaje crudo en inglés.
 */
function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Esta cuenta todavía no está confirmada. Pídele al administrador general que la active.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera un minuto y vuelve a probar.";
    case "user_banned":
      return "Esta cuenta está suspendida.";
    default:
      return "No se pudo entrar. Revisa tu conexión e intenta de nuevo.";
  }
}

export function FormularioEntrada({ siguiente }: { siguiente?: string }) {
  const router = useRouter();
  const campoCorreo = useRef<HTMLInputElement>(null);
  const campoContrasena = useRef<HTMLInputElement>(null);

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = correo.trim().length > 3 && contrasena.trim().length > 0;

  /**
   * Cambiar el `type` de un input manda el cursor al final. Se guarda la posición y se restaura
   * después de que React vuelve a pintar, para que alternar el ojito no obligue a buscar dónde
   * se iba escribiendo.
   */
  function alternarContrasena() {
    const campo = campoContrasena.current;
    const inicio = campo?.selectionStart ?? null;
    const fin = campo?.selectionEnd ?? null;
    setVerContrasena((v) => !v);
    requestAnimationFrame(() => {
      const actual = campoContrasena.current;
      if (!actual) return;
      actual.focus();
      if (inicio !== null && fin !== null) {
        try {
          actual.setSelectionRange(inicio, fin);
        } catch {
          // Algunos navegadores no permiten setSelectionRange según el tipo. No pasa nada.
        }
      }
    });
  }

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || entrando) return;

    const supabase = clienteSupabase();
    if (!supabase) {
      setError("Este despliegue no está conectado a la base de datos.");
      return;
    }

    setEntrando(true);
    setError(null);

    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      // Se recorta el espacio en blanco, que normalmente NO se hace con contraseñas porque una
      // persona puede haber elegido una que empiece o termine con espacio. Aquí no puede: todas
      // las contraseñas del sistema las genera el servidor desde un alfabeto sin espacios, en
      // lib/api/porton-admin.ts. Y como se entregan copiándolas y pegándolas —no hay correo de
      // recuperación—, un espacio invisible al final del portapapeles daba "Correo o contraseña
      // incorrectos" sin que nadie pudiera adivinar por qué.
      password: contrasena.trim(),
    });

    if (fallo) {
      setEntrando(false);
      setError(mensajeDeError(fallo.code));
      setContrasena("");
      campoCorreo.current?.focus();
      return;
    }

    // El navegador acaba de escribir las cookies con document.cookie. Sin refresh, el árbol de
    // servidor podría venir cacheado de la petición anterior, cuando no había sesión.
    router.replace(siguiente && siguiente.startsWith("/") ? siguiente : "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={entrar}
      className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-6"
    >
      <Campo etiqueta="Correo">
        <input
          ref={campoCorreo}
          className="campo"
          type="email"
          name="correo"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
      </Campo>

      <Campo etiqueta="Contraseña">
        {/* Mismo patrón que el buscador de personas: contenedor relativo y el control encima del
            campo, aquí a la derecha. El `pr-11` evita que el texto pase por debajo del botón. */}
        <div className="relative">
          <input
            ref={campoContrasena}
            className="campo pr-11"
            type={verContrasena ? "text" : "password"}
            name="contrasena"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
          <button
            type="button"
            onClick={alternarContrasena}
            aria-label={verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={verContrasena}
            className="transicion-ui absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-tinta-tenue transition-colors hover:text-tinta"
          >
            {verContrasena ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </Campo>

      <button
        type="submit"
        disabled={!listo || entrando}
        className="transicion-ui toque-actividad rounded-control bg-naranja text-base font-medium text-sobre-naranja disabled:opacity-50"
      >
        {entrando ? "Entrando…" : "Entrar"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-alerta">
          {error}
        </p>
      )}

      {/* Consecuencia directa de que no haya servidor de correo. Más vale decirlo aquí que
          recibir la llamada el lunes. */}
      <p className="text-sm text-tinta-suave">
        ¿Olvidaste tu contraseña? El administrador general la repone. Este sistema no manda
        correos.
      </p>
    </form>
  );
}
