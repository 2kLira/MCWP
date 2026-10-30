"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, Plus, QrCode } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { PortonEncuestas } from "@/components/encuestas/porton-encuestas";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Estado } from "@/components/sistema/estado";
import { listarEncuestas, type EncuestaEnLista } from "@/lib/datos/encuestas";
import { useConsulta } from "@/lib/usar-consulta";

export default function Encuestas() {
  return (
    <PortonEncuestas titulo="Encuestas">
      <ListaEncuestas />
    </PortonEncuestas>
  );
}

function ListaEncuestas() {
  const { actuante } = useActuante();
  const encuestas = useConsulta<EncuestaEnLista[]>(
    () => listarEncuestas(actuante),
    [],
    [actuante.id],
  );
  const total = encuestas.datos.reduce((s, e) => s + (e.resumen?.respuestas ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Encuestas"
        apoyo={
          <span className="cifras">
            {encuestas.cargando
              ? "Cargando…"
              : `${encuestas.datos.length} encuestas · ${total.toLocaleString("es-MX")} respuestas`}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <p className="medida text-sm text-tinta-suave">
          Cada encuesta tiene su enlace y su código QR. Se contesta sin cuenta, desde el celular.
        </p>
        <Link href="/encuestas/nueva" className="boton-primario ml-auto">
          <Plus className="size-4" aria-hidden />
          Nueva encuesta
        </Link>
      </div>

      {encuestas.aviso && (
        <p role="alert" className="text-sm text-alerta">
          {encuestas.aviso}
        </p>
      )}

      {encuestas.cargando ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="esqueleto h-28 rounded-[var(--radio-tarjeta)]" />
          ))}
        </div>
      ) : encuestas.datos.length === 0 ? (
        <div className="tarjeta flex flex-col items-center gap-3 p-8 text-center">
          <span className="ficha-icono size-12" aria-hidden>
            <QrCode className="size-6" />
          </span>
          <p className="text-base font-semibold text-tinta">Todavía no hay encuestas</p>
          <p className="medida text-sm text-tinta-suave">
            Crea la primera: eliges si pide los datos de la persona, escribes tus preguntas y el
            sistema te da el QR para imprimir.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {encuestas.datos.map((e, i) => (
            <li
              key={e.id}
              className="entrada"
              style={{ "--retraso": `${i * 40}ms` } as React.CSSProperties}
            >
              <Link
                href={`/encuestas/${e.id}`}
                className="tarjeta transicion-ui flex items-center gap-4 p-[1.125rem] transition-transform active:scale-[0.99]"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-[0.9375rem] font-semibold text-tinta">
                    {e.titulo}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-suave">
                    <Estado vivo={e.activa}>{e.activa ? "Abierta" : "Cerrada"}</Estado>
                    <span>{e.incluye_registro ? "Con registro" : "Sin registro"}</span>
                    <span>
                      {e.resumen?.ultima_respuesta
                        ? `Última hace ${formatDistanceToNowStrict(new Date(e.resumen.ultima_respuesta), { locale: es })}`
                        : "Sin respuestas"}
                    </span>
                  </span>
                </div>
                <span className="flex flex-col items-end">
                  <span className="cifras text-[1.5rem] font-semibold leading-none text-tinta">
                    {(e.resumen?.respuestas ?? 0).toLocaleString("es-MX")}
                  </span>
                  <span className="text-xs text-tinta-tenue">respuestas</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
