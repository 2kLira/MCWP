"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Handshake,
  Heart,
  House,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Search,
  TriangleAlert,
  User,
} from "lucide-react";
import { SelectorPunto } from "@/components/registro/selector-punto";
import { useActuante } from "@/components/proveedor-actuante";
import { demarcacionPorId, DEMARCACIONES } from "@/lib/demarcaciones";
import {
  cargarCatalogoColonias,
  cargarCatalogoSecciones,
  cargarSecciones,
  coloniasDeSeccionEnCatalogo,
  normalizarTelefono,
  rasgoPorClave,
  seccionPorPunto,
  validarTelefonoMexicano,
  type ColeccionSecciones,
  type ColoniaCatalogo,
  type SeccionCatalogo,
} from "@/lib/territorio";
import {
  crearPersona,
  crearSolicitud,
  buscarPorTelefono,
  telefonoYaRegistrado,
  coincidenciasPorNombre,
  type Persona,
  type PersonaEnLista,
} from "@/lib/datos/personas";
import { registrarParticipacion } from "@/lib/datos/actividades";
import { crearSeguimiento } from "@/lib/datos/seguimientos";
import { ElegirActividad } from "@/components/registro/elegir-actividad";
import { esAdmin } from "@/lib/puertas-ui";
import { problematicas, type Problematica } from "@/lib/datos/catalogos";
import { GENEROS, ETIQUETA_GENERO, type Genero } from "@/lib/tipos";
import { cn, fechaLocalIso } from "@/lib/utils";
import { Campo } from "@/components/campo";
import { Caja } from "@/components/sistema/caja";

/** El texto del aviso va provisional, con nota visible de que falta revisión legal. */
const AVISO_VERSION = "provisional-1";

/** Texto corto según de dónde salió la sección que se muestra como confirmación. */
const ETIQUETA_ORIGEN_UBICACION: Record<"gps" | "mapa" | "manual", string> = {
  gps: "Ubicación del dispositivo",
  mapa: "Punto marcado en el mapa",
  manual: "Sección corregida a mano",
};

