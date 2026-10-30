import { EditorEncuesta } from "@/components/encuestas/editor-encuesta";
import { PortonEncuestas } from "@/components/encuestas/porton-encuestas";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";

export default function Pagina() {
  return (
    <PortonEncuestas titulo="Nueva encuesta">
      <div className="flex flex-col gap-5">
        <EncabezadoPagina
          titulo="Nueva encuesta"
          volver={{ href: "/encuestas", etiqueta: "Encuestas" }}
          apoyo="Al crearla se genera su enlace y su código QR."
        />
        <div className="max-w-[44rem]">
          <EditorEncuesta />
        </div>
      </div>
    </PortonEncuestas>
  );
}
