/**
 * Piezas que comparten el reporte del día y el de la Brigada informe: las columnas de categorías,
 * la tabla que llega a los bordes de la caja y la tabla por corte.
 */

import type { ReactNode } from "react";
import type { ActividadDelDia, Categorias } from "@/lib/datos/reporte-diario";

export const formato = (n: number) => n.toLocaleString("es-MX");

/** Porcentaje entero de las alcanzadas, para escribirlo junto a cada categoría. */
export function pct(n: number, de: number): string {
  return de > 0 ? `${Math.round((n / de) * 100)}%` : "—";
}

/** Las columnas de categorías que comparten las tablas y el Excel, en el mismo orden. */
export const COLUMNAS_CATEGORIAS: { llave: keyof Categorias; titulo: string; corto: string }[] = [
  { llave: "alcanzadas", titulo: "Alcanzadas", corto: "Alcanzadas" },
  { llave: "nuevas", titulo: "Nuevas", corto: "Nuevas" },
  { llave: "promovidos", titulo: "Promovidos", corto: "Promov." },
  { llave: "quierenInfo", titulo: "Quieren información", corto: "Info" },
  { llave: "quierenParticipar", titulo: "Quieren participar", corto: "Particip." },
  { llave: "representantes", titulo: "Quieren ser representante", corto: "Repres." },
  { llave: "bardaLona", titulo: "Barda o lona", corto: "Barda" },
  { llave: "urgentes", titulo: "Urgente contactar", corto: "Urgentes" },
];

export function seccionesDe(a: ActividadDelDia): string {
  if (a.seccionesAlcanzadas.length > 0) {
    const primeras = a.seccionesAlcanzadas.slice(0, 4).join(", ");
    const resto = a.seccionesAlcanzadas.length - 4;
    return resto > 0 ? `${primeras} y ${resto} más` : primeras;
  }
  return a.seccion ?? "—";
}

/** La tabla llega a los bordes de la caja y se desliza de lado en el teléfono. */
export function TablaDesbordada({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-[1.125rem] -mb-[1.125rem] overflow-x-auto [&_td:first-child]:pl-[1.125rem] [&_td:last-child]:pr-[1.125rem] [&_th:first-child]:pl-[1.125rem] [&_th:last-child]:pr-[1.125rem]">
      {children}
    </div>
  );
}

export function TablaCategorias({
  primera,
  filas,
  compacta = false,
  vacio = "Sin personas alcanzadas este día.",
}: {
  primera: string;
  filas: { llave: string; titulo: string; apoyo: string | null; datos: Categorias }[];
  /** Solo alcanzadas, promovidos, info y urgentes: para la columna angosta. */
  compacta?: boolean;
  vacio?: string;
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-tinta-suave">{vacio}</p>;
  }
  const columnas = compacta
    ? COLUMNAS_CATEGORIAS.filter((c) =>
        ["alcanzadas", "promovidos", "quierenInfo", "urgentes"].includes(c.llave),
      )
    : COLUMNAS_CATEGORIAS;
  return (
    <TablaDesbordada>
      <table className={compacta ? "tabla min-w-[24rem]" : "tabla min-w-[46rem]"}>
        <thead>
          <tr>
            <th>{primera}</th>
            {columnas.map((c) => (
              <th key={c.llave} className="num" title={c.titulo}>
                {c.corto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.llave}>
              <td>
                <span className="cifras text-tinta">{f.titulo}</span>
                {f.apoyo && <span className="block text-xs text-tinta-suave">{f.apoyo}</span>}
              </td>
              {columnas.map((c) => (
                <td
                  key={c.llave}
                  className={
                    c.llave === "alcanzadas" ? "num font-semibold text-tinta" : "num text-tinta-suave"
                  }
                >
                  {f.datos[c.llave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDesbordada>
  );
}

