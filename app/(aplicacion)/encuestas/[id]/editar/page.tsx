import { PortonEncuestas } from "@/components/encuestas/porton-encuestas";
import { EditarEncuesta } from "@/components/encuestas/editar-encuesta";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PortonEncuestas titulo="Editar encuesta">
      <EditarEncuesta id={id} />
    </PortonEncuestas>
  );
}
