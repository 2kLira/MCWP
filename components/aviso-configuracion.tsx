"use client";

import { TriangleAlert } from "lucide-react";
import { faltaConfiguracion } from "@/lib/supabase";

/**
 * Aviso para el caso en que la aplicación se despliega sin las variables de Supabase. Las
 * variables NEXT_PUBLIC se incrustan al compilar, así que guardarlas en el panel no basta: hay
 * que volver a desplegar. Eso es justo lo que cuesta media hora averiguar, así que se dice aquí.
 */
export function AvisoConfiguracion() {
  if (!faltaConfiguracion()) return null;

  return (
    <div
      role="status"
      className="vidrio filo mx-auto mb-4 flex max-w-tope items-start gap-3 rounded-tarjeta p-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta" aria-hidden />
      <p className="medida text-sm text-tinta-suave">
        <span className="font-medium text-tinta">
          Este despliegue no está conectado a la base de datos.
        </span>{" "}
        Faltan <span className="cifras">NEXT_PUBLIC_SUPABASE_URL</span> y{" "}
        <span className="cifras">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> en las variables de entorno
        del proyecto. Se incrustan al compilar, así que después de guardarlas hay que volver a
        desplegar.
      </p>
    </div>
  );
}
