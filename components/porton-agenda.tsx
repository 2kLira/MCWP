import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";

/**
 * Portón de una pantalla que no es para quien solo tiene la agenda.
 *
 * El cliente lo pidió con estas palabras: "al brigadista nada más le debe salir el de agenda y ya
 * es su módulo único". La navegación ya no le ofrece estas pantallas, pero la URL sigue siendo
 * escribible —un enlace viejo, un marcador, el botón de atrás—, y lo que no se puede es dejarlo
 * mirando una tabla vacía: con Row Level Security estas consultas le devuelven cero filas, y una
 * pantalla en blanco se lee como que el sistema se rompió.
 *
 * La forma es la que ya usaban los portones de Usuarios, Carga masiva, Registrar representante y
 * Actividades: título de la pantalla, un párrafo a una medida de lectura. Lo único que se agrega
 * es la salida, porque a quien tiene un solo módulo hay que devolvérselo en lugar de dejarlo en
 * un callejón.
 *
 * Esto es **cosmética**, igual que lib/puertas-ui.ts. Quien protege los datos es RLS.
 */
export function PortonAgenda({ titulo }: { titulo: string }) {
  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina titulo={titulo} />
      <p className="medida text-sm text-tinta-suave">
        Esta pantalla no es para tu rol. Tu trabajo está en la agenda: ahí están las actividades a
        las que te invitaron, y desde cada una registras a la gente que alcanzas.
      </p>
      {/* Única acción de la pantalla, y la única salida. */}
      <Link
        href="/agenda"
        data-destino
        className="boton-primario w-fit"
      >
        <CalendarDays className="size-4" aria-hidden />
        Ir a mi agenda
      </Link>
    </section>
  );
}
