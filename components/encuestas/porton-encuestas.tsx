"use client";

import { useActuante } from "@/components/proveedor-actuante";
import { PortonAgenda } from "@/components/porton-agenda";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { puedeAdministrarEncuestas, puedeVerListadosGenerales } from "@/lib/puertas-ui";

/**
 * Cosmética, como todo lo de lib/puertas-ui.ts: quien no es administrador vería pantallas vacías
 * porque RLS no le entrega ninguna encuesta. Mismo trato que Usuarios.
 */
export function PortonEncuestas({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const { actuante } = useActuante();
  if (!puedeVerListadosGenerales(actuante)) return <PortonAgenda titulo={titulo} />;
  if (!puedeAdministrarEncuestas(actuante)) {
    return (
      <section className="flex flex-col gap-5">
        <EncabezadoPagina titulo={titulo} />
        <p className="medida text-sm text-tinta-suave">
          Las encuestas solo las administra el administrador general.
        </p>
      </section>
    );
  }
  return <>{children}</>;
}
