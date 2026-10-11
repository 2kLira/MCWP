import { FormularioReporte } from "@/components/reportes/formulario-reporte";

export default function Pagina() {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <header>
        <h1 className="text-xl">Levantar reporte</h1>
        <p className="text-sm text-tinta-suave">
          Un problema o necesidad del territorio. Tu ubicación, tu nombre y la hora se guardan
          solos.
        </p>
      </header>
      <FormularioReporte />
    </section>
  );
}
