"use client";

import { useActuante } from "@/components/proveedor-actuante";
import { FormularioRepresentante } from "@/components/casillas/formulario-representante";
import { puedeEncabezarActividad } from "@/lib/permisos";

/**
 * Portón igual al de app/usuarios/page.tsx: el rol que no alcanza ve un aviso, no un formulario a
 * medias. El recorte fino por casilla (territorio) lo resuelve lib/datos/casillas.ts al buscar y
 * al guardar; aquí solo se decide si el rol, en general, coordina estructura.
 */
export default function Pagina() {
  const { actuante } = useActuante();

  if (!puedeEncabezarActividad(actuante)) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-xl">Registrar representante</h1>
        <p className="medida text-sm text-tinta-suave">
          Esta pantalla es para quien coordina estructura territorial. Cambia de rol en el
          conmutador para verla.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <header>
        <h1 className="text-xl">Registrar representante</h1>
        <p className="text-sm text-tinta-suave">
          Primero la casilla, luego el cargo, luego la persona.
        </p>
      </header>
      <FormularioRepresentante />
    </section>
  );
}
