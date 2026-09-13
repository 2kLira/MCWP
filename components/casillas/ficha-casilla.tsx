"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { leerDuracionMs, prefiereMenosMovimiento } from "@/components/mapa/tokens";
import type { UsuarioActuante } from "@/lib/tipos";
import { formatearTelefono, rasgoPorClave, validarTelefonoMexicano } from "@/lib/territorio";
import { coincidenciasPorNombre, type PersonaEnLista } from "@/lib/datos/personas";
import {
  guardarRepresentante,
  puedeEditarRepresentantes,
  representanteCubierto,
  type CargoRepresentante,
  type CasillaConRepresentantes,
  type EstadoAcreditacion,
  type EstadoCapacitacion,
  type EstadoManual,
  type RepresentanteCasilla,
} from "@/lib/datos/casillas";
import { cn } from "@/lib/utils";

const ETIQUETA_TIPO_CASILLA: Record<string, string> = {
  BASICA: "Básica",
  CONTIGUA: "Contigua",
};

/** Fila clave/valor de la ficha, igual que en components/mapa/ficha-seccion.tsx. */
function Renglon({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="cifras text-sm font-medium text-tinta">{valor}</dd>
    </div>
  );
}

/** Segmento de dos opciones, para que capacitación, manual y acreditación se lean de un golpe. */
function SegmentoDosOpciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  disabled,
}: {
  etiqueta: string;
  opciones: ParDeOpciones<T>;
  valor: T;
  onCambiar: (valor: T) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-tinta-suave">{etiqueta}</p>
      <div className="grid grid-cols-2 gap-1 rounded-control border border-borde bg-superficie-hundida p-1">
        {opciones.map((o) => {
          const activa = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              disabled={disabled}
              onClick={() => onCambiar(o.valor)}
              aria-pressed={activa}
              className={cn(
                "transicion-ui min-h-9 rounded-control px-2 text-xs font-medium",
                activa ? "bg-tinta text-fondo" : "text-tinta-suave hover:text-tinta",
                disabled && "opacity-60",
              )}
            >
              {o.texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ParDeOpciones<T extends string> = readonly [
  { valor: T; texto: string },
  { valor: T; texto: string },
];

const OPCIONES_CAPACITACION: ParDeOpciones<EstadoCapacitacion> = [
  { valor: "capacitado", texto: "Capacitado" },
  { valor: "por_capacitar", texto: "Por capacitar" },
];
const OPCIONES_MANUAL: ParDeOpciones<EstadoManual> = [
  { valor: "entregado", texto: "Manual entregado" },
  { valor: "pendiente", texto: "Manual pendiente" },
];
const OPCIONES_ACREDITACION: ParDeOpciones<EstadoAcreditacion> = [
  { valor: "acreditado", texto: "Acreditado" },
  { valor: "pendiente", texto: "Acreditación pendiente" },
];

const ETIQUETA_CARGO: Record<CargoRepresentante, string> = {
  titular: "Titular",
  suplente: "Suplente",
};

/**
 * Etiqueta de un sub-estado dentro del resumen: relleno sólido cuando ya está listo, hueco
 * punteado cuando falta. Nunca alerta: que falte manual o acreditación es trabajo pendiente,
 * no un error.
 */
function Estadito({ texto, listo }: { texto: string; listo: boolean }) {
  return (
    <span
      className={cn(
        "rounded-pildora px-2 py-0.5 text-xs font-medium",
        listo ? "bg-tinta text-fondo" : "hueco-punteado",
      )}
    >
      {texto}
    </span>
  );
}

/**
 * El renglón de un cargo en el resumen de cobertura: lo primero que se ve al abrir la ficha,
 * antes de cualquier campo editable. Un aro relleno dice "aquí hay alguien", un aro hueco dice
 * "todavía no": mismo lenguaje que el punto en el mapa, nunca color de alerta porque un lugar
 * vacío es trabajo pendiente, no un error. Si está cubierto, debajo se leen de un golpe sus tres
 * estados: alguien cubierto y sin acreditar no es lo mismo que alguien listo.
 */
function RenglonCobertura({
  cargo,
  representante,
}: {
  cargo: CargoRepresentante;
  representante: RepresentanteCasilla | null;
}) {
  const cubierto = representanteCubierto(representante);
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          cubierto ? "bg-tinta text-fondo" : "hueco-punteado",
        )}
      >
        {cubierto && <Check className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-tinta-suave">{ETIQUETA_CARGO[cargo]}</p>
        <p
          className={cn(
            "truncate text-sm font-semibold",
            cubierto ? "text-tinta" : "text-tinta-suave",
          )}
        >
          {cubierto ? representante!.nombre : "Sin registrar"}
        </p>
        {cubierto && representante && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Estadito
              listo={representante.capacitacion === "capacitado"}
              texto={
                OPCIONES_CAPACITACION.find((o) => o.valor === representante.capacitacion)!.texto
              }
            />
            <Estadito
              listo={representante.manual === "entregado"}
              texto={OPCIONES_MANUAL.find((o) => o.valor === representante.manual)!.texto}
            />
            <Estadito
              listo={representante.acreditacion === "acreditado"}
              texto={
                OPCIONES_ACREDITACION.find((o) => o.valor === representante.acreditacion)!.texto
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BloqueRepresentante({
  actuante,
  casillaId,
  seccionClave,
  cargo,
  representante,
  editable,
  onGuardado,
}: {
  actuante: UsuarioActuante | null;
  casillaId: number;
  seccionClave: string;
  cargo: CargoRepresentante;
  representante: RepresentanteCasilla | null;
  editable: boolean;
  onGuardado: (representante: RepresentanteCasilla) => void;
}) {
  const [nombre, setNombre] = useState(representante?.nombre ?? "");
  const [personaId, setPersonaId] = useState<string | null>(representante?.persona_id ?? null);
  const [telefono, setTelefono] = useState(formatearTelefono(representante?.telefono_norm));
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [capacitacion, setCapacitacion] = useState<EstadoCapacitacion>(
    representante?.capacitacion ?? "por_capacitar",
  );
  const [manual, setManual] = useState<EstadoManual>(representante?.manual ?? "pendiente");
  const [acreditacion, setAcreditacion] = useState<EstadoAcreditacion>(
    representante?.acreditacion ?? "pendiente",
  );

  const [resultados, setResultados] = useState<PersonaEnLista[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardadoHacePoco, setGuardadoHacePoco] = useState(false);

  // Buscador de personas ya registradas: mismo patrón (con retardo) que el promotor del registro
  // rápido. Se apaga en cuanto ya hay una persona elegida, para no seguir sugiriendo.
  useEffect(() => {
    if (personaId) {
      setResultados([]);
      return;
    }
    const consulta = nombre.trim();
    if (consulta.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const temporizador = setTimeout(() => {
      coincidenciasPorNombre(consulta, seccionClave).then((r) => {
        if (!vigente) return;
        setResultados(r.datos);
        setBuscando(false);
      });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [nombre, personaId, seccionClave]);

  function alElegirPersona(persona: PersonaEnLista) {
    setNombre(persona.nombre);
    setPersonaId(persona.id);
    if (persona.telefono_norm) setTelefono(formatearTelefono(persona.telefono_norm));
    setResultados([]);
    setMostrarResultados(false);
  }

  function alCambiarTelefono(valor: string) {
    setTelefono(valor);
    if (!valor.trim()) {
      setErrorTelefono(null);
      return;
    }
    const r = validarTelefonoMexicano(valor);
    setErrorTelefono(r.valido ? null : r.motivo);
  }

  const nombreValido = nombre.trim() !== "";
  const telefonoValido = validarTelefonoMexicano(telefono).valido;
  const puedeGuardar = editable && nombreValido && telefonoValido && !guardando;

  async function alGuardar() {
    setGuardando(true);
    setAviso(null);
    const r = await guardarRepresentante(
      actuante,
      { seccion_clave: seccionClave },
      {
        casillaId,
        cargo,
        nombre,
        telefonoRaw: telefono,
        personaId,
        capacitacion,
        manual,
        acreditacion,
      },
    );
    setGuardando(false);
    if (r.datos) {
      onGuardado(r.datos);
      setGuardadoHacePoco(true);
      window.setTimeout(() => setGuardadoHacePoco(false), 2000);
    } else {
      setAviso(r.aviso ?? "No se pudo guardar.");
    }
  }

  return (
    <div className="rounded-tarjeta border border-borde bg-superficie p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-tinta">{ETIQUETA_CARGO[cargo]}</p>
        {!representanteCubierto(representante) && (
          <span className="hueco-punteado rounded-pildora px-2 py-0.5 text-xs">
            Sin registrar
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <label className="mb-1 block text-xs text-tinta-suave" htmlFor={`nombre-${cargo}`}>
            Nombre
          </label>
          <input
            id={`nombre-${cargo}`}
            value={nombre}
            disabled={!editable}
            autoComplete="off"
            onChange={(e) => {
              setNombre(e.target.value);
              setPersonaId(null);
              setMostrarResultados(true);
            }}
            onFocus={() => setMostrarResultados(true)}
            onBlur={() => window.setTimeout(() => setMostrarResultados(false), 150)}
            placeholder="Nombre completo, o elige de la lista"
            className="campo"
          />
          {editable && mostrarResultados && !personaId && (buscando || resultados.length > 0) && (
            <ul className="vidrio-denso absolute inset-x-0 top-full z-10 mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-control p-1.5">
              {buscando && <li className="px-2 py-1.5 text-xs text-tinta-tenue">Buscando…</li>}
              {!buscando &&
                resultados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => alElegirPersona(p)}
                      className="transicion-ui w-full rounded-control px-2.5 py-1.5 text-left text-sm text-tinta hover:bg-superficie-hundida"
                    >
                      {p.nombre}
                      {p.telefono_norm && (
                        <span className="ml-2 text-xs text-tinta-suave">
                          {formatearTelefono(p.telefono_norm)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {personaId && (
            <p className="mt-1 text-xs text-tinta-suave">Persona ya registrada en el sistema.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-tinta-suave" htmlFor={`tel-${cargo}`}>
            Teléfono
          </label>
          <input
            id={`tel-${cargo}`}
            value={telefono}
            disabled={!editable}
            inputMode="tel"
            onChange={(e) => alCambiarTelefono(e.target.value)}
            placeholder="951 100 0000"
            className="campo"
          />
          {errorTelefono && <p className="mt-1 text-xs text-alerta">{errorTelefono}</p>}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SegmentoDosOpciones
            etiqueta="Capacitación"
            opciones={OPCIONES_CAPACITACION}
            valor={capacitacion}
            onCambiar={setCapacitacion}
            disabled={!editable}
          />
          <SegmentoDosOpciones
            etiqueta="Manual"
            opciones={OPCIONES_MANUAL}
            valor={manual}
            onCambiar={setManual}
            disabled={!editable}
          />
          <SegmentoDosOpciones
            etiqueta="Acreditación"
            opciones={OPCIONES_ACREDITACION}
            valor={acreditacion}
            onCambiar={setAcreditacion}
            disabled={!editable}
          />
        </div>

        {editable && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!puedeGuardar}
              onClick={alGuardar}
              className="transicion-ui rounded-control bg-naranja px-4 text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardadoHacePoco && <p className="text-xs text-tinta-suave">Guardado.</p>}
            {aviso && <p className="text-xs text-alerta">{aviso}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function FichaCasilla({
  casilla,
  origen,
  enMovimiento,
  onCerrar,
  onGuardado,
}: {
  casilla: CasillaConRepresentantes;
  origen: { x: number; y: number };
  enMovimiento: boolean;
  onCerrar: () => void;
  onGuardado: (representante: RepresentanteCasilla) => void;
}) {
  const { actuante } = useActuante();
  const editable = puedeEditarRepresentantes(actuante, casilla);
  const demarcacion = rasgoPorClave(casilla.seccion_clave)?.properties.demarcacion ?? null;

  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarBotonRef = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [origenLocal, setOrigenLocal] = useState({ x: origen.x, y: origen.y });
  const menosMovimientoRef = useRef(false);
  const duracionRef = useRef(240);

  // Misma coreografía de apertura que components/mapa/ficha-seccion.tsx: crece desde el punto
  // donde ocurrió el clic, con la curva y duración del sistema.
  useLayoutEffect(() => {
    menosMovimientoRef.current = prefiereMenosMovimiento();
    duracionRef.current = leerDuracionMs("--dur-panel", 240);

    const nodo = panelRef.current;
    if (nodo) {
      const caja = nodo.getBoundingClientRect();
      setOrigenLocal({ x: origen.x - caja.left, y: origen.y - caja.top });
    }

    if (menosMovimientoRef.current) {
      setAbierta(true);
      return;
    }
    const cuadro = requestAnimationFrame(() => setAbierta(true));
    return () => cancelAnimationFrame(cuadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cerrar() {
    if (menosMovimientoRef.current) {
      onCerrar();
      return;
    }
    setSaliendo(true);
    window.setTimeout(onCerrar, duracionRef.current);
  }

  useEffect(() => {
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrar();
    }
    document.addEventListener("keydown", alTecla);
    cerrarBotonRef.current?.focus();
    return () => document.removeEventListener("keydown", alTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = abierta && !saliendo;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Casilla ${casilla.numero}`}
      style={{ transformOrigin: `${origenLocal.x}px ${origenLocal.y}px` }}
      className={cn(
        "vidrio-flotante transicion-panel fixed z-30 flex flex-col overflow-hidden",
        "inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-h-[72vh] rounded-t-hoja",
        "md:inset-x-auto md:right-6 md:top-24 md:bottom-6 md:max-h-none md:w-[440px] md:rounded-tarjeta",
        enMovimiento && "vidrio-en-movimiento",
        visible ? "scale-100 opacity-100" : "scale-[0.35] opacity-0",
      )}
    >
      <div className="flex shrink-0 justify-center pt-2 md:hidden">
        <span aria-hidden className="h-1 w-10 rounded-pildora bg-tinta-tenue/40" />
      </div>

      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2 md:px-5 md:pt-4">
        <div className="min-w-0">
          <p className="cifras text-lg font-semibold text-tinta">
            {`Casilla ${ETIQUETA_TIPO_CASILLA[casilla.tipo] ?? casilla.tipo} ${casilla.numero}`}
          </p>
          <p className="cifras truncate text-sm text-tinta-suave">
            {`Sección ${casilla.seccion_clave}`}
            {demarcacion ? ` — ${demarcacion}` : ""}
          </p>
        </div>
        <button
          ref={cerrarBotonRef}
          type="button"
          onClick={cerrar}
          aria-label="Cerrar ficha de casilla"
          className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5 md:pb-5">
        {/* El estado primero, sin tener que leer nada más: si hay titular, si hay suplente, y
            cuando sí lo hay, sus tres estados de un golpe. */}
        <div className="mb-4 divide-y divide-borde border-b border-borde pb-1">
          <RenglonCobertura cargo="titular" representante={casilla.titular} />
          <RenglonCobertura cargo="suplente" representante={casilla.suplente} />
        </div>

        {!editable && (
          <p className="hueco-punteado mb-4 rounded-control px-3 py-2 text-xs">
            Solo se puede consultar: esta casilla está fuera de lo que editas, o tu rol no
            registra representantes.
          </p>
        )}

        <dl className="grid grid-cols-1 gap-3 border-b border-borde pb-4 sm:grid-cols-3">
          <Renglon etiqueta="Domicilio" valor={casilla.domicilio ?? "Sin dato"} />
          <Renglon etiqueta="Ubicación" valor={casilla.ubicacion ?? "Sin dato"} />
          <Renglon etiqueta="Referencia" valor={casilla.referencia ?? "Sin dato"} />
        </dl>

        <div className="flex flex-col gap-3 pt-4">
          <BloqueRepresentante
            actuante={actuante}
            casillaId={casilla.id}
            seccionClave={casilla.seccion_clave}
            cargo="titular"
            representante={casilla.titular}
            editable={editable}
            onGuardado={onGuardado}
          />
          <BloqueRepresentante
            actuante={actuante}
            casillaId={casilla.id}
            seccionClave={casilla.seccion_clave}
            cargo="suplente"
            representante={casilla.suplente}
            editable={editable}
            onGuardado={onGuardado}
          />
        </div>
      </div>
    </div>
  );
}
