"use client";

import { useEffect, useState } from "react";
import { CircleCheck, MapPin, MapPinOff } from "lucide-react";
import { Campo } from "@/components/campo";
import { CATEGORIAS_REPORTE } from "@/components/reportes/categorias";
import { levantarReporte, type CategoriaReporte } from "@/lib/datos/reportes-territorio";
import { cn } from "@/lib/utils";

/**
 * Levantar un reporte del territorio. Al brigadista se le piden dos cosas: categoría y
 * descripción. La ubicación sale del GPS y el nombre y la hora los pone la base.
 *
 * La ubicación se pide dos veces a propósito:
 *  - Al abrir, para que el permiso del navegador salga de una vez y el brigadista vea si su
 *    teléfono está dando ubicación antes de escribir nada.
 *  - Al guardar, otra vez y fresca, porque entre abrir y guardar pudo haber caminado una cuadra.
 *    Si en ese momento falla, no se guarda: un reporte sin punto no aparece en el mapa, que es su
 *    única razón de existir.
 */

type Ubicacion =
  | { estado: "buscando" }
  | { estado: "lista"; lat: number; lng: number; precision: number | null }
  | { estado: "error"; mensaje: string };

const AYUDA_PERMISO =
  "Activa la ubicación del teléfono y permite que el navegador la use. En iPhone: Ajustes › " +
  "Privacidad y seguridad › Localización › Safari › Al usar la app. Luego vuelve a intentarlo.";

function mensajeDeError(error: GeolocationPositionError | null): string {
  if (!error) return `Este dispositivo no comparte ubicación. ${AYUDA_PERMISO}`;
  if (error.code === error.PERMISSION_DENIED) {
    return `No hay permiso para usar tu ubicación. ${AYUDA_PERMISO}`;
  }
  if (error.code === error.TIMEOUT) {
    return "La ubicación tardó demasiado. Si estás bajo techo, sal a un lugar abierto y vuelve a intentarlo.";
  }
  return `No se pudo obtener tu ubicación. ${AYUDA_PERMISO}`;
}

function pedirUbicacion(): Promise<Ubicacion> {
  return new Promise((resolver) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolver({ estado: "error", mensaje: mensajeDeError(null) });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        resolver({
          estado: "lista",
          lat: posicion.coords.latitude,
          lng: posicion.coords.longitude,
          precision: Number.isFinite(posicion.coords.accuracy)
            ? Math.round(posicion.coords.accuracy)
            : null,
        }),
      (error) => resolver({ estado: "error", mensaje: mensajeDeError(error) }),
      // maximumAge corto: sirve una lectura de hace unos segundos, no la de hace diez minutos.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 20_000 },
    );
  });
}

export function FormularioReporte() {
  const [categoria, setCategoria] = useState<CategoriaReporte | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [ubicacion, setUbicacion] = useState<Ubicacion>({ estado: "buscando" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let vigente = true;
    void pedirUbicacion().then((u) => {
      if (vigente) setUbicacion(u);
    });
    return () => {
      vigente = false;
    };
  }, []);

  async function reintentarUbicacion() {
    setUbicacion({ estado: "buscando" });
    setUbicacion(await pedirUbicacion());
  }

  const faltan = [
    !categoria && "la categoría",
    descripcion.trim().length < 3 && "la descripción",
  ].filter(Boolean) as string[];

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando || !categoria || faltan.length > 0) return;
    setGuardando(true);
    setError(null);

    const fresca = await pedirUbicacion();
    setUbicacion(fresca);
    if (fresca.estado !== "lista") {
      setGuardando(false);
      setError(
        fresca.estado === "error"
          ? `No se guardó: falta la ubicación. ${fresca.mensaje}`
          : "No se guardó: falta la ubicación.",
      );
      return;
    }

    const r = await levantarReporte({
      categoria,
      descripcion: descripcion.trim(),
      lat: fresca.lat,
      lng: fresca.lng,
      precision_m: fresca.precision,
    });
    setGuardando(false);
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo guardar el reporte. Intenta de nuevo.");
      return;
    }
    setGuardado(true);
  }

  function otro() {
    setCategoria(null);
    setDescripcion("");
    setError(null);
    setGuardado(false);
    void reintentarUbicacion();
  }

  if (guardado) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="flex items-center gap-2 text-base font-medium text-tinta">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          Reporte guardado
        </p>
        <p className="medida text-sm text-tinta-suave">
          Quedó en el mapa del equipo con tu nombre, la fecha y la hora.
        </p>
        <button
          type="button"
          onClick={otro}
          className="transicion-ui w-full rounded-control bg-naranja px-4 text-base font-medium text-sobre-naranja toque-actividad sm:w-auto"
        >
          Levantar otro reporte
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-tinta-suave">Categoría</legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {CATEGORIAS_REPORTE.map(({ valor, etiqueta, Icono }) => {
            const elegida = categoria === valor;
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={elegida}
                onClick={() => setCategoria(valor)}
                className={cn(
                  "transicion-ui flex min-h-14 items-center gap-2.5 rounded-control border px-3 py-2 text-left text-sm transition-colors",
                  elegida
                    ? "border-tinta bg-tinta text-fondo"
                    : "border-borde bg-superficie text-tinta hover:bg-superficie-hundida",
                )}
              >
                <Icono className="size-5 shrink-0" aria-hidden />
                <span className="leading-tight">{etiqueta}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Campo etiqueta="Descripción">
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={4}
          maxLength={2000}
          required
          placeholder="Qué pasa y dónde exactamente. Ej.: hay un bache grande frente a la tienda de la esquina."
          className="campo min-h-28 resize-y py-2"
        />
      </Campo>

      <EstadoUbicacion ubicacion={ubicacion} alReintentar={reintentarUbicacion} />

      {error && (
        <p role="alert" className="text-sm text-alerta">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="submit"
          disabled={guardando || faltan.length > 0}
          className="transicion-ui rounded-control bg-naranja px-4 text-base font-medium text-sobre-naranja toque-actividad disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar reporte"}
        </button>
        {faltan.length > 0 && (
          <p className="text-xs text-tinta-tenue">Falta {faltan.join(" y ")}.</p>
        )}
      </div>
    </form>
  );
}

function EstadoUbicacion({
  ubicacion,
  alReintentar,
}: {
  ubicacion: Ubicacion;
  alReintentar: () => void;
}) {
  if (ubicacion.estado === "buscando") {
    return (
      <p className="flex items-center gap-2 text-sm text-tinta-suave">
        <MapPin className="size-4 shrink-0 animate-pulse" aria-hidden />
        Obteniendo tu ubicación…
      </p>
    );
  }
  if (ubicacion.estado === "lista") {
    return (
      <p className="flex items-center gap-2 text-sm text-tinta-suave">
        <MapPin className="size-4 shrink-0" aria-hidden />
        Ubicación lista
        {ubicacion.precision != null && (
          <span className="cifras text-tinta-tenue">(±{ubicacion.precision} m)</span>
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-control border border-alerta/40 bg-alerta/10 p-3">
      <p className="flex items-start gap-2 text-sm text-alerta">
        <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        {ubicacion.mensaje}
      </p>
      <button
        type="button"
        onClick={alReintentar}
        className="transicion-ui self-start rounded-control border border-borde bg-superficie px-4 text-sm font-medium text-tinta toque-actividad hover:bg-superficie-hundida"
      >
        Volver a intentar
      </button>
    </div>
  );
}
