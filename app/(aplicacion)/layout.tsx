import { AvisoConfiguracion } from "@/components/aviso-configuracion";
import { BarraInferior } from "@/components/navegacion/barra-inferior";
import { BarraSuperior } from "@/components/navegacion/barra-superior";
import { Dock } from "@/components/navegacion/dock";
import { ProveedorActuante } from "@/components/proveedor-actuante";
import { LaminaTerritorial } from "@/components/sustrato/lamina-territorial";

/**
 * La cáscara de la aplicación. Todo lo que exige sesión vive dentro de este grupo de ruta.
 *
 * Separado del layout raíz para que /entrar quede fuera del dock, de las barras y del proveedor
 * de identidad. El grupo no cambia ninguna URL: app/(aplicacion)/personas sigue sirviéndose en
 * /personas.
 *
 * Esto NO es una frontera de seguridad. Los layouts no se re-renderizan al navegar (Partial
 * Rendering), así que no sirven para vigilar nada. La seguridad es Row Level Security en
 * supabase/seguridad.sql; proxy.ts y el proveedor son comodidad.
 */
export default function LayoutAplicacion({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorActuante>
      {/* El territorio es el sustrato de toda la aplicación: por eso el vidrio de las
          tarjetas tiene algo real detrás. */}
      <LaminaTerritorial />

      <Dock />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <BarraSuperior />
        {/* Espacio a la izquierda para el dock flotante y abajo para la píldora de celular. */}
        <main className="mx-auto w-full max-w-tope flex-1 px-4 pb-28 pt-4 md:pl-24 md:pr-6 md:pb-10 md:pt-5">
          <AvisoConfiguracion />
          {children}
        </main>
      </div>

      <BarraInferior />
    </ProveedorActuante>
  );
}
