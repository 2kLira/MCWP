import {
  Building2,
  CalendarDays,
  ChartColumn,
  Ellipsis,
  LayoutDashboard,
  ListChecks,
  Map,
  Upload,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import { puedeCrear, puedeImportar, puedeVerUsuarios } from "@/lib/permisos";
import type { UsuarioActuante } from "@/lib/tipos";

export type Destino = {
  href: Route;
  etiqueta: string;
  icono: LucideIcon;
  /** Si falta, el destino se ve siempre. */
  visible?: (usuario: UsuarioActuante) => boolean;
};

/** Lista completa. Es la que se muestra en la barra lateral de escritorio. */
export const DESTINOS: readonly Destino[] = [
  { href: "/", etiqueta: "Tablero", icono: LayoutDashboard },
  { href: "/mapa", etiqueta: "Mapa", icono: Map },
  { href: "/personas", etiqueta: "Personas alcanzadas", icono: Users },
  { href: "/actividades", etiqueta: "Actividades", icono: CalendarDays },
  { href: "/agenda", etiqueta: "Agenda", icono: CalendarDays },
  { href: "/territorio", etiqueta: "Estructura territorial", icono: Building2 },
  { href: "/seguimiento", etiqueta: "Seguimiento", icono: ListChecks },
  { href: "/reportes", etiqueta: "Reportes", icono: ChartColumn },
  {
    href: "/registrar",
    etiqueta: "Registrar persona",
    icono: UserPlus,
    visible: (usuario) => puedeCrear(usuario, "persona"),
  },
  {
    href: "/importar",
    etiqueta: "Carga masiva",
    icono: Upload,
    visible: puedeImportar,
  },
  {
    href: "/usuarios",
    etiqueta: "Usuarios",
    icono: UserCog,
    visible: puedeVerUsuarios,
  },
];

/**
 * Los cinco destinos de la barra inferior de celular. Registrar va al centro, en relleno naranja,
 * y es la única acción naranja de esa barra.
 */
export const DESTINOS_CELULAR: readonly Destino[] = [
  { href: "/", etiqueta: "Tablero", icono: LayoutDashboard },
  { href: "/agenda", etiqueta: "Agenda", icono: CalendarDays },
  { href: "/registrar", etiqueta: "Registrar", icono: UserPlus },
  { href: "/mapa", etiqueta: "Mapa", icono: Map },
  { href: "/mas", etiqueta: "Más", icono: Ellipsis },
];

/** Lo que queda fuera de la barra inferior y se muestra dentro de Más. */
export const DESTINOS_EN_MAS: readonly Destino[] = DESTINOS.filter(
  (d) => !DESTINOS_CELULAR.some((c) => c.href === d.href),
);

export function destinosVisibles(
  destinos: readonly Destino[],
  usuario: UsuarioActuante,
): Destino[] {
  return destinos.filter((d) => !d.visible || d.visible(usuario));
}

/** Un destino está activo si la ruta coincide, o cuelga de él cuando no es la raíz. */
export function estaActivo(href: string, ruta: string): boolean {
  if (href === "/") return ruta === "/";
  return ruta === href || ruta.startsWith(`${href}/`);
}
