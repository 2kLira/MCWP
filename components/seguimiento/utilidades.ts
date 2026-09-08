import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import type { EstadoSeguimiento, TipoSeguimiento } from "@/lib/datos/seguimientos";

export const ETIQUETA_TIPO_SEGUIMIENTO: Record<TipoSeguimiento, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  invitacion: "Invitación",
  reunion: "Reunión",
  otro: "Otro",
};

export const ETIQUETA_ESTADO_SEGUIMIENTO: Record<EstadoSeguimiento, string> = {
  pendiente: "Pendiente",
  en_seguimiento: "En seguimiento",
  atendido: "Atendido",
};

/** "hace 3 días", a partir de la fecha de referencia de espera de la persona. */
export function tiempoSinAtender(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: es });
}
