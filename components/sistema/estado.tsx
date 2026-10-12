import { cn } from "@/lib/utils";

/**
 * Estatus con punto. Neutro por defecto; `vivo` lo pinta de naranja y se reserva para el único
 * estado que pide atención en esa lista (en curso, promovido, sin atender).
 */
export function Estado({
  vivo = false,
  children,
  className,
}: {
  vivo?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("estado", vivo && "estado-vivo", className)}>{children}</span>;
}
