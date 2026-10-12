import { FormularioRegistro } from "@/components/registro/formulario-registro";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";

export default async function Pagina({ searchParams }: PageProps<"/registrar">) {
  const params = await searchParams;
  const actividad = typeof params.actividad === "string" ? params.actividad : undefined;

  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Registrar persona"
        apoyo="La sección se resuelve sola con la ubicación. Solo confírmala."
      />
      <FormularioRegistro actividadId={actividad} />
    </section>
  );
}
