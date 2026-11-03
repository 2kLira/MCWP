"use client";

import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Hoja } from "@/components/actividades/hoja";
import { useActuante } from "@/components/proveedor-actuante";
import { borrarColaDeUsuario, listarCola } from "@/lib/sin-conexion/cola";
import { borrarRespaldos } from "@/lib/sin-conexion/respaldo";

/**
 * La salida, con la limpieza del teléfono.
 *
 * Sigue siendo un formulario que postea a /salir —ver capsula-sesion.tsx—: sin JavaScript sale
 * igual. Lo que agrega el JavaScript es, antes de salir:
 *
 * - **Advertir de lo que no se ha enviado.** Al salir se borra, porque un teléfono de campo se
 *   presta y se pierde, y las capturas son datos personales de gente real. Pero borrarlas en
 *   silencio sería perder trabajo de campo sin que nadie lo decida, así que se pregunta.
 * - **Borrar** las capturas de esta cuenta y lo que se guardó para trabajar sin señal.
 */
export function FormularioSalida({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { actuante } = useActuante();
  const formulario = useRef<HTMLFormElement>(null);
  const confirmada = useRef(false);
  const [sinEnviar, setSinEnviar] = useState(0);

  async function salir() {
    await borrarColaDeUsuario(actuante.id).catch((e) => console.error(e));
    borrarRespaldos();
    confirmada.current = true;
    formulario.current?.requestSubmit();
  }

  async function alEnviar(evento: React.FormEvent<HTMLFormElement>) {
    if (confirmada.current) return;
    evento.preventDefault();
    const cola = await listarCola(actuante.id).catch(() => []);
    // Las que ya llegaron con avisos no cuentan: están en la base.
    const n = cola.filter((p) => p.estado !== "con_avisos").length;
    if (n > 0) setSinEnviar(n);
    else await salir();
  }

  return (
    <form
      ref={formulario}
      action="/salir"
      method="post"
      onSubmit={alEnviar}
      className={className}
    >
      {children}

      <Hoja titulo="Capturas sin enviar" abierta={sinEnviar > 0} alCerrar={() => setSinEnviar(0)}>
        <div className="flex flex-col gap-4 p-5">
          <p className="flex items-start gap-2 text-sm text-tinta">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta" aria-hidden />
            {sinEnviar === 1
              ? "Hay una captura que todavía no llega a la base."
              : `Hay ${sinEnviar} capturas que todavía no llegan a la base.`}{" "}
            Si cierras sesión se borran de este teléfono y no se pueden recuperar.
          </p>
          <p className="medida text-sm text-tinta-suave">
            Para no perderlas, busca señal y toca &ldquo;Enviar ahora&rdquo; antes de salir.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => setSinEnviar(0)}
              className="boton-primario min-h-12 sm:flex-1"
            >
              No salir
            </button>
            <button
              type="button"
              onClick={() => void salir()}
              className="boton min-h-12 text-alerta sm:flex-1"
            >
              Salir y borrarlas
            </button>
          </div>
        </div>
      </Hoja>
    </form>
  );
}
