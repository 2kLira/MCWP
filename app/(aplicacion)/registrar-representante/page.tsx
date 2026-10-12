"use client";

import { useActuante } from "@/components/proveedor-actuante";
import { FormularioRepresentante } from "@/components/casillas/formulario-representante";
import { PortonAgenda } from "@/components/porton-agenda";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { puedeEncabezarActividad, puedeVerListadosGenerales } from "@/lib/puertas-ui";

/**
 * Portón igual al de app/usuarios/page.tsx: el rol que no alcanza ve un aviso, no un formulario a
 * medias. El recorte fino por casilla (territorio) lo resuelve lib/datos/casillas.ts al buscar y
 * al guardar; aquí solo se decide si el rol, en general, coordina estructura.
 */
export default function Pagina() {
  const { actuante } = useActuante();

  // Al brigadista, su agenda; a quien sí coordina territorio pero no esta pantalla, el aviso de
  // siempre. Hoy ambas puertas se cierran para el mismo rol, pero son dos razones distintas y el
  // día que una cambie no hay que volver a pensar la otra.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Registrar representante" />;
  }

  if (!puedeEncabezarActividad(actuante)) {
    return (
      <section className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Registrar representante" />
        <p className="medida text-sm text-tinta-suave">
          Esta pantalla es para quien coordina estructura territorial. Cambia de rol en el
          conmutador para verla.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Registrar representante"
        apoyo="Primero la casilla, luego el cargo, luego la persona."
      />
      <FormularioRepresentante />
    </section>
  );
}
