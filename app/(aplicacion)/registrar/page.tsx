import { Suspense } from "react";
import { FormularioRegistro } from "@/components/registro/formulario-registro";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";

/**
 * Sin `searchParams` a propósito: la actividad la lee el formulario en el navegador. Ver la nota
 * de FormularioRegistro; leerla aquí haría una página distinta por actividad y rompería la
 * captura sin señal.
 */
export default function Pagina() {
  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Registrar persona"
        apoyo="La sección se resuelve sola con la ubicación. Solo confírmala."
      />
      {/* useSearchParams exige el límite. No pinta nada propio: el proveedor de identidad ya
          muestra el esqueleto mientras se resuelve la sesión. */}
      <Suspense>
        <FormularioRegistro />
      </Suspense>
    </section>
  );
}
