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
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-4 py-10">
      <header>
        <h1 className="text-xl">Estructura territorial</h1>
        <p className="text-sm text-tinta-suave">Oaxaca de Juárez</p>
      </header>

      <FormularioEntrada siguiente={siguiente} />
    </main>
  );
}
