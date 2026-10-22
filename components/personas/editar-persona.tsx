"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Pencil } from "lucide-react";
import { Campo } from "@/components/campo";
import { Hoja } from "@/components/actividades/hoja";
import { Interruptor, SelectorSeccion } from "@/components/registro/formulario-registro";
import { SelectorPunto } from "@/components/registro/selector-punto";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES } from "@/lib/demarcaciones";
import { actualizarPersona, type Persona } from "@/lib/datos/personas";
import {
  cargarCatalogoColonias,
  cargarCatalogoSecciones,
  cargarSecciones,
  coloniasDeSeccionEnCatalogo,
  seccionPorPunto,
  validarTelefonoMexicano,
  type ColoniaCatalogo,
  type SeccionCatalogo,
} from "@/lib/territorio";
import { GENEROS, ETIQUETA_GENERO, type Genero } from "@/lib/tipos";
import { fechaLocalIso } from "@/lib/utils";

/**
 * Corregir los datos de una persona desde su ficha.
 *
 * Quién puede lo decide `personas_update`: el admin, a cualquiera; el brigadista, solo lo que él
 * capturó mientras su actividad siga abierta. El botón se pinta con `puedeEditarPersona`, que es
 * el espejo cosmético de esa política.
 *
 * La sección se corrige de dos maneras, y las dos respetan que la base la calcula desde el punto
 * (privado.sellar_persona): moviendo el punto en el mapa, o eligiéndola a mano. A mano, el punto
 * se suelta si no cae en la sección elegida; si se quedara, la base volvería a sacar la sección
 * de él y la corrección no se guardaría.
 *
 * Lo que **no** se edita aquí, a propósito:
 * - Promovido, que tiene su propio botón porque el sistema sella quién y cuándo.
 * - Quién la registró, cuándo, el consentimiento y la actividad de origen: `sellar_persona` los
 *   congela en cualquier UPDATE, así que mandarlos sería fingir que se pueden cambiar.
 */
export function EditarPersona({
  persona,
  alGuardar,
}: {
  persona: Persona;
  alGuardar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="boton">
        <Pencil className="size-4 text-tinta-suave" aria-hidden />
        Editar datos
      </button>
      {/* La clave reinicia los campos cada vez que se abre: si no, se quedaría con lo que se
          tecleó y se canceló la vez anterior. */}
      {abierta && (
        <HojaEditarPersona
          key={persona.id}
          persona={persona}
          alCerrar={() => setAbierta(false)}
          alGuardar={alGuardar}
        />
      )}
    </>
  );
}

