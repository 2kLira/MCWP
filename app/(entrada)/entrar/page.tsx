import { FormularioEntrada } from "@/components/entrada/formulario-entrada";

/**
 * Pantalla de entrada. Vive en el grupo (entrada) para quedar fuera del dock, de las barras y
 * del proveedor de identidad; ver el comentario de app/layout.tsx.
 *
 * `siguiente` lo pone proxy.ts cuando intercepta una ruta sin sesión, para devolver a la persona
 * a donde iba en lugar de a la raíz.
 */
export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const siguiente = typeof params.siguiente === "string" ? params.siguiente : undefined;

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
      {/* Una sola tarjeta: el título y el formulario comparten superficie. */}
      <div className="tarjeta flex w-full max-w-[24rem] flex-col gap-5 p-7">
        <h1 className="text-[1.375rem] font-semibold leading-[1.15] tracking-[-0.02em] text-tinta">
          Estructura territorial
          <br />
          Oaxaca de Juárez
        </h1>

        <FormularioEntrada siguiente={siguiente} />
      </div>
    </main>
  );
}
