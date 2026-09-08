"use client";

import { useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { puedeVerUsuarios } from "@/lib/permisos";
import { ETIQUETA_ROL } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import { cambiarActivo, listarUsuarios, type Usuario } from "@/lib/datos/usuarios";
import { cn } from "@/lib/utils";

export default function Usuarios() {
  const { actuante } = useActuante();
  const [version, setVersion] = useState(0);

  const usuarios = useConsulta<Usuario[]>(
    () => listarUsuarios(actuante),
    [],
    [actuante.id, version],
  );

  if (!puedeVerUsuarios(actuante)) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-xl">Usuarios</h1>
        <p className="medida text-sm text-tinta-suave">
          Esta pantalla solo la ve el administrador general. Cambia de rol en el conmutador para
          verla.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl">Usuarios</h1>
        <p className="cifras text-sm text-tinta-suave">
          {usuarios.cargando ? "Cargando…" : `${usuarios.datos.length} usuarios`}
        </p>
      </header>

      <div className="vidrio filo overflow-hidden rounded-tarjeta">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Territorio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.datos.map((u) => (
                <tr key={u.id} className="border-t border-borde">
                  <td className="px-4 py-2 text-tinta">{u.nombre}</td>
                  <td className="px-4 py-2 text-tinta-suave">{ETIQUETA_ROL[u.rol]}</td>
                  <td className="px-4 py-2 text-tinta-suave">
                    {u.seccion_clave ? (
                      <span className="cifras">Sección {u.seccion_clave}</span>
                    ) : (
                      (demarcacionPorId(u.demarcacion_id)?.nombre ?? "Todo el municipio")
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await cambiarActivo(actuante, u.id, !u.activo);
                        setVersion((v) => v + 1);
                      }}
                      className={cn(
                        "pildora transicion-ui transition-colors",
                        !u.activo && "hueco-punteado",
                      )}
                      style={{ minHeight: 32 }}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
