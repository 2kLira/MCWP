"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Campo } from "@/components/campo";
import { Hoja } from "@/components/actividades/hoja";
import { Interruptor } from "@/components/registro/formulario-registro";
import { useActuante } from "@/components/proveedor-actuante";
import { actualizarPersona, type Persona } from "@/lib/datos/personas";
import {
  cargarCatalogoColonias,
  coloniasDeSeccionEnCatalogo,
  validarTelefonoMexicano,
  type ColoniaCatalogo,
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
 * Lo que **no** se edita aquí, a propósito:
 * - La ubicación y la sección. Si hay coordenada, la sección la calcula la base desde el punto y
 *   lo que mande el cliente no cuenta; moverla pide el mapa, no un campo de texto.
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
  const [quiereParticipar, setQuiereParticipar] = useState(p.quiere_participar);
  const [quiereInfo, setQuiereInfo] = useState(p.quiere_info);
  const [quiereSerRepresentante, setQuiereSerRepresentante] = useState(
    p.quiere_ser_representante,
  );
  const [quiereBardaLona, setQuiereBardaLona] = useState(p.quiere_barda_lona);

  const [catalogoColonias, setCatalogoColonias] = useState<ColoniaCatalogo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarCatalogoColonias().then((c) => {
      if (vigente) setCatalogoColonias(c);
    });
    return () => {
      vigente = false;
    };
  }, []);

  // Las colonias de su sección, como en el registro. Si la que ya tenía no está entre ellas se
  // conserva en la lista: borrarla en silencio por abrir la hoja sería perder un dato.
  const colonias = useMemo(() => {
    const deSeccion = p.seccion_clave
      ? coloniasDeSeccionEnCatalogo(catalogoColonias, p.seccion_clave)
      : [];
    const actual = catalogoColonias.find((c) => c.id === p.colonia_id);
    return actual && !deSeccion.includes(actual) ? [actual, ...deSeccion] : deSeccion;
  }, [catalogoColonias, p.seccion_clave, p.colonia_id]);

  const telefonoLimpio = telefono.trim();
  const revisionTelefono = telefonoLimpio ? validarTelefonoMexicano(telefonoLimpio) : null;
  const motivoTelefono =
    revisionTelefono && !revisionTelefono.valido ? revisionTelefono.motivo : null;

  const listo = nombres.trim().length > 1 && !motivoTelefono;

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
      quiere_participar: quiereParticipar,
      quiere_info: quiereInfo,
      quiere_ser_representante: quiereSerRepresentante,
      quiere_barda_lona: quiereBardaLona,
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
    <Hoja titulo="Editar datos" abierta alCerrar={alCerrar}>
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
          <Campo etiqueta="Fecha de nacimiento">
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
        </div>

        <p className="medida text-sm text-tinta-suave">
          La ubicación y la sección no se cambian aquí: la sección sale del punto en el mapa.
        </p>

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
    </Hoja>
  );
}
