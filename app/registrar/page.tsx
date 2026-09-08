import { FormularioRegistro } from "@/components/registro/formulario-registro";

export default async function Pagina({ searchParams }: PageProps<"/registrar">) {
  const params = await searchParams;
  const actividad = typeof params.actividad === "string" ? params.actividad : undefined;

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <header>
        <h1 className="text-xl">Registrar persona</h1>
        <p className="text-sm text-tinta-suave">
          La sección se resuelve sola con la ubicación. Solo confírmala.
        </p>
      </header>
      <FormularioRegistro actividadId={actividad} />
    </section>
  );
}
