"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, MapPin } from "lucide-react";
import { clienteSupabase } from "@/lib/supabase";
import {
  agregarFoto,
  marcarActividadEnCurso,
  type Foto,
  type MomentoFoto,
} from "@/lib/datos/actividades";
import { comprimirFoto } from "@/components/actividades/comprimir";
import { avisoDeAlmacenamiento, CUBETA_FOTOS, rutaDeFoto } from "@/lib/datos/almacenamiento";


const ETIQUETA_MOMENTO: Record<MomentoFoto, string> = {
  inicio: "foto de inicio",
  cierre: "foto de evidencia final",
};

/**
 * Lo que se pinta debajo del botón. Son dos cosas que antes compartían el mismo gris tenue y se
 * confundían: `nota` es informativa y la foto sí quedó guardada (por ejemplo, sin coordenada);
 * `error` es que no quedó.
 */
type Aviso = { tono: "error" | "nota"; texto: string };

/**
 * Traducción del rechazo del almacenamiento.
 *
 * Esto **no** duplica `resultado()` de lib/datos/cliente.ts. Esa traduce lo que contesta
 * PostgREST, y por ahí ya viaja el renglón de la tabla `fotos` a través de `agregarFoto`, que
 * pasa su propio contexto. Pero la subida del archivo ocurre antes y la contesta Storage, que no
 * es un PostgrestError y por lo mismo nunca entra a esa traducción: sin esto, un rechazo de
 * `almacen_fotos_insert` le aparecía al brigadista en inglés y hablando de políticas.
 *
 * Lo desconocido no se tapa, misma regla que en cliente.ts: si no se reconoce, se muestra el
 * mensaje original.
 */
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
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function elegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setAviso(null);
    setEstado("ubicando");
    const coordenada = await pedirCoordenada();

    setEstado("subiendo");
    const comprimida = await comprimirFoto(archivo);
    if (!comprimida.ok) {
      setEstado("listo");
      setAviso({ tono: "error", texto: comprimida.error });
      return;
    }

    const supabase = clienteSupabase();
    if (!supabase) {
      setEstado("listo");
      setAviso({ tono: "error", texto: "Este despliegue no está conectado a la base de datos." });
      return;
    }

    // El prefijo "actividades/" lo exigen las políticas de storage.objects: leen el segundo
    // segmento de la ruta como el id de la actividad.
    const ruta = rutaDeFoto(actividadId, momento);
    const { error: errorSubida } = await supabase
      .storage.from(CUBETA_FOTOS)
      .upload(ruta, comprimida.archivo, { contentType: "image/webp" });

    if (errorSubida) {
      setEstado("listo");
      setAviso({ tono: "error", texto: avisoDeAlmacenamiento(errorSubida.message) });
      // El detalle crudo va a la consola, igual que hace `resultado()`: en pantalla va qué hacer.
      console.warn(errorSubida);
      return;
    }

    // Se guarda la RUTA, no una URL. El bucket es privado y una URL firmada caduca: persistirla
    // haría que la columna se pudriera sola.
    const r = await agregarFoto({
      actividadId,
      url: ruta,
      subidaPor: usuarioId,
      momento,
      lat: coordenada?.lat ?? null,
      lng: coordenada?.lng ?? null,
    });

    setEstado("listo");
    if (!r.datos) {
      // Aquí ya no se traduce nada: `agregarFoto` pasó por `resultado()` con el contexto
      // "No puedes subir fotos a esta actividad.", así que `r.aviso` ya viene en español.
      setAviso({
        tono: "error",
        texto: r.aviso ?? "La foto se subió pero no se pudo guardar en la actividad.",
      });
      return;
    }
    if (!coordenada) {
      setAviso({
        tono: "nota",
        texto: "Se guardó sin coordenada: el GPS no respondió o el permiso se negó.",
      });
    }
    // Subir la evidencia de inicio es el gesto que marca que la actividad arrancó, así que se
    // hace aquí y no en una pantalla: vale igual desde la tarjeta del brigadista que desde el
    // flujo del responsable. Si devuelve falso —ya estaba en curso, o quien sube no está
    // invitado— no se dice nada: no es un error, es que no había nada que mover.
    if (momento === "inicio") {
      await marcarActividadEnCurso(actividadId);
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
      {aviso && (
        <p className={aviso.tono === "error" ? "text-xs text-alerta" : "text-xs text-tinta-tenue"}>
          {aviso.texto}
        </p>
      )}
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
