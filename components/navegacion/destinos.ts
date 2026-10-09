import {
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
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
import {
  puedeCrear,
  puedeEncabezarActividad,
  puedeImportar,
  puedeVerListadosGenerales,
  puedeVerUsuarios,
} from "@/lib/puertas-ui";
import type { UsuarioActuante } from "@/lib/tipos";

export type Destino = {
  href: Route;
  etiqueta: string;
  icono: LucideIcon;
  /** Si falta, el destino se ve siempre. */
  visible?: (usuario: UsuarioActuante) => boolean;
};

/**
 * Lista completa. Es la que se muestra en la barra lateral de escritorio.
 *
 * Los siete módulos de vista agregada llevan `puedeVerListadosGenerales`, que es falso para el
 * brigadista: su módulo único es la agenda. Agenda y Registrar persona no llevan ese predicado a
 * propósito, son lo único que le queda. Ver el comentario de esa función en lib/puertas-ui.ts.
 */
export const DESTINOS: readonly Destino[] = [
  { href: "/", etiqueta: "Tablero", icono: LayoutDashboard, visible: puedeVerListadosGenerales },
  { href: "/mapa", etiqueta: "Mapa", icono: Map, visible: puedeVerListadosGenerales },
  {
    href: "/personas",
    etiqueta: "Personas alcanzadas",
    icono: Users,
    visible: puedeVerListadosGenerales,
  },
  {
    href: "/actividades",
    etiqueta: "Actividades",
    icono: ClipboardList,
    visible: puedeVerListadosGenerales,
  },
  { href: "/agenda", etiqueta: "Agenda", icono: CalendarDays },
  {
    href: "/territorio",
    etiqueta: "Estructura territorial",
    icono: Building2,
    visible: puedeVerListadosGenerales,
  },
  {
    href: "/seguimiento",
    etiqueta: "Seguimiento",
    icono: ListChecks,
    visible: puedeVerListadosGenerales,
  },
  {
    href: "/reportes",
    etiqueta: "Reportes",
    icono: ChartColumn,
    visible: puedeVerListadosGenerales,
  },
  {
    href: "/registrar",
    etiqueta: "Registrar persona",
    icono: UserPlus,
    visible: (usuario) => puedeCrear(usuario, "persona"),
  },
  {
    href: "/registrar-representante",
    etiqueta: "Registrar representante",
    icono: ClipboardCheck,
    // Mismo criterio que puedeEditarRepresentantes en lib/datos/casillas.ts: coordinación, no
    // captura suelta. El recorte por casilla concreta ya lo hace esa función al guardar.
    visible: puedeEncabezarActividad,
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
 *
 * Al brigadista le quedan tres: Agenda, Registrar y Más. Registrar **se queda**, y es una
 * decisión, no un descuido:
 *
 * - Capturar es lo único que hace en la calle. Es la acción del sistema, no un módulo: lo que el
 *   cliente mandó esconder son los ocho destinos de consulta, y este botón no consulta nada.
 * - `/registrar` sin actividad ya no es una trampa. Antes llevaba a un formulario que la política
 *   `personas_brigadista_captura` rechazaba al guardar; hoy `components/registro/
 *   elegir-actividad.tsx` le ofrece primero sus actividades abiertas, y si no tiene ninguna se lo
 *   dice de entrada. Así que el botón nunca es un callejón.
 * - Quitarlo costaría tres toques —agenda, actividad, registrar— en la pantalla donde más prisa
 *   hay, con el celular en una mano.
 *
 * Más también se queda: en celular es donde vive la cápsula de sesión, y es la única forma de
 * cerrar sesión. La pantalla se adapta a que su lista quede vacía (ver app/(aplicacion)/mas).
 */
export const DESTINOS_CELULAR: readonly Destino[] = [
  { href: "/", etiqueta: "Tablero", icono: LayoutDashboard, visible: puedeVerListadosGenerales },
  { href: "/agenda", etiqueta: "Agenda", icono: CalendarDays },
  {
    href: "/registrar",
    etiqueta: "Registrar",
    icono: UserPlus,
    visible: (usuario) => puedeCrear(usuario, "persona"),
  },
  { href: "/mapa", etiqueta: "Mapa", icono: Map, visible: puedeVerListadosGenerales },
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
