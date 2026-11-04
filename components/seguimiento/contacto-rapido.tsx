"use client";

import { useState } from "react";
import { MessageCircle, Phone, X } from "lucide-react";
import { crearSeguimiento, type EstadoSeguimiento } from "@/lib/datos/seguimientos";
import { cn } from "@/lib/utils";

/** Por dónde se le buscó. Son los dos tipos de seguimiento que salen de un toque. */
export type MedioContacto = "llamada" | "whatsapp";

export const NOTA_NO_CONTESTO = "No contestó";

/**
 * Los tres resultados de un intento. "No contestó" deja el seguimiento en pendiente, así que la
 * persona sigue en la bandeja con el intento contado; los otros dos la sacan, igual que la hoja.
 */
const RESULTADOS: { clave: string; etiqueta: string; estado: EstadoSeguimiento; nota: string | null }[] =
  [
    { clave: "atendido", etiqueta: "Atendido", estado: "atendido", nota: null },
    { clave: "seguimiento", etiqueta: "En seguimiento", estado: "en_seguimiento", nota: null },
    { clave: "no_contesto", etiqueta: "No contestó", estado: "pendiente", nota: NOTA_NO_CONTESTO },
  ];

/**
 * Estado de un intento de contacto: al tocar WhatsApp o Llamar se abre la aplicación del
 * teléfono y aquí queda esperando el resultado, para registrarlo con un toque al volver. Quién,
 * cuándo y por qué medio ya los sabe el sistema; solo se pregunta cómo le fue.
 */
export function useContactoRapido({
  personaId,
  actuanteId,
  alGuardar,
}: {
  personaId: string;
  actuanteId: string;
  alGuardar: () => void;
}) {
  const [medio, setMedio] = useState<MedioContacto | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function registrar(clave: string) {
    const resultado = RESULTADOS.find((r) => r.clave === clave);
    if (!medio || !resultado) return;
    setGuardando(clave);
    setAviso(null);
    const r = await crearSeguimiento({
      personaId,
      tipo: medio,
      nota: resultado.nota,
      estado: resultado.estado,
      responsableId: actuanteId,
    });
    setGuardando(null);
    if (!r.datos) {
      setAviso(r.aviso ?? "No se pudo guardar el seguimiento.");
      return;
    }
    setMedio(null);
    alGuardar();
  }

  function cancelar() {
    setMedio(null);
    setAviso(null);
  }

  return { medio, abrir: setMedio, cancelar, registrar, guardando, aviso };
}

export type ContactoRapido = ReturnType<typeof useContactoRapido>;

/** WhatsApp y Llamar. Abren la aplicación del teléfono y dejan pendiente el resultado. */
export function BotonesContacto({
  telefono,
  contacto,
  conTexto = false,
}: {
  telefono: string;
  contacto: ContactoRapido;
  /** En la ficha hay lugar para el rótulo; en el renglón de la bandeja van solo los iconos. */
  conTexto?: boolean;
}) {
  return (
    <>
      <a
        href={`https://wa.me/52${telefono}`}
        target="_blank"
        rel="noreferrer"
        onClick={() => contacto.abrir("whatsapp")}
        aria-label={conTexto ? undefined : "WhatsApp"}
        title="WhatsApp"
        className={cn("boton", !conTexto && "px-0 size-11 max-lg:size-12")}
      >
        <MessageCircle className="size-4" aria-hidden />
        {conTexto && "WhatsApp"}
      </a>
      <a
        href={`tel:+52${telefono}`}
        onClick={() => contacto.abrir("llamada")}
        aria-label={conTexto ? undefined : "Llamar"}
        title="Llamar"
        className={cn("boton", !conTexto && "px-0 size-11 max-lg:size-12")}
      >
        <Phone className="size-4" aria-hidden />
        {conTexto && "Llamar"}
      </a>
    </>
  );
}

/**
 * La pregunta que queda al volver de WhatsApp o de la llamada. "Con nota" abre la hoja completa
 * con el medio ya elegido, para cuando hay algo que contar.
 */
export function FranjaResultado({
  contacto,
  alDetallar,
  className,
}: {
  contacto: ContactoRapido;
  alDetallar: (medio: MedioContacto) => void;
  className?: string;
}) {
  const { medio } = contacto;
  if (!medio) return null;

  return (
    <div
      role="group"
      aria-label="Resultado del contacto"
      className={cn(
        "transicion-panel flex flex-wrap items-center gap-2 rounded-control bg-superficie-hundida p-2.5",
        className,
      )}
    >
      <p className="w-full text-sm font-medium text-tinta sm:mr-1 sm:w-auto">
        {medio === "whatsapp" ? "¿Cómo te fue por WhatsApp?" : "¿Cómo te fue con la llamada?"}
      </p>
      {RESULTADOS.map((r) => (
        <button
          key={r.clave}
          type="button"
          onClick={() => contacto.registrar(r.clave)}
          disabled={contacto.guardando !== null}
          className="boton"
        >
          {contacto.guardando === r.clave ? "Guardando…" : r.etiqueta}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          contacto.cancelar();
          alDetallar(medio);
        }}
        disabled={contacto.guardando !== null}
        className="boton"
      >
        Con nota
      </button>
      <button
        type="button"
        onClick={contacto.cancelar}
        aria-label="No registrar este intento"
        title="No registrar este intento"
        className="ml-auto grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:text-tinta"
      >
        <X className="size-4" aria-hidden />
      </button>
      {contacto.aviso && <p className="w-full text-sm text-alerta">{contacto.aviso}</p>}
    </div>
  );
}
