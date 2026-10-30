import "server-only";

import type { Metadata } from "next";
import { cache } from "react";
import { EncuestaPublicaFlujo } from "@/components/encuesta-publica/flujo";
import { clienteAdministrador } from "@/lib/supabase-administrador";
import type { EncuestaPublica } from "@/lib/encuestas";

/**
 * La encuesta que abre un QR. La contesta gente sin cuenta, así que vive fuera del grupo
 * (aplicacion): sin dock, sin barras y sin proveedor de identidad.
 *
 * La lectura se hace aquí, en el servidor, con la llave secreta, porque anon no tiene acceso a
 * nada (seguridad.sql, sección 1). Por eso esta consulta es la frontera: **solo** sale lo que se
 * lista abajo, y solo de una encuesta abierta. Nunca quién la creó, cuántas respuestas lleva ni
 * nada de lo que contestaron otros.
 */

const leerEncuesta = cache(async (codigo: string): Promise<EncuestaPublica | null> => {
  if (!/^[a-z0-9]{10}$/.test(codigo)) return null;
  const supabase = clienteAdministrador();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("encuestas")
    .select(
      "codigo, titulo, descripcion, incluye_registro, mensaje_final, preguntas:encuesta_preguntas(id, orden, tipo, texto, obligatoria, opciones)",
    )
    .eq("codigo", codigo)
    .eq("activa", true)
    .maybeSingle<EncuestaPublica>();

  if (error) {
    console.error("[encuestas] lectura pública:", error);
    return null;
  }
  // El orden se pone aquí y no en la consulta: con el embed renombrado, ordenar por la tabla
  // referenciada depende de si PostgREST espera el alias o el nombre, y equivocarse tumba la página.
  if (data) data.preguntas.sort((a, b) => a.orden - b.orden);
  return data;
});

export async function generateMetadata({ params }: PageProps<"/e/[codigo]">): Promise<Metadata> {
  const { codigo } = await params;
  const encuesta = await leerEncuesta(codigo);
  return {
    title: encuesta?.titulo ?? "Encuesta",
    // Un enlace de encuesta se comparte por QR, no se busca. Que no lo indexe nadie.
    robots: { index: false, follow: false },
  };
}

export default async function PaginaEncuesta({ params }: PageProps<"/e/[codigo]">) {
  const { codigo } = await params;
  const encuesta = await leerEncuesta(codigo);

  if (!encuesta) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="tarjeta flex w-full max-w-[26rem] flex-col gap-3 p-7 text-center">
          <h1 className="text-xl font-semibold text-tinta">Esta encuesta ya no está disponible</h1>
          <p className="text-sm text-tinta-suave">
            Puede que ya haya cerrado o que el enlace esté incompleto. Gracias por tu interés.
          </p>
        </div>
      </main>
    );
  }

  return <EncuestaPublicaFlujo encuesta={encuesta} />;
}
