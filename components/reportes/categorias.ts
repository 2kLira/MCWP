import {
  Accessibility,
  Bus,
  Construction,
  Droplets,
  Footprints,
  Leaf,
  Lightbulb,
  ShieldCheck,
  Signpost,
  Trash2,
  Trees,
  TriangleAlert,
  Volleyball,
  type LucideIcon,
} from "lucide-react";
import type { CategoriaReporte } from "@/lib/datos/reportes-territorio";

/**
 * Las trece categorías de reporte, en el orden que pidió el cliente, con su icono.
 *
 * El icono es lo que distingue un reporte de otro en el mapa, no el color: el naranja está
 * reservado para la escala del mapa (spec/sistema-diseno.md) y trece colores no se distinguen en un
 * celular al sol. Por eso cada icono es una silueta distinta de las demás, sin dos parecidas: la
 * de parques (varios árboles) y la de arbolado (una hoja) se eligieron para no confundirse.
 *
 * Los valores tienen que coincidir con el check de `reportes_territorio.categoria` en schema.sql.
 */
export const CATEGORIAS_REPORTE: readonly {
  valor: CategoriaReporte;
  etiqueta: string;
  Icono: LucideIcon;
}[] = [
  { valor: "calles_pavimento", etiqueta: "Calles y pavimento", Icono: Construction },
  { valor: "banquetas_accesibilidad", etiqueta: "Banquetas y accesibilidad", Icono: Accessibility },
  { valor: "alumbrado_publico", etiqueta: "Alumbrado público", Icono: Lightbulb },
  { valor: "drenaje", etiqueta: "Drenaje", Icono: Droplets },
  { valor: "basura_limpieza", etiqueta: "Basura y limpieza", Icono: Trash2 },
  {
    valor: "canchas_espacios_deportivos",
    etiqueta: "Canchas y espacios deportivos",
    Icono: Volleyball,
  },
  { valor: "parques_jardines", etiqueta: "Parques y jardines", Icono: Trees },
  { valor: "senderos_seguros", etiqueta: "Senderos seguros", Icono: ShieldCheck },
  { valor: "pasos_peatonales", etiqueta: "Pasos peatonales", Icono: Footprints },
  { valor: "senalizacion_transito", etiqueta: "Señalización y tránsito", Icono: Signpost },
  { valor: "transporte_publico", etiqueta: "Transporte público", Icono: Bus },
  { valor: "arbolado_medio_ambiente", etiqueta: "Arbolado y medio ambiente", Icono: Leaf },
  { valor: "riesgos_via_publica", etiqueta: "Riesgos en la vía pública", Icono: TriangleAlert },
];

export function categoriaReporte(valor: CategoriaReporte) {
  return CATEGORIAS_REPORTE.find((c) => c.valor === valor) ?? CATEGORIAS_REPORTE[0];
}
