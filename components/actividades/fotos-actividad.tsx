"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { agregarFoto, type Foto } from "@/lib/datos/actividades";
import { comprimirFoto } from "@/components/actividades/comprimir";
import { firmarFotos, subirFoto } from "@/lib/datos/almacenamiento";
import { VisorFoto } from "@/components/actividades/visor-foto";


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
  const [abierta, setAbierta] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  /**
   * El bucket es privado, así que cada imagen se firma para mostrarla. `fotos[].url` guarda la
   * ruta, no una URL. Se firma en lote: un viaje para toda la galería.
   */
  const [firmadas, setFirmadas] = useState<Map<string, string>>(new Map());
  const rutas = fotos.map((f) => f.url).join("|");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const mapa = await firmarFotos(fotos.map((f) => f.url));
      if (vivo) setFirmadas(mapa);
    })();
    return () => {
      vivo = false;
    };
    // Se depende de la lista de rutas, no del arreglo: `fotos` es una referencia nueva en cada
    // render del padre y volvería a firmar sin que haya cambiado ninguna foto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas]);

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
      const subida = await subirFoto(actividadId, comprimida.archivo, "galeria");
      if (!subida.ok) {
        setSubiendo(false);
        setError(subida.aviso);
        return;
      }
      const ruta = subida.ruta;

      // Se guarda la ruta, no una URL: el bucket es privado y las firmas caducan.
      const r = await agregarFoto({
        actividadId,
        url: ruta,
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
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-control bg-superficie-hundida" />
          ))}
        </div>
      ) : fotos.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay fotos de esta actividad.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-6">
          {fotos.map((foto) => {
            const firmada = firmadas.get(foto.url);
            // Mientras se firma —y si una foto concreta no se pudo firmar— se queda el mismo
            // esqueleto que ya usa el estado de carga, en lugar de una imagen rota.
            // Se toca para verla en grande, sin salir de la actividad.
            return firmada ? (
              <button
                key={foto.id}
                type="button"
                onClick={() => setAbierta(foto.url)}
                aria-label="Ver foto en grande"
                className="transicion-ui overflow-hidden rounded-control border border-borde transition-opacity hover:opacity-90"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={firmada}
                  alt=""
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <div
                key={foto.id}
                className="aspect-square animate-pulse rounded-control bg-superficie-hundida"
              />
            );
          })}
        </div>
      )}

      {abierta && (
        <VisorFoto ruta={abierta} titulo="Foto de la actividad" alCerrar={() => setAbierta(null)} />
      )}

      {puedeSubir && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={subiendo}
            onClick={() => entrada.current?.click()}
            className="boton sm:self-start"
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
