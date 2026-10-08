"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { alcanceDe, type Alcance } from "@/lib/puertas-ui";
import { clienteSupabase, faltaConfiguracion } from "@/lib/supabase";
import type { RolUsuario, UsuarioActuante } from "@/lib/tipos";

/**
 * Quién está actuando. Sale de la sesión de Supabase Auth, no de un selector.
 *
 * `usuarios.id` es el mismo id de `auth.users`, así que de la sesión se saca el id y con él se
 * lee la ficha bajo la política `usuarios_ve_su_fila`, que deja a cada quien leer la suya.
 *
 * Esto **no es seguridad**, es comodidad: sirve para saber qué nombre poner en la cápsula y qué
 * botones esconder. Quien protege los datos es Row Level Security, en cada consulta.
 */

type Estado =
  | "cargando"
  | "sin_configuracion"
  | "sin_sesion"
  | "sin_registro"
  | "inactivo"
  | "lista";

type Contexto = {
  /** El usuario que está actuando. Nunca es nulo: los hijos no se montan hasta que existe. */
  actuante: UsuarioActuante;
  alcance: Alcance;
};

const ContextoActuante = createContext<Contexto | null>(null);

type FilaUsuario = {
  id: string;
  nombre: string;
  rol: RolUsuario;
  demarcacion_id: number | null;
  seccion_clave: string | null;
  activo: boolean;
};

function aActuante(fila: FilaUsuario): UsuarioActuante {
  return {
    id: fila.id,
    nombre: fila.nombre,
    rol: fila.rol,
    demarcacionId: fila.demarcacion_id,
    seccionClave: fila.seccion_clave,
    activo: fila.activo,
  };
}

export function ProveedorActuante({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // La falta de configuración se sabe sin el cliente: faltaConfiguracion() solo lee variables de
  // entorno, así que se resuelve en el estado inicial. Antes esto era un setEstado sincrónico
  // dentro del efecto, que dispara renders en cascada.
  const [estado, setEstado] = useState<Estado>(() =>
    faltaConfiguracion() ? "sin_configuracion" : "cargando",
  );
  const [actuante, setActuante] = useState<UsuarioActuante | null>(null);
  // Para comparar en onAuthStateChange sin arrastrar el actuante a las dependencias del efecto.
  const idActual = useRef<string | null>(null);

  useEffect(() => {
    // Un efecto solo corre en el navegador, así que aquí clienteSupabase() devuelve null
    // únicamente si faltan las variables, y eso ya quedó en el estado inicial.
    const supabase = clienteSupabase();
    if (!supabase) return;

    let vivo = true;

    async function resolver() {
      // getClaims verifica la firma localmente contra el JWKS: el proyecto firma con ES256, así
      // que esto no es un viaje de red.
      const { data } = await supabase!.auth.getClaims();
      const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
      if (!vivo) return;

      if (!sub) {
        idActual.current = null;
        setActuante(null);
        setEstado("sin_sesion");
        // Segunda capa, después de proxy.ts: los layouts no se re-renderizan al navegar, así que
        // la comprobación se repite aquí. La de verdad la hace RLS en cada consulta.
        router.replace("/entrar");
        return;
      }

      const { data: fila } = await supabase!
        .from("usuarios")
        .select("id, nombre, rol, demarcacion_id, seccion_clave, activo")
        .eq("id", sub)
        .maybeSingle<FilaUsuario>();
      if (!vivo) return;

      if (!fila) {
        idActual.current = sub;
        setActuante(null);
        setEstado("sin_registro");
        return;
      }

      idActual.current = fila.id;
      setActuante(aActuante(fila));
      setEstado(fila.activo ? "lista" : "inactivo");
    }

    void resolver();

    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (!vivo) return;

      if (evento === "SIGNED_OUT") {
        idActual.current = null;
        setActuante(null);
        setEstado("sin_sesion");
        router.replace("/entrar");
        return;
      }

      // TOKEN_REFRESHED se ignora a propósito. Es el mismo usuario, y volver a consultar
      // cambiaría la referencia del objeto `actuante` cada hora, lo que redispararía las
      // consultas de las 17 pantallas sin que haya cambiado nada.
      if (sesion?.user?.id && sesion.user.id !== idActual.current) {
        void resolver();
      }
    });

    return () => {
      vivo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, [router]);

  const valor = useMemo<Contexto | null>(
    () => (actuante ? { actuante, alcance: alcanceDe(actuante) } : null),
    [actuante],
  );

  if (estado === "lista" && valor) {
    return (
      <ContextoActuante.Provider value={valor}>{children}</ContextoActuante.Provider>
    );
  }

  // Los hijos no se montan hasta que el actuante es el definitivo. Eso es lo que hace que cada
  // useConsulta arranque con el actuante.id final y dispare una sola ronda de consultas.
  if (estado === "cargando" || estado === "sin_sesion") {
    return <Esqueleto />;
  }

  if (estado === "sin_configuracion") {
    return (
      <Puerta titulo="Sin conexión a la base de datos">
        Este despliegue no tiene configuradas las variables de Supabase. Se incrustan al compilar,
        así que no basta con guardarlas: hay que volver a desplegar.
      </Puerta>
    );
  }

  if (estado === "sin_registro") {
    return (
      <Puerta titulo="Tu cuenta no está dada de alta" conSalida>
        Tu cuenta de acceso existe pero no está registrada en el sistema. Pídele al administrador
        general que te dé de alta.
      </Puerta>
    );
  }

  return (
    <Puerta titulo="Tu cuenta está desactivada" conSalida>
      Si crees que es un error, avísale al administrador general.
    </Puerta>
  );
}

/** Esqueleto que se disuelve en el contenido. Nada de indicadores giratorios. */
function Esqueleto() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-tope flex-col gap-4 px-4 py-6">
      <div className="h-8 w-48 animate-pulse rounded-control bg-superficie-hundida" />
      <div className="h-64 animate-pulse rounded-tarjeta bg-superficie-hundida" />
    </div>
  );
}

/**
 * Pantalla de cierre: explica por qué no se puede entrar y ofrece salir.
 *
 * No se llama signOut() solo: eso rebotaría a /entrar, la persona volvería a entrar con
 * credenciales válidas y entraría en un bucle sin leer nunca el motivo.
 */
function Puerta({
  titulo,
  children,
  conSalida = false,
}: {
  titulo: string;
  children: React.ReactNode;
  conSalida?: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 py-10">
      <div
        role="status"
        className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-5"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-alerta">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {titulo}
        </p>
        <p className="medida text-sm text-tinta-suave">{children}</p>
        {conSalida && (
          <form action="/salir" method="post">
            <button
              type="submit"
              className="transicion-ui toque-actividad w-full rounded-control border border-borde bg-superficie text-sm text-tinta hover:bg-superficie-hundida"
            >
              Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export function useActuante(): Contexto {
  const contexto = useContext(ContextoActuante);
  if (!contexto) {
    throw new Error("useActuante debe usarse dentro de ProveedorActuante.");
  }
  return contexto;
}
