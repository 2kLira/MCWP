"use client";

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

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = correo.trim().length > 3 && contrasena.length > 0;

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
      password: contrasena,
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
        <input
          className="campo"
          type="password"
          name="contrasena"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
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
