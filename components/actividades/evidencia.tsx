"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, MapPin } from "lucide-react";
import {
  agregarFoto,
  marcarActividadEnCurso,
  type Foto,
  type MomentoFoto,
} from "@/lib/datos/actividades";
import { comprimirFoto } from "@/components/actividades/comprimir";
import { firmarFotos, subirFoto } from "@/lib/datos/almacenamiento";
import { VisorFoto } from "@/components/actividades/visor-foto";

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

    // La subida va por /api/fotos, que valida los bytes y nombra el archivo. El mensaje de
    // rechazo ya viene traducido del servidor.
    const subida = await subirFoto(actividadId, comprimida.archivo, momento);
    if (!subida.ok) {
      setEstado("listo");
      setAviso({ tono: "error", texto: subida.aviso });
      return;
    }
    const ruta = subida.ruta;

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
        className="boton sm:self-start"
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

/**
 * Una línea de evidencia ya subida: la miniatura de la foto, que se toca para verla en grande, su
 * hora y, si la hubo, un enlace a la coordenada. Si la foto no se puede firmar —quien mira ya no
 * alcanza esa actividad, por ejemplo— la línea se queda sin miniatura y el texto sigue igual.
 */
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
  return <LineaConFoto etiqueta={etiqueta} foto={foto} />;
}

function LineaConFoto({ etiqueta, foto }: { etiqueta: string; foto: Foto }) {
  const [firmada, setFirmada] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vivo = true;
    void firmarFotos([foto.url]).then((mapa) => {
      if (vivo) setFirmada(mapa.get(foto.url) ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [foto.url]);

  return (
    <div className="flex items-center gap-3">
      {firmada && (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label={`Ver foto de ${etiqueta.toLowerCase()} en grande`}
          className="transicion-ui size-14 shrink-0 overflow-hidden rounded-control border border-borde transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={firmada} alt="" className="size-full object-cover" />
        </button>
      )}
      {abierta && (
        <VisorFoto
          ruta={foto.url}
          titulo={`Evidencia: ${etiqueta.toLowerCase()}`}
          alCerrar={() => setAbierta(false)}
        />
      )}
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
    </div>
  );
}

/** Una brigada: un brigadista invitado (o quien haya subido evidencia) y sus dos fotos. */
export type Brigada = {
  usuarioId: string;
  nombre: string;
  inicio: Foto | null;
  cierre: Foto | null;
};

/**
 * Arma las brigadas de una actividad. Cada brigadista invitado es una brigada y sube su propia
 * foto de inicio y de cierre (pedido del cliente, 14 de octubre de 2026); la base lo sostiene con
 * el índice único `(actividad_id, subida_por, momento)`.
 *
 * Entran, en este orden: los invitados, en el orden en que llegan; quien subió evidencia sin estar
 * en la lista (el administrador o el responsable); y quien mira, si puede subir y todavía no
 * aparece, para que tenga dónde hacerlo.
 *
 * El nombre sale de la foto, de la invitación o de la sesión. Si ninguno lo trae —RLS sobre
 * `usuarios` solo le deja ver nombres ajenos al administrador—, queda "Brigadista".
 */
export function armarBrigadas(
  evidencia: readonly Foto[],
  invitados: readonly { usuario_id: string; nombre: string }[],
  actuante: { id: string; nombre: string },
  incluirActuante: boolean,
): Brigada[] {
  const porUsuario = new Map<string, Brigada>();
  const asegurar = (usuarioId: string, nombre?: string | null) => {
    const existente = porUsuario.get(usuarioId);
    if (existente) {
      if (nombre && existente.nombre === "Brigadista") existente.nombre = nombre;
      return existente;
    }
    const nueva: Brigada = {
      usuarioId,
      nombre: nombre || (usuarioId === actuante.id ? actuante.nombre : "Brigadista"),
      inicio: null,
      cierre: null,
    };
    porUsuario.set(usuarioId, nueva);
    return nueva;
  };

  for (const invitado of invitados) asegurar(invitado.usuario_id, invitado.nombre);
  for (const foto of evidencia) {
    if (!foto.subida_por || !foto.momento) continue;
    const brigada = asegurar(foto.subida_por, foto.autor?.nombre);
    brigada[foto.momento] = foto;
  }
  if (incluirActuante) asegurar(actuante.id, actuante.nombre);
  return [...porUsuario.values()];
}

/**
 * La tarjeta de evidencia, una sección por brigada: "Brigada 1 · Nombre" con su inicio y su
 * cierre. Los botones de subir solo aparecen en la brigada de quien mira: cada quien documenta lo
 * suyo, y la política `fotos_insert` sella `subida_por` con la sesión de todos modos.
 */
export function EvidenciaPorBrigada({
  brigadas,
  actividadId,
  usuarioId,
  puedeSubir,
  yaArranco,
  alSubir,
}: {
  brigadas: readonly Brigada[];
  actividadId: string;
  usuarioId: string;
  /** Si quien mira puede subir evidencia aquí (espejo de `fotos_insert`). */
  puedeSubir: boolean;
  /** En curso o realizada: a una brigada sin inicio se le marca que le falta. */
  yaArranco: boolean;
  alSubir: () => void;
}) {
  if (brigadas.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        Todavía no hay brigadistas invitados ni evidencia subida.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {brigadas.map((b, i) => {
        const esMia = b.usuarioId === usuarioId;
        return (
          <section
            key={b.usuarioId}
            aria-label={`Brigada ${i + 1}: ${b.nombre}`}
            className="flex flex-col gap-2 border-t border-separador py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <p className="text-sm font-medium text-tinta">
              Brigada <span className="cifras">{i + 1}</span>
              <span className="font-normal text-tinta-suave"> · {b.nombre}</span>
              {esMia && <span className="font-normal text-tinta-tenue"> (tú)</span>}
            </p>
            <LineaEvidencia
              etiqueta="Inicio"
              foto={b.inicio}
              faltaAviso={!b.inicio && yaArranco ? "Le falta la foto de inicio." : undefined}
            />
            {!b.inicio && esMia && puedeSubir && (
              <BotonEvidencia
                actividadId={actividadId}
                momento="inicio"
                usuarioId={usuarioId}
                alSubir={alSubir}
              />
            )}
            <LineaEvidencia etiqueta="Cierre" foto={b.cierre} />
            {!b.cierre && esMia && puedeSubir && (
              <BotonEvidencia
                actividadId={actividadId}
                momento="cierre"
                usuarioId={usuarioId}
                alSubir={alSubir}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
