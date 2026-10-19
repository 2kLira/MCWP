import { cn } from "@/lib/utils";

/**
 * Esqueletos de carga. Dibujan la forma de lo que viene —título, cifras, una lista— para que se
 * note que la aplicación está trabajando y no congelada. El brillo es la utilidad `esqueleto` de
 * globals.css.
 *
 * Son componentes de servidor a propósito: `app/(aplicacion)/loading.tsx` los pinta al instante,
 * antes de que llegue el JavaScript de la pantalla.
 */

/** Un bloque con brillo. La forma se la da quien lo usa. */
export function Bloque({ className }: { className?: string }) {
  return <div aria-hidden className={cn("esqueleto rounded-control", className)} />;
}

/**
 * Una pantalla genérica: encabezado, una fila de cifras y una tarjeta con renglones. Se parece a
 * casi todas las del sistema (tablero, personas, actividades, seguimiento), que es lo que importa:
 * cuando llega el contenido, cae más o menos donde estaba el esqueleto.
 */
export function EsqueletoPagina() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Bloque className="h-9 w-56 md:h-10 md:w-72" />
        <Bloque className="h-4 w-40" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tarjeta flex flex-col gap-3 p-4">
            <Bloque className="h-3.5 w-24" />
            <Bloque className="h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="tarjeta flex flex-col p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-t border-separador py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <Bloque className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Bloque className={cn("h-3.5", i % 2 === 0 ? "w-2/5" : "w-1/3")} />
              <Bloque className="h-3 w-1/4" />
            </div>
            <Bloque className="hidden h-6 w-20 rounded-pildora sm:block" />
          </div>
        ))}
      </div>

      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/**
 * La aplicación completa mientras se confirma la sesión: el riel de escritorio, la píldora de
 * celular y la pantalla. Antes eran dos rectángulos grises sobre la página vacía, y al abrir la
 * aplicación parecía que no hacía nada. Mismas medidas que dock.tsx, barra-inferior.tsx y el
 * <main> del layout, para que al llegar la sesión nada brinque de lugar.
 */
export function EsqueletoAplicacion() {
  return (
    <div className="relative min-h-dvh">
      {/* Riel de escritorio. */}
      <div
        aria-hidden
        className="tarjeta fixed left-5 top-6 z-40 hidden w-14 flex-col items-center gap-2 p-1.5 md:flex"
      >
        <Bloque className="size-11 rounded-[11px]" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Bloque key={i} className="size-11 rounded-[11px] opacity-60" />
        ))}
      </div>

      {/* Buscador y cuenta, arriba a la derecha en escritorio. */}
      <div
        aria-hidden
        className="pointer-events-none relative z-30 hidden h-0 md:block"
      >
        <div className="mx-auto flex w-full max-w-tope items-center justify-end gap-3 pl-[6.5rem] pr-7 pt-6">
          <Bloque className="h-11 w-56 rounded-pildora lg:w-[21rem]" />
          <Bloque className="h-11 w-32 rounded-pildora" />
        </div>
      </div>

      <main className="mx-auto w-full max-w-tope px-4 pb-28 pt-5 md:pb-12 md:pl-[6.5rem] md:pr-7 md:pt-6">
        <EsqueletoPagina />
      </main>

      {/* Píldora de celular. */}
      <div
        aria-hidden
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden"
      >
        <div className="tarjeta grid grid-cols-5 items-center gap-1 rounded-[22px] p-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Bloque key={i} className="h-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
