import { FormularioReporte } from "@/components/reportes/formulario-reporte";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";

export default function Pagina() {
  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Levantar reporte"
        apoyo="Un problema o necesidad del territorio. Tu ubicación, tu nombre y la hora se guardan solos."
      />
      <FormularioReporte />
    </section>
  );
}
