"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { clienteSupabase } from "@/lib/supabase";
import { agregarFoto, type Foto } from "@/lib/datos/actividades";
import { comprimirFoto } from "@/components/actividades/comprimir";

const CUBETA = "fotos";

export function FotosActividad({
  actividadId,
  fotos,
  cargando,
  puedeSubir,
  usuarioId,
  alSubir,
}: {
  actividadId: string;
  fotos: Foto[];
  cargando: boolean;
  puedeSubir: boolean;
  usuarioId: string;
  alSubir: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function elegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setSubiendo(true);
    setError(null);

    const comprimida = await comprimirFoto(archivo);
    if (!comprimida.ok) {
      setSubiendo(false);
      setError(comprimida.error);
      return;
    }

    try {
      const supabase = clienteSupabase();
      if (!supabase) {
        setSubiendo(false);
        setError("Este despliegue no está conectado a la base de datos.");
        return;
      }

      const ruta = `${actividadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      const { error: errorSubida } = await supabase
        .storage.from(CUBETA)
        .upload(ruta, comprimida.archivo, { contentType: "image/webp" });

      if (errorSubida) {
        setSubiendo(false);
        setError(
          `No se pudo subir la foto: ${errorSubida.message}. Revisa que el bucket "fotos" exista en Supabase Storage.`,
        );
        return;
      }

      const { data: publica } = supabase.storage.from(CUBETA).getPublicUrl(ruta);

      const r = await agregarFoto({
        actividadId,
        url: publica.publicUrl,
        subidaPor: usuarioId,
      });

      if (!r.datos) {
        setError(r.aviso ?? "La foto se subió pero no se pudo guardar en la actividad.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      alSubir();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {cargando ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-tarjeta bg-superficie-hundida" />
          ))}
        </div>
      ) : fotos.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay fotos de esta actividad.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.map((foto) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={foto.id}
              src={foto.url}
              alt=""
              className="aspect-square w-full rounded-tarjeta border border-borde object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {puedeSubir && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={subiendo}
            onClick={() => entrada.current?.click()}
            className="transicion-ui flex items-center justify-center gap-2 rounded-control border border-borde bg-superficie text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
          >
            <Camera className="size-4" aria-hidden />
            {subiendo ? "Comprimiendo y subiendo…" : "Agregar foto"}
          </button>
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={elegirArchivo}
          />
          <p className="text-xs text-tinta-tenue">
            Se comprime en el celular antes de subir: máximo 1600 px de lado y 400 KB.
          </p>
          {error && <p className="text-sm text-alerta">{error}</p>}
        </div>
      )}
    </div>
  );
}
