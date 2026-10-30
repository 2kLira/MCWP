import { PortonEncuestas } from "@/components/encuestas/porton-encuestas";
import { ResultadosEncuesta } from "@/components/encuestas/resultados-encuesta";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PortonEncuestas titulo="Encuesta">
      <ResultadosEncuesta id={id} />
    </PortonEncuestas>
  );
}