function HojaEditarPersona({
  persona: p,
  alCerrar,
  alGuardar,
}: {
  persona: Persona;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { actuante } = useActuante();

  // Renglones viejos o de carga masiva no tienen las partes: el nombre completo entra entero en
  // Nombre(s) y la base lo vuelve a armar igual al guardar.
  const sinPartes = !p.nombres && !p.apellido_paterno;
  const [nombres, setNombres] = useState(sinPartes ? p.nombre : (p.nombres ?? ""));
  const [apellidoPaterno, setApellidoPaterno] = useState(p.apellido_paterno ?? "");
  const [apellidoMaterno, setApellidoMaterno] = useState(p.apellido_materno ?? "");
  const [genero, setGenero] = useState<Genero | null>(p.genero);
  const [fechaNacimiento, setFechaNacimiento] = useState(p.fecha_nacimiento ?? "");
  const [telefono, setTelefono] = useState(p.telefono_raw ?? p.telefono_norm ?? "");
  const [calle, setCalle] = useState(p.calle ?? "");
  const [coloniaId, setColoniaId] = useState<number | null>(p.colonia_id);
  const [seccionClave, setSeccionClave] = useState<string | null>(p.seccion_clave);
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(
    p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
  );
  const [origen, setOrigen] = useState(p.origen_ubicacion);
  const [abrirMapa, setAbrirMapa] = useState(false);
  const [catalogoSecciones, setCatalogoSecciones] = useState<SeccionCatalogo[]>([]);
  const [quiereParticipar, setQuiereParticipar] = useState(p.quiere_participar);
  const [quiereInfo, setQuiereInfo] = useState(p.quiere_info);
  const [quiereSerRepresentante, setQuiereSerRepresentante] = useState(
    p.quiere_ser_representante,
  );
  const [quiereBardaLona, setQuiereBardaLona] = useState(p.quiere_barda_lona);
  const [urgente, setUrgente] = useState(p.urgente_contactar);
  const [motivoUrgente, setMotivoUrgente] = useState(p.urgente_motivo ?? "");

  const [catalogoColonias, setCatalogoColonias] = useState<ColoniaCatalogo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarCatalogoColonias().then((c) => {
      if (vigente) setCatalogoColonias(c);
    });
    cargarCatalogoSecciones().then((c) => {
      if (vigente) setCatalogoSecciones([...c].sort((a, b) => a.clave.localeCompare(b.clave)));
    });
    // Los polígonos hacen falta para saber si el punto cae en la sección elegida, y para que el
    // selector de punto resuelva la sección al mover el mapa.
    void cargarSecciones();
    return () => {
      vigente = false;
    };
  }, []);

  // La demarcación sale de la sección, como en el registro: no se le pide a nadie.
  const nombreDemarcacion = catalogoSecciones.find((s) => s.clave === seccionClave)?.demarcacion;
  const demarcacionId =
    seccionClave === p.seccion_clave && !nombreDemarcacion
      ? p.demarcacion_id
      : (DEMARCACIONES.find((d) => d.nombre === nombreDemarcacion)?.id ?? null);
  const seccionCambiada = seccionClave !== p.seccion_clave;

  /** La colonia es de la sección: si la nueva no la toca, se vacía en lugar de quedar huérfana. */
  function cambiarSeccion(clave: string) {
    setSeccionClave(clave);
    const colonia = catalogoColonias.find((c) => c.id === coloniaId);
    if (colonia && !colonia.secciones.includes(clave)) setColoniaId(null);
  }

  function corregirSeccionAMano(clave: string) {
    if (!clave) return;
    if (punto && seccionPorPunto(punto.lng, punto.lat) !== clave) setPunto(null);
    setOrigen("manual");
    cambiarSeccion(clave);
  }

  // Las colonias de su sección, como en el registro. Si la que ya tenía no está entre ellas se
  // conserva en la lista: borrarla en silencio por abrir la hoja sería perder un dato.
  const colonias = useMemo(() => {
    const deSeccion = seccionClave
      ? coloniasDeSeccionEnCatalogo(catalogoColonias, seccionClave)
      : [];
    const actual = catalogoColonias.find((c) => c.id === coloniaId);
    return actual && !deSeccion.includes(actual) ? [actual, ...deSeccion] : deSeccion;
  }, [catalogoColonias, seccionClave, coloniaId]);

  const telefonoLimpio = telefono.trim();
  const revisionTelefono = telefonoLimpio ? validarTelefonoMexicano(telefonoLimpio) : null;
  const motivoTelefono =
    revisionTelefono && !revisionTelefono.valido ? revisionTelefono.motivo : null;

  // Sin el catálogo no se sabe la demarcación de la sección nueva: se espera a que cargue.
  const listo =
    nombres.trim().length > 1 &&
    !motivoTelefono &&
    (!urgente || motivoUrgente.trim().length > 0) &&
    (!seccionCambiada || catalogoSecciones.length > 0);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || guardando) return;
    setGuardando(true);
    setError(null);

    const r = await actualizarPersona(actuante, p.id, {
      // `nombre` lo vuelve a armar sellar_persona desde las partes; se manda igual para que el
      // renglón quede coherente aunque el trigger cambie algún día.
      nombre: [nombres, apellidoPaterno, apellidoMaterno]
        .map((t) => t.trim())
        .filter(Boolean)
        .join(" "),
      nombres: nombres.trim(),
      apellido_paterno: apellidoPaterno.trim() || null,
      apellido_materno: apellidoMaterno.trim() || null,
      genero,
      fecha_nacimiento: fechaNacimiento || null,
      telefono_raw: telefonoLimpio || null,
      calle: calle.trim() || null,
      colonia_id: coloniaId,
      seccion_clave: seccionClave,
      demarcacion_id: demarcacionId,
      lat: punto?.lat ?? null,
      lng: punto?.lng ?? null,
      origen_ubicacion: punto ? origen : seccionClave ? "manual" : null,
      quiere_participar: quiereParticipar,
      quiere_info: quiereInfo,
      quiere_ser_representante: quiereSerRepresentante,
      quiere_barda_lona: quiereBardaLona,
      urgente_contactar: urgente,
      urgente_motivo: urgente ? motivoUrgente.trim() : null,
    });

    setGuardando(false);
    if (r.aviso || !r.datos) {
      // El teléfono es la llave de deduplicación: el único 23505 posible aquí es ese.
      setError(
        r.aviso === "Ya existe un registro con ese dato."
          ? "Ese teléfono ya lo tiene otra persona registrada."
          : (r.aviso ?? "No se pudieron guardar los cambios."),
      );
      return;
    }
    alGuardar();
    alCerrar();
  }

  return (
    // Con el mapa abierto, Escape cierra el mapa y no la hoja con todo lo que ya se corrigió.
    <Hoja titulo="Editar datos" abierta alCerrar={abrirMapa ? () => setAbrirMapa(false) : alCerrar}>
      <form onSubmit={guardar} className="flex flex-col gap-3.5">
        <Campo etiqueta="Nombre(s)">
          <input
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            required
            className="campo"
          />
        </Campo>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo etiqueta="Apellido paterno">
            <input
              value={apellidoPaterno}
              onChange={(e) => setApellidoPaterno(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              className="campo"
            />
          </Campo>
          <Campo etiqueta="Apellido materno (si tiene)">
            <input
              value={apellidoMaterno}
              onChange={(e) => setApellidoMaterno(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              className="campo"
            />
          </Campo>
        </div>

        <div>
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

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo etiqueta="Fecha de nacimiento" apoyo="Opcional.">
            <input
              type="date"
              value={fechaNacimiento}
              max={fechaLocalIso()}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              className="campo cifras"
            />
          </Campo>
          <Campo etiqueta="Teléfono" apoyo="Diez dígitos. Opcional.">
            <input
              value={telefono}
              inputMode="tel"
              onChange={(e) => setTelefono(e.target.value)}
              className="campo cifras"
            />
            {motivoTelefono && <span className="text-xs text-alerta">{motivoTelefono}</span>}
          </Campo>
        </div>

        <div className="flex flex-col gap-3 rounded-control bg-superficie-hundida p-3.5">
          <p className="text-sm">
            <span className="cifras block font-semibold text-tinta">
              {seccionClave ? `Sección ${seccionClave}` : "Sin sección"}
              {nombreDemarcacion && (
                <span className="font-normal text-tinta-suave"> · {nombreDemarcacion}</span>
              )}
            </span>
            <span className="block text-xs text-tinta-suave">
              {punto ? "Con punto en el mapa" : "Sin punto en el mapa"}
              {seccionCambiada && p.seccion_clave && ` · antes ${p.seccion_clave}`}
            </span>
          </p>
          <button type="button" onClick={() => setAbrirMapa(true)} className="boton min-h-12">
            <MapPin className="size-4" aria-hidden />
            {punto ? "Mover el punto en el mapa" : "Marcar en el mapa"}
          </button>
          {catalogoSecciones.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm text-tinta-suave">
              O corregir la sección a mano
              <SelectorSeccion
                opciones={catalogoSecciones}
                valor={seccionClave ?? ""}
                onCambiar={corregirSeccionAMano}
              />
            </label>
          )}
          {seccionCambiada && !punto && p.lat != null && (
            <p className="text-xs text-tinta-suave">
              El punto anterior no cae en esta sección, así que se guarda sin punto.
            </p>
          )}
        </div>

        <Campo etiqueta="Calle">
          <input
            value={calle}
            onChange={(e) => setCalle(e.target.value)}
            autoComplete="off"
            className="campo"
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

        <div className="flex flex-col border-t border-separador pt-1">
          <Interruptor
            etiqueta="Quiere participar"
            valor={quiereParticipar}
            alCambiar={setQuiereParticipar}
          />
          <Interruptor etiqueta="Quiere información" valor={quiereInfo} alCambiar={setQuiereInfo} />
          <Interruptor
            etiqueta="Quiere ser representante de casilla"
            valor={quiereSerRepresentante}
            alCambiar={setQuiereSerRepresentante}
          />
          <Interruptor
            etiqueta="Quiere que se pinte su barda o poner lona"
            valor={quiereBardaLona}
            alCambiar={setQuiereBardaLona}
          />
          {/* Apagarlo borra el motivo: la base no guarda un "urgente" que ya no lo es. */}
          <Interruptor etiqueta="Urgente contactar" valor={urgente} alCambiar={setUrgente} />
          {urgente && (
            <div className="pb-2">
              <Campo etiqueta="Por qué es urgente">
                <textarea
                  value={motivoUrgente}
                  onChange={(e) => setMotivoUrgente(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  required
                  className="campo min-h-16 resize-y py-2"
                />
              </Campo>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!listo || guardando}
          className="boton-primario min-h-12 w-full"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>

        {error && (
          <p role="alert" className="medida text-sm text-alerta">
            {error}
          </p>
        )}
      </form>

      {/* A document.body y no adentro de la hoja: la hoja tiene su propio apilamiento y el mapa a
          pantalla completa quedaría atrapado en él. */}
      {abrirMapa &&
        createPortal(
          <SelectorPunto
            inicial={punto ? [punto.lng, punto.lat] : null}
            alCancelar={() => setAbrirMapa(false)}
            alConfirmar={(nuevo, clave) => {
              if (clave) {
                setPunto({ lng: nuevo[0], lat: nuevo[1] });
                setOrigen("mapa");
                cambiarSeccion(clave);
              }
              setAbrirMapa(false);
            }}
          />,
          document.body,
        )}
    </Hoja>
  );
}
