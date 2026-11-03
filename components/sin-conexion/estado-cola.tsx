"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, TriangleAlert, UploadCloud } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import {
  alCambiarLaCola,
  descartar,
  enviarPendientes,
  listarCola,
  reintentar,
  type Pendiente,
} from "@/lib/sin-conexion/cola";

/** Con señal y capturas esperando, cada cuánto se vuelve a intentar sin que nadie toque nada. */
const REINTENTO_MS = 60_000;

/**
 * Lo que está en el teléfono y no en la base, y el motor que lo manda.
 *
 * Va arriba de toda pantalla de la cáscara porque el envío ocurre con la app abierta, en la
 * pantalla que sea (ver lib/sin-conexion/cola.ts): no puede depender de que alguien vuelva al
 * formulario. Manda al montar, al volver la señal, al regresar a la app y cada minuto mientras
 * quede algo.
 *
 * Sin capturas pendientes y con señal no pinta nada.
 */
export function EstadoCola() {
  const { actuante } = useActuante();
  const [cola, setCola] = useState<Pendiente[]>([]);
  // El proveedor de identidad no monta esto en el servidor, así que navigator ya existe.
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  const [enviando, setEnviando] = useState(false);
  const [porDescartar, setPorDescartar] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const leer = () => {
      listarCola(actuante.id)
        .then((c) => vigente && setCola(c))
        .catch((e) => console.error(e));
    };
    leer();
    const quitar = alCambiarLaCola(leer);
    return () => {
      vigente = false;
      quitar();
    };
  }, [actuante.id]);

  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);
    window.addEventListener("online", conectado);
    window.addEventListener("offline", desconectado);
    return () => {
      window.removeEventListener("online", conectado);
      window.removeEventListener("offline", desconectado);
    };
  }, []);

  const enviar = useCallback(async () => {
    setEnviando(true);
    try {
      await enviarPendientes(actuante.id);
    } catch (e) {
      console.error(e);
    } finally {
      setEnviando(false);
    }
  }, [actuante.id]);

  const pendientes = cola.filter((p) => p.estado === "pendiente");
  const hayPendientes = pendientes.length > 0;

  useEffect(() => {
    if (!enLinea || !hayPendientes) return;
    // Fuera del cuerpo del efecto: enviar() cambia estado al arrancar.
    const inmediato = setTimeout(() => void enviar(), 0);
    const periodico = setInterval(() => void enviar(), REINTENTO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void enviar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearTimeout(inmediato);
      clearInterval(periodico);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [enLinea, hayPendientes, enviar]);

  const rechazadas = cola.filter((p) => p.estado === "rechazada");
  const conAvisos = cola.filter((p) => p.estado === "con_avisos");
  // Un motivo en una pendiente solo puede ser la sesión vencida (ver cola.ts).
  const motivoPendiente = pendientes.find((p) => p.motivo)?.motivo ?? null;

  if (enLinea && cola.length === 0) return null;

  return (
    <div className="mb-4 flex max-w-[47.5rem] flex-col gap-2">
      {(!enLinea || hayPendientes) && (
        <div role="status" className="tarjeta flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5">
          {enLinea ? (
            <UploadCloud className="size-4 shrink-0 text-tinta-suave" aria-hidden />
          ) : (
            <CloudOff className="size-4 shrink-0 text-tinta-suave" aria-hidden />
          )}
          <p className="min-w-0 flex-1 text-sm text-tinta-suave">
            {!enLinea && (
              <span className="font-medium text-tinta">Sin señal. </span>
            )}
            {hayPendientes ? (
              <>
                <span className="cifras font-medium text-tinta">
                  {pendientes.length === 1
                    ? "1 captura por enviar"
                    : `${pendientes.length} capturas por enviar`}
                </span>
                {!enLinea && ". Se envían solas al volver la señal, con la app abierta."}
              </>
            ) : (
              "Lo que registres se guarda en este teléfono y se envía al volver la señal."
            )}
            {motivoPendiente && <span className="block text-alerta">{motivoPendiente}</span>}
          </p>
          {enLinea && hayPendientes && (
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando}
              className="boton min-h-11 shrink-0"
            >
              {enviando ? <span className="estado estado-vivo">Enviando</span> : "Enviar ahora"}
            </button>
          )}
        </div>
      )}

      {rechazadas.map((p) => (
        <div key={p.id} role="alert" className="tarjeta flex flex-col gap-2.5 p-3.5">
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium text-tinta">
                No se pudo enviar: {p.titulo || "captura"}
                {p.detalle && <span className="cifras font-normal text-tinta-suave"> · {p.detalle}</span>}
              </span>
              <span className="block text-tinta-suave">{p.motivo}</span>
            </span>
          </p>
          {porDescartar === p.id ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-sm text-tinta-suave sm:flex-1">
                Se borra de este teléfono y no llega a la base. No se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPorDescartar(null)} className="boton min-h-11 flex-1">
                  Conservar
                </button>
                <button
                  type="button"
                  onClick={() => void descartar(p.id).then(() => setPorDescartar(null))}
                  className="boton min-h-11 flex-1 text-alerta"
                >
                  Borrarla
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void reintentar(p.id)}
                className="boton min-h-11 flex-1 sm:flex-none"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => setPorDescartar(p.id)}
                className="boton min-h-11 flex-1 sm:flex-none"
              >
                Descartar
              </button>
            </div>
          )}
        </div>
      ))}

      {conAvisos.map((p) => (
        <div key={p.id} role="status" className="tarjeta flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm">
            <span className="block font-medium text-tinta">
              Enviada: {p.titulo || "captura"}
              {p.detalle && <span className="cifras font-normal text-tinta-suave"> · {p.detalle}</span>}
            </span>
            <span className="block text-alerta">{p.motivo}</span>
          </p>
          {/* Ya está en la base: quitarla del teléfono no pierde nada. */}
          <button type="button" onClick={() => void descartar(p.id)} className="boton min-h-11 shrink-0">
            Entendido
          </button>
        </div>
      ))}
    </div>
  );
}
