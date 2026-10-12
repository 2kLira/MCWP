"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, TriangleAlert } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { Caja } from "@/components/sistema/caja";
import { cargarSecciones, rasgoPorClave, validarTelefonoMexicano } from "@/lib/territorio";
import { coincidenciasPorNombre, type PersonaEnLista } from "@/lib/datos/personas";
import {
  buscarCasillasPorSeccion,
  casillaPorId,
  guardarRepresentante,
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

const ETIQUETA_CARGO: Record<CargoRepresentante, string> = {
  titular: "Titular",
  suplente: "Suplente",
};

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

// Valores por omisión: siempre lo pendiente. Quien acaba de registrar a alguien rara vez lo tiene
// ya todo listo, y dar por bueno lo que no se ha hecho infla el avance sin que nadie lo haya visto.
const CAPACITACION_INICIAL: EstadoCapacitacion = "por_capacitar";
const MANUAL_INICIAL: EstadoManual = "pendiente";
const ACREDITACION_INICIAL: EstadoAcreditacion = "pendiente";

type Estado = "capturando" | "guardando" | "guardada";

export function FormularioRepresentante() {
  const { actuante } = useActuante();

  // a) La casilla. Se busca por la clave de sección, de cuatro dígitos exactos: es la única
  // unidad territorial exacta, así que no hay razón para aceptar coincidencias parciales.
  const [claveSeccion, setClaveSeccion] = useState("");
  // Las casillas encontradas se guardan con la clave que las trajo: si la clave cambió, la
  // respuesta guardada ya no le corresponde y no se usa. Así nada se limpia dentro del efecto.
  const [busquedaCasillas, setBusquedaCasillas] = useState<{
    clave: string;
    casillas: CasillaConRepresentantes[];
  } | null>(null);
  const [casillaId, setCasillaId] = useState<number | null>(null);

  // c) El cargo.
  const [cargo, setCargo] = useState<CargoRepresentante | null>(null);

  // d) La persona.
  const [nombre, setNombre] = useState("");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [busquedaNombre, setBusquedaNombre] = useState<{
    consulta: string;
    seccion: string | null;
    resultados: PersonaEnLista[];
  } | null>(null);
  const [mostrarResultadosNombre, setMostrarResultadosNombre] = useState(false);

  // e) Los tres estados. Nunca preseleccionados a ciegas: arrancan en lo pendiente, a propósito.
  const [capacitacion, setCapacitacion] = useState<EstadoCapacitacion>(CAPACITACION_INICIAL);
  const [manual, setManual] = useState<EstadoManual>(MANUAL_INICIAL);
  const [acreditacion, setAcreditacion] = useState<EstadoAcreditacion>(ACREDITACION_INICIAL);

  const [estado, setEstado] = useState<Estado>("capturando");
  const [error, setError] = useState<string | null>(null);
  const claveRef = useRef<HTMLInputElement>(null);

  // La cartografía cacheada solo sirve para mostrar el nombre de la demarcación como confirmación;
  // si la red falla, la ficha degrada sola sin ese dato, igual que en components/casillas/ficha-casilla.tsx.
  useEffect(() => {
    cargarSecciones().catch(() => {});
  }, []);

  // Buscar casillas en cuanto la clave tiene sus cuatro dígitos. Si solo hay una (lo más común:
  // una básica sin contiguas), se elige sola; si hay varias, que la persona elija cuál.
  const claveCompleta = claveSeccion.length === 4;
  const casillas =
    claveCompleta && busquedaCasillas?.clave === claveSeccion ? busquedaCasillas.casillas : [];
  const buscandoCasillas = claveCompleta && busquedaCasillas?.clave !== claveSeccion;

  useEffect(() => {
    if (!claveCompleta) return;
    let vigente = true;
    buscarCasillasPorSeccion(actuante, claveSeccion).then((r) => {
      if (!vigente) return;
      setBusquedaCasillas({ clave: claveSeccion, casillas: r.datos });
      setCasillaId(r.datos.length === 1 ? r.datos[0].id : null);
    });
    return () => {
      vigente = false;
    };
  }, [claveSeccion, claveCompleta, actuante]);

  const casilla = casillas.find((c) => c.id === casillaId) ?? null;
  const demarcacion = casilla ? (rasgoPorClave(casilla.seccion_clave)?.properties.demarcacion ?? null) : null;

  // Buscador de persona ya registrada, mismo patrón con retardo que el promotor del registro
  // rápido y que el nombre en la ficha de casilla: con miles de personas un <select> no sirve.
  // La sección de la casilla elegida entra en la búsqueda. Antes se leía de una variable declarada
  // más abajo y fuera de las dependencias, así que al cambiar de casilla seguía buscando en la
  // sección anterior.
  const consultaNombre = nombre.trim();
  const seccionNombre = casilla?.seccion_clave ?? null;
  const buscaNombre = !personaId && consultaNombre.length >= 2;
  const respuestaVigente =
    busquedaNombre?.consulta === consultaNombre && busquedaNombre.seccion === seccionNombre;
  const buscandoNombre = buscaNombre && !respuestaVigente;
  const resultadosNombre = buscaNombre && respuestaVigente ? busquedaNombre!.resultados : [];

  useEffect(() => {
    if (!buscaNombre) return;
    let vigente = true;
    const temporizador = setTimeout(() => {
      coincidenciasPorNombre(consultaNombre, seccionNombre).then((r) => {
        if (vigente) {
          setBusquedaNombre({ consulta: consultaNombre, seccion: seccionNombre, resultados: r.datos });
        }
      });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [consultaNombre, seccionNombre, buscaNombre]);

  const representanteDelCargo: RepresentanteCasilla | null =
    casilla && cargo ? (cargo === "titular" ? casilla.titular : casilla.suplente) : null;
  const reemplazando = representanteCubierto(representanteDelCargo);

  function alCambiarTelefono(valor: string) {
    setTelefono(valor);
    if (!valor.trim()) {
      setErrorTelefono(null);
      return;
    }
    if (valor.replace(/\D/g, "").length >= 10) {
      const r = validarTelefonoMexicano(valor);
      setErrorTelefono(r.valido ? null : r.motivo);
    } else {
      setErrorTelefono(null);
    }
  }

  function alElegirPersona(persona: PersonaEnLista) {
    setNombre(persona.nombre);
    setPersonaId(persona.id);
    setBusquedaNombre(null);
    setMostrarResultadosNombre(false);
  }

  // Compartido entre "Cambiar" y "Registrar otro": limpia todo lo que depende de la pareja
  // (casilla, cargo) para que nadie guarde sin querer el nombre de una persona en el cargo de
  // otra casilla.
  function reiniciarPersonaYCargo() {
    setCargo(null);
    setNombre("");
    setPersonaId(null);
    setTelefono("");
    setErrorTelefono(null);
    setBusquedaNombre(null);
    setCapacitacion(CAPACITACION_INICIAL);
    setManual(MANUAL_INICIAL);
    setAcreditacion(ACREDITACION_INICIAL);
  }

  function cambiarCasilla() {
    setCasillaId(null);
    reiniciarPersonaYCargo();
  }

  function elegirCargo(valor: CargoRepresentante) {
    setCargo(valor);
  }

  const telefonoValido = validarTelefonoMexicano(telefono).valido;
  const listo = !!casilla && !!cargo && nombre.trim().length > 1 && telefonoValido;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || !casilla || !cargo) return;
    setEstado("guardando");
    setError(null);

    const r = await guardarRepresentante(
      actuante,
      { seccion_clave: casilla.seccion_clave },
      {
        casillaId: casilla.id,
        cargo,
        nombre: nombre.trim(),
        telefonoRaw: telefono,
        personaId,
        capacitacion,
        manual,
        acreditacion,
      },
    );

    if (!r.datos) {
      setEstado("capturando");
      setError(r.aviso ?? "No se pudo guardar.");
      return;
    }

    // Se refresca la casilla completa desde la base, en vez de fabricar el renglón a mano: así la
    // ocupación que se vea al capturar otro representante es la que de verdad quedó guardada.
    const fresca = await casillaPorId(actuante, casilla.id);
    if (fresca.datos) {
      const casillaFresca = fresca.datos;
      setBusquedaCasillas((actual) =>
        actual && {
          ...actual,
          casillas: actual.casillas.map((c) => (c.id === casillaFresca.id ? casillaFresca : c)),
        },
      );
    }

    setEstado("guardada");
  }

  function otraCaptura() {
    // Se conserva la sección y la casilla: quien trae veinte nombres los captura seguidos, casilla
    // por casilla, sin volver a teclear la clave cada vez. Solo se limpia lo propio de la persona.
    reiniciarPersonaYCargo();
    setEstado("capturando");
  }

  function otraSeccion() {
    setClaveSeccion("");
    setBusquedaCasillas(null);
    setCasillaId(null);
    otraCaptura();
    claveRef.current?.focus();
  }

  if (estado === "guardada") {
    return (
      <div className="tarjeta flex max-w-[47.5rem] flex-col items-center gap-4 px-[1.125rem] py-12 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-naranja-suave">
          <Check className="size-7 text-naranja-texto" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-semibold text-tinta">Representante registrado</p>
          <p className="cifras mt-1 text-sm text-tinta-suave">
            {cargo && ETIQUETA_CARGO[cargo]} · Sección {casilla?.seccion_clave}
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2.5">
          <button type="button" onClick={otraCaptura} className="boton-primario min-h-12 w-full">
            Registrar otro en esta sección
          </button>
          <button type="button" onClick={otraSeccion} className="boton min-h-12 w-full">
            Buscar otra sección
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="flex max-w-[47.5rem] flex-col gap-5 pb-4">
      {/* a) La casilla. */}
      <Caja titulo={<TituloPaso numero={1}>Casilla</TituloPaso>}>
        {!casilla ? (
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5 sm:max-w-[calc(50%-0.5rem)]">
              <span className="text-sm text-tinta-suave">Clave de sección</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
                  aria-hidden
                />
                <input
                  ref={claveRef}
                  value={claveSeccion}
                  onChange={(e) => setClaveSeccion(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="0001"
                  autoComplete="off"
                  className="campo cifras pl-9"
                />
              </div>
            </label>

            {claveSeccion.length === 4 && buscandoCasillas && (
              <p className="text-sm text-tinta-suave">Buscando casillas…</p>
            )}
            {claveSeccion.length === 4 && !buscandoCasillas && casillas.length === 0 && (
              <p className="text-sm text-tinta-suave">
                No hay casillas en la sección {claveSeccion} dentro de tu territorio.
              </p>
            )}
            {casillas.length >= 1 && (
              <div className="flex flex-col gap-2">
                {casillas.length > 1 && (
                  <p className="text-xs text-tinta-suave">
                    Esta sección tiene {casillas.length} casillas. Elige una.
                  </p>
                )}
                {casillas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCasillaId(c.id)}
                    className="boton min-h-12 w-full flex-col items-start justify-center gap-0.5 py-2.5 text-left whitespace-normal"
                  >
                    <span className="text-sm font-medium text-tinta">
                      {ETIQUETA_TIPO_CASILLA[c.tipo] ?? c.tipo} {c.numero}
                    </span>
                    {c.domicilio && (
                      <span className="text-xs font-normal text-tinta-suave">{c.domicilio}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm">
              <span className="cifras block text-lg font-semibold text-tinta">
                {ETIQUETA_TIPO_CASILLA[casilla.tipo] ?? casilla.tipo} {casilla.numero}
              </span>
              <span className="cifras block text-tinta-suave">
                Sección {casilla.seccion_clave}
                {demarcacion ? ` · ${demarcacion}` : ""}
              </span>
              {casilla.domicilio && (
                <span className="mt-1 block text-tinta-suave">{casilla.domicilio}</span>
              )}
              {casilla.ubicacion && (
                <span className="block text-tinta-suave">{casilla.ubicacion}</span>
              )}
            </p>
            <button type="button" onClick={cambiarCasilla} className="boton min-h-12 shrink-0">
              Cambiar
            </button>
          </div>
        )}
      </Caja>

      {/* b) y c) juntos: el selector de cargo ya muestra, de un vistazo, quién tiene cada uno. */}
      {casilla && (
        <Caja titulo={<TituloPaso numero={2}>Cargo</TituloPaso>}>
          <div className="flex flex-col gap-3">
            <div role="group" aria-label="Cargo" className="segmento flex! w-full rounded-[14px]! sm:max-w-md">
              <BotonCargo
                etiqueta="Titular"
                representante={casilla.titular}
                elegido={cargo === "titular"}
                onElegir={() => elegirCargo("titular")}
              />
              <BotonCargo
                etiqueta="Suplente"
                representante={casilla.suplente}
                elegido={cargo === "suplente"}
                onElegir={() => elegirCargo("suplente")}
              />
            </div>

            {reemplazando && representanteDelCargo && (
              <p className="flex items-start gap-2 rounded-control bg-superficie-hundida px-3 py-2.5 text-xs text-tinta">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-naranja-texto" aria-hidden />
                Vas a reemplazar a {representanteDelCargo.nombre} como {cargo && ETIQUETA_CARGO[cargo].toLowerCase()}.
              </p>
            )}
          </div>
        </Caja>
      )}

      {/* d) La persona. Solo tiene sentido una vez que hay cargo elegido. */}
      {casilla && cargo && (
        <Caja titulo={<TituloPaso numero={3}>Persona</TituloPaso>}>
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <label className="relative flex flex-col gap-1.5">
              <span className="text-sm text-tinta-suave">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setPersonaId(null);
                  setMostrarResultadosNombre(true);
                }}
                onFocus={() => setMostrarResultadosNombre(true)}
                onBlur={() => window.setTimeout(() => setMostrarResultadosNombre(false), 150)}
                autoComplete="off"
                placeholder="Nombre completo, o elige de la lista"
                required
                className="campo"
              />
              {mostrarResultadosNombre &&
                !personaId &&
                (buscandoNombre || resultadosNombre.length > 0) && (
                  <ul className="vidrio-denso absolute inset-x-0 top-full z-10 mt-1 flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-control p-1.5">
                    {buscandoNombre && (
                      <li className="px-2.5 py-2 text-xs text-tinta-tenue">Buscando…</li>
                    )}
                    {!buscandoNombre &&
                      resultadosNombre.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => alElegirPersona(p)}
                            className="transicion-ui w-full rounded-[8px] px-2.5 py-1.5 text-left text-sm text-tinta transition-colors hover:bg-superficie-hundida"
                          >
                            {p.nombre}
                            {p.seccion_clave && (
                              <span className="cifras ml-2 text-xs text-tinta-suave">
                                Sección {p.seccion_clave}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              {personaId && (
                <p className="text-xs text-tinta-suave">Persona ya registrada en el sistema.</p>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-tinta-suave">Teléfono</span>
              <input
                value={telefono}
                inputMode="tel"
                onChange={(e) => alCambiarTelefono(e.target.value)}
                onBlur={(e) => {
                  const r = validarTelefonoMexicano(e.target.value);
                  setErrorTelefono(r.valido ? null : r.motivo);
                }}
                placeholder="951 100 0000"
                className="campo cifras"
              />
              {errorTelefono && <p className="text-sm text-alerta">{errorTelefono}</p>}
            </label>
          </div>

          {/* e) Los tres estados. */}
          <div className="mt-4 flex flex-col gap-3 border-t border-separador pt-4">
            <SegmentoDosOpciones
              etiqueta="Capacitación"
              opciones={OPCIONES_CAPACITACION}
              valor={capacitacion}
              onCambiar={setCapacitacion}
            />
            <SegmentoDosOpciones
              etiqueta="Manual"
              opciones={OPCIONES_MANUAL}
              valor={manual}
              onCambiar={setManual}
            />
            <SegmentoDosOpciones
              etiqueta="Acreditación"
              opciones={OPCIONES_ACREDITACION}
              valor={acreditacion}
              onCambiar={setAcreditacion}
            />
          </div>
        </Caja>
      )}

      {error && <p className="text-sm text-alerta">{error}</p>}

      <button
        type="submit"
        disabled={!listo || estado === "guardando"}
        className="boton-primario sticky bottom-20 min-h-12 text-base sm:self-start sm:px-6 md:bottom-4"
      >
        {estado === "guardando" ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

/** Título de una Caja que es paso de una secuencia real: el número va en un círculo en tinta. */
function TituloPaso({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="cifras grid size-6 shrink-0 place-items-center rounded-full bg-tinta text-xs font-semibold text-fondo">
        {numero}
      </span>
      {children}
    </span>
  );
}

/** Botón de cargo: además de elegir, dice de inmediato si ya hay alguien y quién. Vive dentro de
 *  un `segmento`, que le da el color; aquí solo se le permite crecer a dos renglones. */
function BotonCargo({
  etiqueta,
  representante,
  elegido,
  onElegir,
}: {
  etiqueta: string;
  representante: RepresentanteCasilla | null;
  elegido: boolean;
  onElegir: () => void;
}) {
  const cubierto = representanteCubierto(representante);
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onElegir}
      className="min-h-14! min-w-0 flex-1 basis-0 rounded-[11px]! flex-col items-start! justify-center gap-0! py-1.5 text-left"
    >
      <span className={cn("font-medium", elegido && "font-semibold")}>{etiqueta}</span>
      <span className="w-full truncate text-xs font-normal text-tinta-suave">
        {cubierto ? representante!.nombre : "Libre"}
      </span>
    </button>
  );
}

/** Segmento de dos opciones, igual en espíritu al de components/casillas/ficha-casilla.tsx: que
 *  capacitación, manual y acreditación se lean de un golpe, sin depender de ese archivo. */
function SegmentoDosOpciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  opciones: ParDeOpciones<T>;
  valor: T;
  onCambiar: (valor: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="text-sm text-tinta-suave">{etiqueta}</p>
      <div role="group" aria-label={etiqueta} className="segmento max-w-full self-start">
        {opciones.map((o) => {
          const activa = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => onCambiar(o.valor)}
              aria-pressed={activa}
              className="min-h-11! px-3! text-[0.8125rem]!"
            >
              {o.texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}