/** Edad en años cumplidos a hoy, o null si la fecha viene vacía o mal formada. Solo confirmación. */
function edadCumplida(fechaIso: string): number | null {
  if (!fechaIso) return null;
  const nacimiento = new Date(`${fechaIso}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const antesDelCumpleanos =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (antesDelCumpleanos) edad -= 1;
  return edad >= 0 ? edad : null;
}

type Ubicacion = {
  lat: number | null;
  lng: number | null;
  clave: string;
  origen: "gps" | "mapa" | "manual";
};

type Estado = "capturando" | "guardando" | "guardada";

/** Una opción del selector de sección. `conGeometria` falso = el mapa no la puede mostrar. */
type OpcionSeccion = { clave: string; demarcacion: string; conGeometria: boolean };

export function FormularioRegistro({ actividadId }: { actividadId?: string }) {
  const { actuante } = useActuante();

  const [nombres, setNombres] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [genero, setGenero] = useState<Genero | null>(null);
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [telefono, setTelefono] = useState("");
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [calle, setCalle] = useState("");
  const [coloniaId, setColoniaId] = useState<number | null>(null);
  const [quiereParticipar, setQuiereParticipar] = useState(false);
  const [quiereInfo, setQuiereInfo] = useState(true);
  const [esPromovido, setEsPromovido] = useState(false);
  const [quiereSerRepresentante, setQuiereSerRepresentante] = useState(false);
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [comentario, setComentario] = useState("");
  const [consiente, setConsiente] = useState(false);

  // Petición particular: casilla y texto libre. Va a la tabla solicitudes, no a personas.
  const [pidioAlgo, setPidioAlgo] = useState(false);
  const [descripcionSolicitud, setDescripcionSolicitud] = useState("");

  // Promotor: sí/no y, al decir que sí, un buscador de personas ya registradas.
  const [llegoPorPromotor, setLlegoPorPromotor] = useState(false);
  const [promotor, setPromotor] = useState<PersonaEnLista | null>(null);
  const [textoPromotor, setTextoPromotor] = useState("");
  // Los resultados se guardan junto con el texto que los produjo. Así "buscando" y qué se muestra
  // se derivan al pintar, sin limpiar estado dentro del efecto: si el texto cambió, la respuesta
  // guardada ya no le corresponde y simplemente no se usa.
  const [busquedaPromotor, setBusquedaPromotor] = useState<{
    consulta: string;
    resultados: PersonaEnLista[];
  } | null>(null);

  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [ubicando, setUbicando] = useState(true);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [abrirMapa, setAbrirMapa] = useState(false);
  // La clave que dio el GPS, aparte de `ubicacion`, para poder avisar si la corrección a mano
  // termina en otra sección. Una vez que el GPS contesta, esta clave ya no cambia.
  const [claveGps, setClaveGps] = useState<string | null>(null);
  const [coleccionSecciones, setColeccionSecciones] = useState<ColeccionSecciones | null>(null);
  /**
   * Las 169 del catálogo. El geojson solo dibuja 157: en las otras 18 el GPS no resuelve y el
   * mapa no las ofrece, así que sin esta lista la captura ahí se quedaba sin sección.
   */
  const [catalogoSecciones, setCatalogoSecciones] = useState<SeccionCatalogo[]>([]);

  const [catalogo, setCatalogo] = useState<Problematica[]>([]);
  /**
   * Las colonias del catálogo estático, no de la base: la captura en campo no debe depender de
   * la red ni de que el rol pueda leer `colonias`. Alfabéticas, sin el orden por traslape.
   */
  const [catalogoColonias, setCatalogoColonias] = useState<ColoniaCatalogo[]>([]);
  const [duplicada, setDuplicada] = useState<Persona | null>(null);
  const [caminoDuplicado, setCaminoDuplicado] = useState<"agregar" | "otra">("agregar");
  /**
   * El teléfono existe pero no se alcanza a leer la ficha. Es el caso normal del brigadista: la
   * RPC avisa del duplicado sin exponer datos de personas ajenas a su actividad.
   */
  const [duplicadoSinFicha, setDuplicadoSinFicha] = useState(false);

  const [estado, setEstado] = useState<Estado>("capturando");
  // Lo que no se pudo guardar después de que la persona sí quedó: la participación (y con ella el
  // comentario y las problemáticas) o la petición. Antes esos fallos se tiraban y se perdían sin
  // que nadie se enterara.
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  // El GPS resuelve la sección al instante contra los polígonos cacheados, sin red.
  useEffect(() => {
    let vigente = true;

    // El catálogo completo va en paralelo: es un archivo chico y hace falta tanto para el
    // selector como para resolver la demarcación de las 18 secciones sin polígono.
    void cargarCatalogoSecciones().then((catalogo) => {
      if (vigente) setCatalogoSecciones(catalogo);
    });

    cargarSecciones()
      .then((coleccion) => {
        if (vigente) setColeccionSecciones(coleccion);
        if (!vigente || !navigator.geolocation) {
          if (vigente) {
            setUbicando(false);
            setErrorGps("Este dispositivo no comparte ubicación.");
          }
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (posicion) => {
            if (!vigente) return;
            const { longitude, latitude } = posicion.coords;
            const clave = seccionPorPunto(longitude, latitude);
            setUbicando(false);
            if (clave) {
              setClaveGps(clave);
              setUbicacion({ lat: latitude, lng: longitude, clave, origen: "gps" });
            } else {
              // No siempre es que esté fuera: 18 secciones del catálogo no tienen polígono, así
              // que un punto legítimo dentro de una de ellas tampoco resuelve. El texto ya no
              // afirma lo que no sabe, y señala la salida.
              setErrorGps(
                "No se pudo resolver la sección desde el GPS. Márcala en el mapa o elígela a mano.",
              );
            }
          },
          () => {
            if (!vigente) return;
            setUbicando(false);
            setErrorGps("No se pudo leer el GPS.");
          },
          { enableHighAccuracy: true, timeout: 8000 },
        );
      })
      .catch(() => {
        if (vigente) {
          setUbicando(false);
          setErrorGps("No se pudo cargar la cartografía.");
        }
      });

    problematicas().then((r) => vigente && setCatalogo(r.datos));

    return () => {
      vigente = false;
    };
  }, []);

  // Las colonias del autocompletado salen de la sección resuelta, no al revés.
  useEffect(() => {
    if (!ubicacion) return;
    let vigente = true;
    void cargarCatalogoColonias().then((c) => vigente && setCatalogoColonias(c));
    return () => {
      vigente = false;
    };
  }, [ubicacion]);

  // Buscador de promotor: nombre libre, con retardo para no consultar en cada tecla. Miles de
  // personas registradas hacen inusable un <select>, por eso es buscador y no desplegable.
  const consultaPromotor = textoPromotor.trim();
  const buscaPromotor = llegoPorPromotor && !promotor && consultaPromotor.length >= 2;
  const buscandoPromotor = buscaPromotor && busquedaPromotor?.consulta !== consultaPromotor;
  const resultadosPromotor =
    buscaPromotor && busquedaPromotor?.consulta === consultaPromotor
      ? busquedaPromotor.resultados
      : [];

  useEffect(() => {
    if (!buscaPromotor) return;
    let vigente = true;
    const temporizador = setTimeout(() => {
      coincidenciasPorNombre(consultaPromotor, null).then((r) => {
        if (vigente) setBusquedaPromotor({ consulta: consultaPromotor, resultados: r.datos });
      });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [consultaPromotor, buscaPromotor]);

  // Deduplicación en el momento: en cuanto hay diez dígitos, se busca.
  const revisarTelefono = useCallback(
    async (valor: string) => {
      const norm = normalizarTelefono(valor);
      if (!norm || norm.length < 10) {
        setDuplicada(null);
        setDuplicadoSinFicha(false);
        return;
      }

      // El sí o no se pregunta SIEMPRE, por RPC. Es lo único que funciona para un brigadista:
      // buscarPorTelefono le devolvería null por RLS y perdería el aviso en silencio.
      const existe = await telefonoYaRegistrado(norm);
      if (!existe.datos) {
        setDuplicada(null);
        setDuplicadoSinFicha(false);
        return;
      }

      // La ficha completa solo se pide si quien captura puede verla. Si no, el aviso se queda en
      // "ya está registrado" y el camino de agregar la participación no se ofrece, porque la
      // base lo rechazaría.
      if (esAdmin(actuante)) {
        const r = await buscarPorTelefono(norm);
        setDuplicada(r.datos);
        setDuplicadoSinFicha(r.datos === null);
        setCaminoDuplicado("agregar");
        return;
      }

      setDuplicada(null);
      setDuplicadoSinFicha(true);
      setCaminoDuplicado("otra");
    },
    [actuante],
  );

  // No regaña mientras se escribe: valida hasta que hay diez dígitos o al salir del campo.
  const validarTelefonoEnVivo = useCallback((valor: string) => {
    if (!valor.trim()) {
      setErrorTelefono(null);
      return;
    }
    const r = validarTelefonoMexicano(valor);
    setErrorTelefono(r.valido ? null : r.motivo);
  }, []);

  const edad = edadCumplida(fechaNacimiento);

  const rasgo = ubicacion ? rasgoPorClave(ubicacion.clave) : null;
  // Para las 18 sin polígono, rasgoPorClave devuelve null y la captura se guardaba sin
  // demarcación. El catálogo la trae.
  const demarcacionNombre =
    rasgo?.properties.demarcacion ??
    (ubicacion
      ? (catalogoSecciones.find((s) => s.clave === ubicacion.clave)?.demarcacion ?? null)
      : null);
  const demarcacionId =
    DEMARCACIONES.find((d) => d.nombre === demarcacionNombre)?.id ?? null;

  /** Las colonias que tocan la sección resuelta. Alfabéticas; la sección es la que manda. */
  const colonias = useMemo(
    () =>
      ubicacion ? coloniasDeSeccionEnCatalogo(catalogoColonias, ubicacion.clave) : [],
    [catalogoColonias, ubicacion],
  );

  /**
   * Opciones del selector: las 157 de la cartografía más las 18 del catálogo que no tienen
   * polígono. Las segundas van marcadas, porque al elegirlas el mapa no va a poder mostrarlas y
   * más vale decirlo que dejar a alguien buscando por qué no se dibuja nada.
   *
   * Las dos fuentes son archivos estáticos cacheados: esto no pide nada a la base ni a la red.
   */
  const opcionesSeccion = useMemo<OpcionSeccion[]>(() => {
    const dibujadas = (coleccionSecciones?.features ?? []).map((f) => ({
      clave: f.properties.clave,
      demarcacion: f.properties.demarcacion,
      conGeometria: true,
    }));
    const yaEstan = new Set(dibujadas.map((s) => s.clave));
    const soloEnCatalogo = catalogoSecciones
      .filter((s) => !yaEstan.has(s.clave))
      .map((s) => ({ clave: s.clave, demarcacion: s.demarcacion, conGeometria: false }));
    return [...dibujadas, ...soloEnCatalogo].sort((a, b) => a.clave.localeCompare(b.clave));
  }, [coleccionSecciones, catalogoSecciones]);

  // Aviso discreto: la persona corrigió a mano y quedó en otra sección que la que dio el GPS.
  // No bloquea nada, solo lo deja dicho.
  const noCoincideConGps =
    !!ubicacion &&
    ubicacion.origen === "manual" &&
    claveGps !== null &&
    ubicacion.clave !== claveGps;

  function corregirSeccion(clave: string) {
    if (!clave) return;
    setUbicacion((previa) => ({
      lat: previa?.lat ?? null,
      lng: previa?.lng ?? null,
      clave,
      origen: "manual",
    }));
    setErrorGps(null);
  }

  const requierePeticion = !pidioAlgo || descripcionSolicitud.trim().length > 0;
  const requierePromotor = !llegoPorPromotor || !!promotor;

  const listo =
    nombres.trim().length > 1 &&
    apellidoPaterno.trim().length > 0 &&
    consiente &&
    !!ubicacion &&
    requierePeticion &&
    requierePromotor;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || !ubicacion) return;
    setEstado("guardando");
    setError(null);

    const hayDuplicado = !!duplicada || duplicadoSinFicha;
    // Solo se puede agregar la participación a una ficha que de verdad se alcanzó a leer.
    const agregarAExistente = !!duplicada && caminoDuplicado === "agregar";

    let personaId = duplicada?.id ?? null;

    if (!agregarAExistente) {
      const r = await crearPersona({
        // La base vuelve a armar `nombre` con las tres partes; se manda igual porque la columna
        // es obligatoria y así el renglón nunca depende de que el trigger exista.
        nombre: [nombres, apellidoPaterno, apellidoMaterno]
          .map((t) => t.trim())
          .filter(Boolean)
          .join(" "),
        nombres: nombres.trim(),
        apellido_paterno: apellidoPaterno.trim(),
        apellido_materno: apellidoMaterno.trim() || null,
        // Si es otra persona distinta, se guarda sin teléfono y queda marcada para revisión.
        telefono_raw: hayDuplicado ? null : telefono.trim() || null,
        calle: calle.trim() || null,
        colonia_id: coloniaId,
        seccion_clave: ubicacion.clave,
        demarcacion_id: demarcacionId,
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        origen_ubicacion: ubicacion.origen,
        genero,
        fecha_nacimiento: fechaNacimiento || null,
        quiere_participar: quiereParticipar,
        quiere_info: quiereInfo,
        es_promovido: esPromovido,
        quiere_ser_representante: quiereSerRepresentante,
        aviso_version: AVISO_VERSION,
        consentimiento_en: new Date().toISOString(),
        registrada_por: actuante.id,
        actividad_origen: actividadId ?? null,
        promotor_id: llegoPorPromotor ? (promotor?.id ?? null) : null,
      });
      if (!r.datos) {
        setEstado("capturando");
        setError(r.aviso ?? "No se pudo guardar.");
        return;
      }
      personaId = r.datos.id;

      // La nota de "marcada para revisión" va a seguimientos, que es tabla de gabinete y solo el
      // admin puede escribir. Para un brigadista esto rebotaría en silencio y la marca se
      // perdería, así que no se intenta. Queda pendiente decidir si la política se ensancha.
      if (hayDuplicado && esAdmin(actuante)) {
        await crearSeguimiento({
          personaId,
          tipo: "otro",
          nota:
            "Capturada sin teléfono porque el número ya existía en otra ficha. Queda marcada para revisión.",
          responsableId: actuante.id,
          estado: "pendiente",
        });
      }
    }

    const noGuardado: string[] = [];
    let participacionId: string | null = null;
    if (personaId && actividadId) {
      const rp = await registrarParticipacion({
        personaId,
        actividadId,
        tipo: agregarAExistente ? "asistencia" : "registro",
        registradaPor: actuante.id,
        // La nota va en la participación, que es lo que muestra la ficha de la persona. Se sigue
        // copiando en cada problemática porque la hoja de Problemáticas de la exportación la lee
        // de ahí.
        comentario: comentario.trim() || null,
        problematicas: elegidas.map((id) => ({
          id,
          comentario: comentario.trim() || null,
        })),
      });
      participacionId = rp.datos?.id ?? null;
      if (rp.aviso) noGuardado.push(rp.aviso);
    }

    // La petición particular cae en solicitudes con requiere_seguimiento en verdadero, para que
    // la persona aparezca en la bandeja de seguimiento igual que quien quiere participar.
    if (personaId && pidioAlgo && descripcionSolicitud.trim()) {
      const rs = await crearSolicitud({
        personaId,
        participacionId,
        tema: "Petición particular",
        descripcion: descripcionSolicitud.trim(),
        requiereSeguimiento: true,
      });
      if (!rs.datos) {
        noGuardado.push(
          `La petición no se guardó${rs.aviso ? `: ${rs.aviso}` : "."} Anótala y avísale al administrador.`,
        );
      }
    }

    setFaltantes(noGuardado);
    setEstado("guardada");
  }

  function otraCaptura() {
    setFaltantes([]);
    setNombres("");
    setApellidoPaterno("");
    setApellidoMaterno("");
    setGenero(null);
    setFechaNacimiento("");
    setTelefono("");
    setErrorTelefono(null);
    setCalle("");
    setColoniaId(null);
    setQuiereParticipar(false);
    setQuiereInfo(true);
    setEsPromovido(false);
    setQuiereSerRepresentante(false);
    setElegidas([]);
    setComentario("");
    setConsiente(false);
    setDuplicada(null);
    setPidioAlgo(false);
    setDescripcionSolicitud("");
    setLlegoPorPromotor(false);
    setPromotor(null);
    setTextoPromotor("");
    setBusquedaPromotor(null);
    setEstado("capturando");
    nombreRef.current?.focus();
  }

  // Un brigadista no puede capturar fuera de una actividad: la política lo rechaza. Así que en
  // lugar del formulario se le ofrece elegir una de sus actividades abiertas. Para el admin,
  // capturar sin actividad sigue siendo válido y el formulario se pinta normal.
  if (!actividadId && actuante.rol === "brigadista") {
    return <ElegirActividad />;
  }

  if (estado === "guardada") {
    return (
      <div className="tarjeta flex max-w-[47.5rem] flex-col items-center gap-4 px-[1.125rem] py-12 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-naranja-suave">
          <Check className="size-7 text-naranja-texto" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-semibold text-tinta">Persona registrada</p>
          <p className="cifras mt-1 text-sm text-tinta-suave">
            Sección {ubicacion?.clave} · {demarcacionNombre}
          </p>
        </div>
        {faltantes.length > 0 && (
          <div
            role="alert"
            className="flex w-full max-w-md flex-col gap-1 rounded-control border border-alerta/40 bg-alerta/10 p-3 text-left text-sm text-alerta"
          >
            {faltantes.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={otraCaptura}
          className="boton-primario min-h-12 w-full max-w-xs"
        >
          Registrar a alguien más
        </button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={guardar} className="flex max-w-[47.5rem] flex-col gap-5 pb-4">
        {/* La sección se muestra como confirmación, nunca como campo que alguien tenga que llenar. */}
        <Caja icono={MapPin} titulo="Ubicación">
          {ubicando ? (
            <p className="flex min-h-12 items-center gap-2 text-sm text-tinta-suave">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Leyendo la ubicación…
            </p>
          ) : ubicacion ? (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm">
                  <span className="block text-tinta-suave">
                    {ETIQUETA_ORIGEN_UBICACION[ubicacion.origen]}
                  </span>
                  <span className="cifras block text-lg font-semibold text-tinta">
                    Sección {ubicacion.clave}
                  </span>
                  <span className="block text-tinta-suave">{demarcacionNombre}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setAbrirMapa(true)}
                  className="boton min-h-12 shrink-0"
                >
                  Cambiar
                </button>
              </div>

              {opcionesSeccion.length > 0 && (
                <label className="flex flex-col gap-1.5 border-t border-separador pt-3.5 text-sm text-tinta-suave sm:max-w-[calc(50%-0.5rem)]">
                  Corregir sección a mano
                  <SelectorSeccion
                    opciones={opcionesSeccion}
                    valor={ubicacion.clave}
                    onCambiar={corregirSeccion}
                  />
                </label>
              )}
              {noCoincideConGps && (
                <p className="text-xs text-tinta-tenue">
                  No coincide con la sección {claveGps} que dio el GPS.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <p className="flex items-start gap-2 text-sm text-tinta-suave">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {errorGps ?? "Sin ubicación."}
              </p>
              <button
                type="button"
                onClick={() => setAbrirMapa(true)}
                className="boton min-h-12 sm:self-start"
              >
                <MapPin className="size-4" aria-hidden />
                Marcar en el mapa
              </button>
              {opcionesSeccion.length > 0 && (
                <label className="flex flex-col gap-1.5 text-sm text-tinta-suave sm:max-w-[calc(50%-0.5rem)]">
                  O elige la sección a mano
                  <SelectorSeccion
                    opciones={opcionesSeccion}
                    valor=""
                    onCambiar={corregirSeccion}
                  />
                </label>
              )}
            </div>
          )}
        </Caja>

        <Caja icono={User} titulo="Datos">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo etiqueta="Nombre(s)">
                <input
                  ref={nombreRef}
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="words"
                  required
                  className="campo"
                />
              </Campo>
            </div>

            <Campo etiqueta="Apellido paterno">
              <input
                value={apellidoPaterno}
                onChange={(e) => setApellidoPaterno(e.target.value)}
                autoComplete="off"
                autoCapitalize="words"
                required
                className="campo"
              />
            </Campo>
            {/* Opcional: hay quien solo tiene un apellido, y obligarlo haría inventar uno. */}
            <Campo etiqueta="Apellido materno (si tiene)">
              <input
                value={apellidoMaterno}
                onChange={(e) => setApellidoMaterno(e.target.value)}
                autoComplete="off"
                autoCapitalize="words"
                className="campo"
              />
            </Campo>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm text-tinta-suave">Género</p>
              <div className="flex flex-wrap gap-2">
                {GENEROS.map((g) => {
                  const activo = genero === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setGenero(activo ? null : g)}
                      className="chip"
                    >
                      {ETIQUETA_GENERO[g]}
                    </button>
                  );
                })}
              </div>
            </div>

            <Campo etiqueta="Fecha de nacimiento">
              <input
                type="date"
                value={fechaNacimiento}
                max={fechaLocalIso()}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                className="campo cifras"
              />
              {edad !== null && <span className="text-xs text-tinta-tenue">{edad} años</span>}
            </Campo>

            <Campo etiqueta="Teléfono" apoyo="Diez dígitos. Opcional.">
              <input
                value={telefono}
                inputMode="tel"
                onChange={(e) => {
                  const valor = e.target.value;
                  setTelefono(valor);
                  void revisarTelefono(valor);
                  // Solo regaña cuando ya hay diez dígitos; antes deja escribir en paz.
                  if (valor.replace(/\D/g, "").length >= 10) {
                    validarTelefonoEnVivo(valor);
                  } else {
                    setErrorTelefono(null);
                  }
                }}
                onBlur={(e) => validarTelefonoEnVivo(e.target.value)}
                className="campo cifras"
              />
              {errorTelefono && <p className="text-sm text-alerta">{errorTelefono}</p>}
            </Campo>

            {duplicadoSinFicha && (
              <div className="rounded-control bg-superficie-hundida p-3.5 sm:col-span-2">
                <p className="text-sm font-semibold text-tinta">Este teléfono ya está registrado</p>
                <p className="medida mt-1 text-sm text-tinta-suave">
                  No puedes ver de quién es porque está fuera de tu actividad. Guárdala como persona
                  distinta sin teléfono y avísale al administrador general, o pídele que le agregue la
                  participación.
                </p>
              </div>
            )}

            {duplicada && (
              <div className="rounded-control bg-superficie-hundida p-3.5 sm:col-span-2">
                <p className="text-sm font-semibold text-tinta">Este teléfono ya está registrado</p>
                <p className="mt-1 text-sm text-tinta-suave">
                  {duplicada.nombre}
                  {duplicada.seccion_clave && ` · sección ${duplicada.seccion_clave}`}
                  {duplicada.demarcacion_id &&
                    ` · ${demarcacionPorId(duplicada.demarcacion_id)?.nombre}`}
                </p>
                <div className="mt-2 flex flex-col">
                  <Opcion
                    nombre="duplicado"
                    elegido={caminoDuplicado === "agregar"}
                    alElegir={() => setCaminoDuplicado("agregar")}
                    titulo="Agregar esta participación a la persona encontrada"
                    apoyo="Es el camino correcto casi siempre."
                  />
                  <Opcion
                    nombre="duplicado"
                    elegido={caminoDuplicado === "otra"}
                    alElegir={() => setCaminoDuplicado("otra")}
                    titulo="Es otra persona distinta"
                    apoyo="Se guarda sin teléfono y queda marcada para revisión."
                  />
                </div>
              </div>
            )}
          </div>
        </Caja>

        <Caja icono={House} titulo="Domicilio">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Campo etiqueta="Calle">
              <input
                value={calle}
                onChange={(e) => setCalle(e.target.value)}
                className="campo"
                autoComplete="off"
              />
            </Campo>

            {colonias.length > 0 && (
              <Campo etiqueta="Colonia" apoyo="Referencia. La sección manda.">
                <select
                  value={coloniaId ?? ""}
                  onChange={(e) => setColoniaId(e.target.value ? Number(e.target.value) : null)}
                  className="campo"
                >
                  <option value="">Sin especificar</option>
                  {colonias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.cp ? ` · CP ${c.cp}` : ""}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </div>
        </Caja>

        <Caja icono={Handshake} titulo="Promotor">
          <div className="flex flex-col gap-2">
            <Interruptor
              etiqueta="¿Llegó por un promotor?"
              valor={llegoPorPromotor}
              alCambiar={(v) => {
                setLlegoPorPromotor(v);
                if (!v) {
                  setPromotor(null);
                  setTextoPromotor("");
                }
              }}
            />
            {llegoPorPromotor && (
              <div>
                {promotor ? (
                  <div className="flex items-center justify-between gap-3 rounded-control bg-superficie-hundida py-2 pl-3.5 pr-2">
                    <p className="min-w-0 text-sm font-medium text-tinta">
                      {promotor.nombre}
                      {promotor.seccion_clave && (
                        <span className="cifras ml-2 text-xs font-normal text-tinta-suave">
                          Sección {promotor.seccion_clave}
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPromotor(null);
                        setTextoPromotor("");
                      }}
                      className="boton min-h-12 shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
                        aria-hidden
                      />
                      <input
                        value={textoPromotor}
                        onChange={(e) => setTextoPromotor(e.target.value)}
                        autoComplete="off"
                        placeholder="Buscar promotor por nombre"
                        className="campo pl-9"
                      />
                    </div>
                    {buscandoPromotor && <p className="text-xs text-tinta-tenue">Buscando…</p>}
                    {!buscandoPromotor && resultadosPromotor.length > 0 && (
                      <ul className="flex flex-col gap-1.5">
                        {resultadosPromotor.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setPromotor(p)}
                              className="boton min-h-12 w-full justify-start py-2 text-left whitespace-normal"
                            >
                              <span>
                                {p.nombre}
                                {p.seccion_clave && (
                                  <span className="cifras ml-2 text-xs font-normal text-tinta-suave">
                                    Sección {p.seccion_clave}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!buscandoPromotor &&
                      textoPromotor.trim().length >= 2 &&
                      resultadosPromotor.length === 0 && (
                        <p className="text-xs text-tinta-tenue">Sin coincidencias.</p>
                      )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Caja>

        <Caja icono={Heart} titulo="Intereses">
          <div className="flex flex-col">
            <Interruptor
              etiqueta="Quiere participar"
              valor={quiereParticipar}
              alCambiar={setQuiereParticipar}
            />
            <Interruptor
              etiqueta="Quiere recibir información"
              valor={quiereInfo}
              alCambiar={setQuiereInfo}
            />
            <Interruptor
              etiqueta="Promovido, dará su voto"
              valor={esPromovido}
              alCambiar={setEsPromovido}
            />
            <Interruptor
              etiqueta="Quiere ser representante de casilla"
              valor={quiereSerRepresentante}
              alCambiar={setQuiereSerRepresentante}
            />
          </div>
        </Caja>

        <Caja icono={MessageSquare} titulo="Lo que dijo">
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-2">
              <Interruptor
                etiqueta="¿Pidió algo en particular?"
                valor={pidioAlgo}
                alCambiar={(v) => {
                  setPidioAlgo(v);
                  if (!v) setDescripcionSolicitud("");
                }}
              />
              {pidioAlgo && (
                <Campo etiqueta="Qué pidió">
                  <textarea
                    value={descripcionSolicitud}
                    onChange={(e) => setDescripcionSolicitud(e.target.value)}
                    rows={2}
                    required
                    className="campo min-h-16 resize-y py-2"
                  />
                </Campo>
              )}
            </div>

            {catalogo.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm text-tinta-suave">Problemáticas que mencionó</p>
                <div className="flex flex-wrap gap-2">
                  {catalogo.map((p) => {
                    const activa = elegidas.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={activa}
                        onClick={() =>
                          setElegidas((previas) =>
                            activa ? previas.filter((i) => i !== p.id) : [...previas, p.id],
                          )
                        }
                        className="chip"
                      >
                        {p.nombre}
                      </button>
                    );
                  })}
                </div>
                {!actividadId && elegidas.length > 0 && (
                  <p className="mt-2 text-xs text-tinta-tenue">
                    Las menciones se guardan dentro de una actividad. Abre el registro desde una
                    actividad para que queden ligadas.
                  </p>
                )}
              </div>
            )}

            <Campo etiqueta="Comentario">
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                className="campo min-h-24 resize-y py-2"
              />
            </Campo>
          </div>
        </Caja>

        <label className="flex min-h-12 items-start gap-3 px-1">
          <input
            type="checkbox"
            checked={consiente}
            onChange={(e) => setConsiente(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--naranja)]"
            style={{ minHeight: 0 }}
          />
          <span className="text-sm">
            <span className="block text-tinta">
              Acepta que sus datos se usen para darle seguimiento.
            </span>
            <span className="mt-1 block text-xs text-tinta-tenue">
              Texto provisional del aviso de privacidad, versión {AVISO_VERSION}. Pendiente de
              revisión legal.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-alerta">{error}</p>}

        <button
          type="submit"
          disabled={!listo || estado === "guardando"}
          className="boton-primario sticky bottom-20 min-h-12 text-base sm:self-start sm:px-6 md:bottom-4"
        >
          {estado === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </form>

      {abrirMapa && (
        <SelectorPunto
          inicial={
            ubicacion && ubicacion.lat !== null && ubicacion.lng !== null
              ? [ubicacion.lng, ubicacion.lat]
              : null
          }
          alCancelar={() => setAbrirMapa(false)}
          alConfirmar={(punto, clave) => {
            if (clave) {
              setUbicacion({ lng: punto[0], lat: punto[1], clave, origen: "mapa" });
              setErrorGps(null);
            }
            setAbrirMapa(false);
          }}
        />
      )}
    </>
  );
}

function Interruptor({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: boolean;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valor}
      onClick={() => alCambiar(!valor)}
      className="transicion-ui flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm text-tinta"
    >
      {etiqueta}
      <span
        aria-hidden
        className={cn(
          "transicion-ui relative h-6 w-10 shrink-0 rounded-pildora transition-colors",
          valor ? "bg-naranja" : "border border-borde bg-superficie-hundida",
        )}
      >
        <span
          className={cn(
            "transicion-ui absolute top-0.5 size-5 rounded-full bg-superficie shadow-sm transition-[left]",
            valor ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Opcion({
  nombre,
  elegido,
  alElegir,
  titulo,
  apoyo,
}: {
  nombre: string;
  elegido: boolean;
  alElegir: () => void;
  titulo: string;
  apoyo: string;
}) {
  return (
    <label className="flex min-h-12 items-start gap-3 py-2">
      <input
        type="radio"
        name={nombre}
        checked={elegido}
        onChange={alElegir}
        className="mt-0.5 size-5 shrink-0 accent-[var(--naranja)]"
        style={{ minHeight: 0 }}
      />
      <span className="text-sm">
        <span className="block text-tinta">{titulo}</span>
        <span className="block text-xs text-tinta-tenue">{apoyo}</span>
      </span>
    </label>
  );
}

/**
 * Selector para corregir la sección a mano. Es un <select>, no un buscador: son unas 400
 * secciones y un nativo las resuelve bien hasta en pantallas angostas, a diferencia de un
 * buscador de personas donde sí puede haber miles de renglones.
 */
function SelectorSeccion({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: OpcionSeccion[];
  valor: string;
  onCambiar: (clave: string) => void;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      className="campo cifras"
    >
      <option value="" disabled>
        Elegir sección…
      </option>
      {opciones.map((s) => (
        <option key={s.clave} value={s.clave}>
          {s.clave} · {s.demarcacion}
          {s.conGeometria ? "" : " · sin mapa"}
        </option>
      ))}
    </select>
  );
}
