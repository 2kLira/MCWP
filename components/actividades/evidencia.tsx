"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, MapPin } from "lucide-react";
import { clienteSupabase } from "@/lib/supabase";
import { agregarFoto, type Foto, type MomentoFoto } from "@/lib/datos/actividades";
import { comprimirFoto } from "@/components/actividades/comprimir";

const CUBETA = "fotos";

const ETIQUETA_MOMENTO: Record<MomentoFoto, string> = {
  inicio: "foto de inicio",
  cierre: "foto de evidencia final",
};

/**
 * Coordenada del GPS del dispositivo, con el mismo permiso que ya pide el registro de personas.
 * Si el navegador no lo tiene, no responde o el usuario lo niega, resuelve null: la foto se sube
 * igual, sin coordenada. Nunca bloquea.
 */
function pedirCoordenada(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolver) => {
    if (!navigator.geolocation) {
      resolver(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        resolver({ lat: posicion.coords.latitude, lng: posicion.coords.longitude }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

/**
 * Botón que sube la foto de inicio o de cierre de una actividad. De cada una el sistema guarda
 * solo la hora del reloj, la coordenada del GPS si respondió, y quién la subió: nada de eso se le
 * pregunta a quien captura.
 */
export function BotonEvidencia({
  actividadId,
  momento,
  usuarioId,
  alSubir,
}: {
  actividadId: string;
  momento: MomentoFoto;
  usuarioId: string;
  alSubir: (foto: Foto) => void;
}) {
  const [estado, setEstado] = useState<"listo" | "ubicando" | "subiendo">("listo");
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function elegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setError(null);
    setEstado("ubicando");
    const coordenada = await pedirCoordenada();

    setEstado("subiendo");
    const comprimida = await comprimirFoto(archivo);
    if (!comprimida.ok) {
      setEstado("listo");
      setError(comprimida.error);
      return;
    }

    const supabase = clienteSupabase();
    if (!supabase) {
      setEstado("listo");
      setError("Este despliegue no está conectado a la base de datos.");
      return;
    }

    const ruta = `${actividadId}/${momento}-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
    const { error: errorSubida } = await supabase
      .storage.from(CUBETA)
      .upload(ruta, comprimida.archivo, { contentType: "image/webp" });

    if (errorSubida) {
      setEstado("listo");
      setError(`No se pudo subir la foto: ${errorSubida.message}.`);
      return;
    }

    const { data: publica } = supabase.storage.from(CUBETA).getPublicUrl(ruta);

    const r = await agregarFoto({
      actividadId,
      url: publica.publicUrl,
      subidaPor: usuarioId,
      momento,
      lat: coordenada?.lat ?? null,
      lng: coordenada?.lng ?? null,
    });

    setEstado("listo");
    if (!r.datos) {
      setError(r.aviso ?? "La foto se subió pero no se pudo guardar en la actividad.");
      return;
    }
    if (!coordenada) {
      setError("Se guardó sin coordenada: el GPS no respondió o el permiso se negó.");
    }
    alSubir(r.datos);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={estado !== "listo"}
        onClick={() => entrada.current?.click()}
        className="transicion-ui flex items-center justify-center gap-2 rounded-control border border-borde bg-superficie text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
      >
        {estado === "ubicando" ? (
          <>
            <MapPin className="size-4" aria-hidden />
            Ubicando…
          </>
        ) : estado === "subiendo" ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Comprimiendo y subiendo…
          </>
        ) : (
          <>
            <Camera className="size-4" aria-hidden />
            {`Adjuntar ${ETIQUETA_MOMENTO[momento]}`}
          </>
        )}
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={elegirArchivo}
      />
      {error && <p className="text-xs text-tinta-tenue">{error}</p>}
    </div>
  );
}

/** Enlace para abrir una coordenada en un mapa, sin librerías nuevas: un enlace normal. */
function enlaceMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Hora corta, tomada del reloj al momento de subir (created_at), nunca tecleada. */
function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/** Una línea de evidencia ya subida, con su hora y, si la hubo, un enlace a la coordenada. */
export function LineaEvidencia({
  etiqueta,
  foto,
  faltaAviso,
}: {
  etiqueta: string;
  foto: Foto | null;
  /** Nota discreta cuando falta y ya debería existir, por ejemplo inicio con la actividad en curso. */
  faltaAviso?: string;
}) {
  if (!foto) {
    return (
      <p className="text-sm text-tinta-suave">
        {etiqueta}: sin evidencia todavía.
        {faltaAviso && <span className="ml-1 text-xs text-tinta-tenue">{faltaAviso}</span>}
      </p>
    );
  }
  return (
    <p className="text-sm text-tinta">
      {etiqueta}: <span className="cifras">{horaDe(foto.created_at)}</span>
      {foto.lat != null && foto.lng != null ? (
        <>
          {" · "}
          <a
            href={enlaceMapa(foto.lat, foto.lng)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Ver ubicación
          </a>
        </>
      ) : (
        <span className="text-tinta-tenue"> · sin coordenada</span>
      )}
    </p>
  );
}
