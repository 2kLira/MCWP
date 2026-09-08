import { FichaActividad } from "@/components/actividades/ficha-actividad";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaActividad id={id} />;
}
