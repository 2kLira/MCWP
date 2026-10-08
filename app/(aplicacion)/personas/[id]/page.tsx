import { FichaPersona } from "@/components/personas/ficha-persona";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaPersona id={id} />;
}
