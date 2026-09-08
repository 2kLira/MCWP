"use client";

import { useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { puedeCrear } from "@/lib/permisos";
import { useConsulta } from "@/lib/usar-consulta";
import { bandeja, type FilaBandeja } from "@/lib/datos/seguimientos";
import { RenglonBandeja } from "@/components/seguimiento/renglon-bandeja";
import { HojaSeguimiento } from "@/components/seguimiento/hoja-seguimiento";

export default function Seguimiento() {
  const { actuante } = useActuante();
  const [version, setVersion] = useState(0);
  const [filaAbierta, setFilaAbierta] = useState<FilaBandeja | null>(null);

  const consulta = useConsulta<FilaBandeja[]>(
    () => bandeja(actuante),
    [],
    [actuante.id, version],
  );

  const puedeRegistrar = puedeCrear(actuante, "seguimiento");

  function alGuardar() {
    setFilaAbierta(null);
    setVersion((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl">Seguimiento</h1>
        <p className="cifras text-sm text-tinta-suave">
          {consulta.cargando
            ? "Contando…"
            : `${consulta.datos.length.toLocaleString("es-MX")} personas por atender`}
        </p>
      </header>

      {consulta.cargando ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-24 animate-pulse rounded-tarjeta bg-superficie-hundida" />
          ))}
        </ul>
      ) : consulta.datos.length === 0 ? (
        <div className="hueco-punteado grid min-h-32 place-items-center rounded-tarjeta p-6 text-center text-sm">
          Sin personas pendientes de atender en tu territorio.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {consulta.datos.map((fila) => (
            <li key={fila.persona_id}>
              <RenglonBandeja
                fila={fila}
                puedeRegistrar={puedeRegistrar}
                alRegistrar={() => setFilaAbierta(fila)}
              />
            </li>
          ))}
        </ul>
      )}

      {filaAbierta && (
        <HojaSeguimiento
          fila={filaAbierta}
          actuanteId={actuante.id}
          alCerrar={() => setFilaAbierta(null)}
          alGuardar={alGuardar}
        />
      )}
    </div>
  );
}
