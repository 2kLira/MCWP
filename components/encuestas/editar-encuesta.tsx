"use client";

import { useActuante } from "@/components/proveedor-actuante";
import { EditorEncuesta } from "@/components/encuestas/editor-encuesta";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { obtenerEncuesta, type EncuestaCompleta } from "@/lib/datos/encuestas";
import { useConsulta } from "@/lib/usar-consulta";

export function EditarEncuesta({ id }: { id: string }) {
  const { actuante } = useActuante();
  const encuesta = useConsulta<EncuestaCompleta | null>(
    () => obtenerEncuesta(actuante, id),
    null,
    [actuante.id, id],
  );

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Editar encuesta"
        volver={{ href: `/encuestas/${id}`, etiqueta: encuesta.datos?.titulo ?? "Encuesta" }}
      />
      <div className="max-w-[44rem]">
        {encuesta.cargando ? (
          <div className="esqueleto h-96 rounded-[var(--radio-tarjeta)]" />
        ) : encuesta.datos ? (
          // La llave fuerza a montar el editor con los datos ya cargados.
          <EditorEncuesta key={encuesta.datos.id} inicial={encuesta.datos} />
        ) : (
          <p className="text-sm text-tinta-suave">{encuesta.aviso ?? "Esta encuesta no existe."}</p>
        )}
      </div>
    </div>
  );
}
