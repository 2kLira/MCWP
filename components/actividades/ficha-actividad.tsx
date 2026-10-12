"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Camera,
  Flag,
  Images,
  Info,
  MessageSquareWarning,
  Play,
  UserPlus,
  Users,
} from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { InvitarBrigadistas } from "@/components/actividades/invitar-brigadistas";
import { EliminarActividad } from "@/components/actividades/eliminar-actividad";
import { Caja } from "@/components/sistema/caja";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Estado } from "@/components/sistema/estado";
import { BarraAvance } from "@/components/sistema/barra-avance";
import { FotosActividad } from "@/components/actividades/fotos-actividad";
import { BotonEvidencia, LineaEvidencia } from "@/components/actividades/evidencia";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { esAdmin, puedeCrear, puedeEditar } from "@/lib/puertas-ui";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD, type EstatusActividad } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  cambiarEstatus,
  cerrarActividad,
  consolidadoDeActividad,
  guardarConclusion,
  fotosDeActividad,
  obtenerActividad,
  participacionesDeActividad,
  type Actividad,
  type Consolidado,
  type Foto,
  type ParticipacionEnLista,
} from "@/lib/datos/actividades";
import {
  obtenerUsuario,
  type UsuarioBreve,
} from "@/components/actividades/datos";

function fechaLarga(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function horaCorta(hora: string | null): string {
  if (!hora) return "";
  return hora.slice(0, 5);
}

export function FichaActividad({ id }: { id: string }) {
  const { actuante } = useActuante();
  const [recargar, setRecargar] = useState(0);

  const actividad = useConsulta<Actividad | null>(
    () => obtenerActividad(actuante, id),
    null,
    [id, actuante.id, recargar],
  );

  const responsable = useConsulta<UsuarioBreve | null>(
    () => obtenerUsuario(actividad.datos?.responsable_id ?? null),
    null,
    [actividad.datos?.responsable_id, recargar],
  );

  const participaciones = useConsulta<ParticipacionEnLista[]>(
    () => participacionesDeActividad(id),
    [],
    [id, recargar],
  );

  const fotos = useConsulta<Foto[]>(() => fotosDeActividad(id), [], [id, recargar]);
  // La evidencia de inicio y de cierre se distingue por momento; el resto es galería general.
  const fotoInicio = fotos.datos.find((f) => f.momento === "inicio") ?? null;
  const fotoCierre = fotos.datos.find((f) => f.momento === "cierre") ?? null;
  const galeria = fotos.datos.filter((f) => !f.momento);

  const consolidado = useConsulta<Consolidado>(
    () => consolidadoDeActividad(id),
    { asistentes: 0, nuevas: 0, quierenParticipar: 0, quierenInfo: 0, menciones: [] },
    [id, recargar],
  );

  const [avisoEstatus, setAvisoEstatus] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);

  async function moverA(destino: EstatusActividad) {
    setMoviendo(true);
    setAvisoEstatus(null);
    const r = await cambiarEstatus(actuante, id, destino);
    setMoviendo(false);
    if (!r.datos) {
      setAvisoEstatus(r.aviso ?? "No se pudo cambiar el estatus.");
      return;
    }
    setRecargar((v) => v + 1);
  }

  if (actividad.cargando) {
    return (
      <div className="flex flex-col gap-5">
        <div className="h-9 w-56 animate-pulse rounded-control bg-superficie-hundida" />
        <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-hundida" />
        <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-hundida" />
      </div>
    );
  }

  const a = actividad.datos;

  // Sin comprobación por territorio. Con RLS, si el brigadista llegó hasta aquí es porque la
  // política `actividades_brigadista_ve` le entregó la actividad; volver a filtrar por territorio
  // la tiraba justo antes de pintarla, que era el síntoma de "me sale vacío".
  if (!a) {
    return (
      <div className="flex flex-col gap-4">
        <Volver />
        <p className="text-sm text-tinta-suave">
          {actividad.aviso ?? "Esta actividad no existe o ya no está disponible para ti."}
        </p>
      </div>
    );
  }

  // Dos permisos distintos que antes compartían una sola variable llamada `editable`, y de ahí
  // venía el reclamo del cliente: al brigadista se le cerraba la cámara por una puerta que en
  // realidad hablaba de otra cosa.
  //
  //  · `puedeEditarActividad` es tocar la actividad: moverla de estatus, cancelarla, reprogramarla
  //    y cerrarla escribiendo la conclusión. Sigue siendo del administrador y de los responsables,
  //    y además lo vuelven a exigir `cambiarEstatus` y `cerrarActividad` en lib/datos/actividades,
  //    así que abrir la cámara no abre el cierre ni por accidente.
  //  · `puedeSubirEvidencia` es adjuntar fotos, nada más. Esto es espejo de la política
  //    `fotos_insert`: el administrador siempre; cualquier otro, solo mientras la actividad siga
  //    abierta. La política pide además estar invitado, y eso aquí no se puede saber: si no lo
  //    está, el rechazo llega traducido al subir.
  const puedeEditarActividad = puedeEditar(actuante, "actividad");
  const actividadAbierta = a.estatus === "programada" || a.estatus === "en_curso";
  const puedeSubirEvidencia =
    esAdmin(actuante) || (puedeCrear(actuante, "foto") && actividadAbierta);
  // Quien puede editar la actividad ya tiene su botón de subir dentro de su propio flujo: el
  // bloque de "marcar en curso" y el de cierre. Para no pintar el mismo botón dos veces, la
  // tarjeta de evidencia ofrece subir solo a quien no tiene esos flujos, que es el brigadista.
  const subirDesdeTarjeta = puedeSubirEvidencia && !puedeEditarActividad;
  const demarcacion = demarcacionPorId(a.demarcacion_id)?.nombre;
  const enCierre = puedeEditarActividad && actividadAbierta;

  // Las acciones de estatus conservan sus condiciones de siempre; aquí solo se les pone nombre
  // para poder acomodarlas en el renglón de acciones.
  const conAccionesDeEstatus = puedeEditarActividad && a.estatus !== "realizada";
  const puedeMarcarEnCurso = conAccionesDeEstatus && a.estatus === "programada" && !!fotoInicio;
  const faltaFotoDeInicio = conAccionesDeEstatus && a.estatus === "programada" && !fotoInicio;
  const conConsolidado = enCierre || a.estatus === "realizada";

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo={a.nombre}
        apoyo={
          <>
            {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
            {a.seccion_clave && (
              <>
                {" · "}
                <span className="cifras">Sección {a.seccion_clave}</span>
              </>
            )}
          </>
        }
        volver={{ href: "/actividades", etiqueta: "Actividades" }}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Estado vivo={a.estatus === "en_curso"}>{ETIQUETA_ESTATUS[a.estatus]}</Estado>
        {conAccionesDeEstatus && (
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {/* La única naranja de la ficha mientras exista: el cierre baja a secundario. */}
            {puedeMarcarEnCurso && (
              <button
                type="button"
                onClick={() => moverA("en_curso")}
                disabled={moviendo}
                className="boton-primario"
              >
                <Play className="size-4" aria-hidden />
                Marcar en curso
              </button>
            )}
            {(a.estatus === "programada" || a.estatus === "en_curso") && (
              <BotonEstatus etiqueta="Cancelar" onClick={() => moverA("cancelada")} deshabilitado={moviendo} />
            )}
            {a.estatus === "cancelada" && (
              <BotonEstatus etiqueta="Reprogramar" onClick={() => moverA("programada")} deshabilitado={moviendo} />
            )}
          </div>
        )}
      </div>

      {faltaFotoDeInicio && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-tinta-suave">
            Sube la foto de inicio para poder marcarla en curso.
          </p>
          <BotonEvidencia
            actividadId={id}
            momento="inicio"
            usuarioId={actuante.id}
            alSubir={() => setRecargar((v) => v + 1)}
          />
        </div>
      )}
      {conAccionesDeEstatus && avisoEstatus && (
        <p className="text-sm text-alerta">{avisoEstatus}</p>
      )}

      <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Caja icono={Info} titulo="Datos">
            <div className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-3">
              <Dato
                etiqueta="Fecha"
                valor={`${fechaLarga(a.fecha)}${a.hora ? ` · ${horaCorta(a.hora)}` : ""}`}
              />
              <Dato
                etiqueta="Ubicación"
                valor={
                  [a.direccion, a.seccion_clave ? `Sección ${a.seccion_clave}` : null, demarcacion]
                    .filter(Boolean)
                    .join(" · ") || "Sin dato"
                }
              />
              <Dato etiqueta="Responsable" valor={responsable.datos?.nombre ?? "Sin asignar"} />
              {a.objetivo && <Dato etiqueta="Objetivo" valor={a.objetivo} ancho />}
              {a.notas && <Dato etiqueta="Notas" valor={a.notas} ancho />}
            </div>

            {/* Nota discreta, no un error: encabezar una actividad de otra sección pasa todo el
                tiempo en campo y no se marca como falla. */}
            {responsable.datos?.seccion_clave &&
              a.seccion_clave &&
              responsable.datos.seccion_clave !== a.seccion_clave && (
                <p className="mt-3 text-xs text-tinta-tenue">
                  {responsable.datos.nombre} no es responsable de la sección {a.seccion_clave}.
                </p>
              )}
          </Caja>

          <Caja
            icono={Users}
            titulo="Participaciones"
            accion={
              <Link
                href={`/registrar?actividad=${id}` as never}
                className="boton max-sm:w-full"
              >
                <UserPlus className="size-4" aria-hidden />
                Registrar personas en esta actividad
              </Link>
            }
          >
            {participaciones.cargando ? (
              <div className="h-16 animate-pulse rounded-control bg-superficie-hundida" />
            ) : participaciones.datos.length === 0 ? (
              <p className="text-sm text-tinta-suave">Todavía nadie se ha registrado aquí.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-separador">
                {participaciones.datos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-sm text-tinta">
                      {p.personas?.nombre ?? "Persona sin nombre"}
                    </span>
                    <span className="shrink-0 text-xs text-tinta-suave">
                      {p.tipo === "registro" ? "Nueva" : "Asistencia"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Caja>

          <Caja icono={Camera} titulo="Evidencia de inicio y cierre">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <LineaEvidencia
                  etiqueta="Inicio"
                  foto={fotoInicio}
                  faltaAviso={
                    !fotoInicio && (a.estatus === "en_curso" || a.estatus === "realizada")
                      ? "Esta actividad ya arrancó y no tiene foto de inicio."
                      : undefined
                  }
                />
                {!fotoInicio && subirDesdeTarjeta && (
                  <BotonEvidencia
                    actividadId={id}
                    momento="inicio"
                    usuarioId={actuante.id}
                    alSubir={() => setRecargar((v) => v + 1)}
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-separador pt-3">
                <LineaEvidencia etiqueta="Cierre" foto={fotoCierre} />
                {!fotoCierre && subirDesdeTarjeta && (
                  <BotonEvidencia
                    actividadId={id}
                    momento="cierre"
                    usuarioId={actuante.id}
                    alSubir={() => setRecargar((v) => v + 1)}
                  />
                )}
              </div>

              {subirDesdeTarjeta && (
                <p className="text-xs text-tinta-tenue">
                  Tú subes la foto de inicio y la de cierre. Cerrar la actividad lo hace el
                  administrador.
                </p>
              )}
            </div>
          </Caja>

          {subirDesdeTarjeta && (
            <ConclusionBrigadista
              key={a.conclusion ?? ""}
              id={id}
              inicial={a.conclusion ?? ""}
              alGuardar={() => setRecargar((v) => v + 1)}
            />
          )}

          <Caja icono={Images} titulo="Fotos">
            {/* Decisión: el brigadista también sube a la galería general, no solo la evidencia de
                inicio y cierre.
                A favor pesan tres cosas. Una, la política `fotos_insert` ya se lo permite, y este
                proyecto tiene documentado en lib/puertas-ui.ts que una puerta de interfaz más
                estricta que la política es un error, no una precaución: es el mismo bug que se
                arregló con el botón de corregir personas. Dos, `CREA.foto` ya lista al brigadista,
                o sea que la intención estaba escrita y nada más no se usaba. Tres, una foto de más
                en la galería no cambia ningún número: el consolidado del cierre se calcula de
                participaciones, no de fotos.
                Lo que el cliente pidió —inicio y fin— se trata distinto de todos modos: tiene su
                propia tarjeta, su propia etiqueta, y es lo único que bloquea marcar en curso y
                cerrar. La galería queda como evidencia adicional.
                Ojo con el estatus: aquí no se usa `actividadAbierta` a secas porque el administrador
                sí puede seguir agregando fotos a una actividad ya realizada, igual que la política. */}
            <FotosActividad
              actividadId={id}
              fotos={galeria}
              cargando={fotos.cargando}
              puedeSubir={puedeSubirEvidencia}
              usuarioId={actuante.id}
              alSubir={() => setRecargar((v) => v + 1)}
            />
          </Caja>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <InvitarBrigadistas
            actividadId={id}
            estatus={a.estatus}
            puedeInvitar={esAdmin(actuante)}
          />

          {enCierre ? (
            <BloqueCierre
              key={a.conclusion ?? ""}
              id={id}
              conclusionInicial={a.conclusion ?? ""}
              consolidado={consolidado.datos}
              cargandoConsolidado={consolidado.cargando}
              fotoCierre={fotoCierre}
              primaria={!puedeMarcarEnCurso}
              alSubirFoto={() => setRecargar((v) => v + 1)}
              alCerrar={() => setRecargar((v) => v + 1)}
            />
          ) : a.estatus === "realizada" ? (
            <Caja icono={Flag} titulo="Cierre">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs text-tinta-suave">Conclusión</p>
                  <p className="mt-1 text-sm text-tinta">
                    {a.conclusion || "Sin conclusión registrada."}
                  </p>
                </div>
                <ConsolidadoCifras consolidado={consolidado.datos} cargando={consolidado.cargando} />
              </div>
            </Caja>
          ) : null}

          {/* Antes vivía dentro del mismo recuadro que las cifras; sale con la misma condición:
              donde se ve el consolidado, ya cargado y con al menos una mención. */}
          {conConsolidado && !consolidado.cargando && consolidado.datos.menciones.length > 0 && (
            <Menciones menciones={consolidado.datos.menciones} />
          )}

          {/* Al final de la ficha y separado, para que nadie lo toque buscando otra cosa. */}
          {esAdmin(actuante) && (
            <div className="flex justify-center pt-1">
              <EliminarActividad actividadId={id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BloqueCierre({
  id,
  conclusionInicial,
  consolidado,
  cargandoConsolidado,
  fotoCierre,
  primaria,
  alSubirFoto,
  alCerrar,
}: {
  id: string;
  conclusionInicial: string;
  consolidado: Consolidado;
  cargandoConsolidado: boolean;
  fotoCierre: Foto | null;
  /** Naranja solo si en la ficha no hay otra acción primaria a la vista. */
  primaria: boolean;
  alSubirFoto: () => void;
  alCerrar: () => void;
}) {
  const { actuante } = useActuante();
  // Arranca con lo que haya escrito el brigadista, si escribió algo.
  const [conclusion, setConclusion] = useState(conclusionInicial);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!conclusion.trim() || !fotoCierre || cerrando) return;
    setCerrando(true);
    setError(null);
    const r = await cerrarActividad(actuante, id, conclusion.trim());
    setCerrando(false);
    if (!r.datos) {
      setError(r.aviso ?? "No se pudo cerrar la actividad.");
      return;
    }
    alCerrar();
  }

  return (
    <Caja icono={Flag} titulo="Cerrar actividad">
      <div className="flex flex-col gap-4">
        <ConsolidadoCifras consolidado={consolidado} cargando={cargandoConsolidado} />
        <p className="text-sm text-tinta-suave">
          Esto lo calcula el sistema. Lo único que se escribe abajo es la conclusión.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-tinta-suave">Conclusión general</span>
          <textarea
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            rows={3}
            className="campo min-h-24 resize-y py-2"
            placeholder="Cómo salió la actividad, en unas líneas."
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-tinta-suave">Foto de evidencia final</span>
          {fotoCierre ? (
            <LineaEvidencia etiqueta="Evidencia final" foto={fotoCierre} />
          ) : (
            <BotonEvidencia
              actividadId={id}
              momento="cierre"
              usuarioId={actuante.id}
              alSubir={alSubirFoto}
            />
          )}
        </div>

        {error && <p className="text-sm text-alerta">{error}</p>}

        <button
          type="button"
          disabled={!conclusion.trim() || !fotoCierre || cerrando}
          onClick={confirmar}
          className={`${primaria ? "boton-primario" : "boton"} sm:self-start`}
        >
          {cerrando ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>
    </Caja>
  );
}

/**
 * La conclusión general que escribe el brigadista. Guarda sin cerrar: el cierre sigue siendo del
 * administrador, que la encuentra ya escrita en su bloque de cierre.
 */
function ConclusionBrigadista({
  id,
  inicial,
  alGuardar,
}: {
  id: string;
  inicial: string;
  alGuardar: () => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const sinCambios = texto.trim() === inicial.trim();

  async function guardar() {
    if (guardando || sinCambios) return;
    setGuardando(true);
    setAviso(null);
    const r = await guardarConclusion(id, texto.trim());
    setGuardando(false);
    if (r.aviso) {
      setAviso({ tono: "error", texto: r.aviso });
      return;
    }
    if (!r.datos) {
      setAviso({
        tono: "error",
        texto: "No se guardó: la actividad ya se cerró o ya no estás invitado.",
      });
      return;
    }
    setAviso({ tono: "ok", texto: "Conclusión guardada." });
    alGuardar();
  }

  return (
    <Caja icono={Flag} titulo="Conclusión general">
      <div className="flex flex-col gap-3">
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAviso(null);
          }}
          rows={3}
          maxLength={4000}
          aria-label="Conclusión general"
          className="campo min-h-24 resize-y py-2"
          placeholder="Cómo salió la actividad, en unas líneas."
        />
        {aviso && (
          <p className={`text-sm ${aviso.tono === "error" ? "text-alerta" : "text-tinta-suave"}`}>
            {aviso.texto}
          </p>
        )}
        <button
          type="button"
          disabled={guardando || sinCambios}
          onClick={guardar}
          className="boton-primario sm:self-start"
        >
          {guardando ? "Guardando…" : "Guardar conclusión"}
        </button>
        <p className="text-xs text-tinta-tenue">
          El administrador la ve al cerrar la actividad y puede ajustarla.
        </p>
      </div>
    </Caja>
  );
}

/** Los cuatro conteos que calcula el sistema. Nunca se teclean. */
function ConsolidadoCifras({
  consolidado,
  cargando,
}: {
  consolidado: Consolidado;
  cargando: boolean;
}) {
  if (cargando) {
    return <div className="h-24 animate-pulse rounded-control bg-superficie-hundida" />;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
      <Cifra etiqueta="Asistentes" valor={consolidado.asistentes} />
      <Cifra etiqueta="Personas nuevas" valor={consolidado.nuevas} />
      <Cifra etiqueta="Quieren participar" valor={consolidado.quierenParticipar} />
      <Cifra etiqueta="Quieren información" valor={consolidado.quierenInfo} />
    </div>
  );
}

/** Las menciones del consolidado, cada una con su barra proporcional a la más mencionada. */
function Menciones({ menciones }: { menciones: Consolidado["menciones"] }) {
  const mayor = Math.max(...menciones.map((m) => m.menciones), 1);
  return (
    <Caja icono={MessageSquareWarning} titulo="Menciones por problemática">
      <ul className="flex flex-col gap-3.5">
        {menciones.map((m) => (
          <li key={m.problematica} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-tinta">{m.problematica}</span>
              <span className="cifras font-semibold text-tinta">{m.menciones}</span>
            </span>
            <BarraAvance
              valor={m.menciones / mayor}
              descripcion={`${m.problematica}: ${m.menciones} ${m.menciones === 1 ? "mención" : "menciones"}`}
            />
          </li>
        ))}
      </ul>
    </Caja>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <p className="text-xs text-tinta-suave">{etiqueta}</p>
      <p className="cifras mt-0.5 text-sm font-semibold text-tinta">{valor.toLocaleString("es-MX")}</p>
    </div>
  );
}

function BotonEstatus({
  etiqueta,
  onClick,
  deshabilitado,
}: {
  etiqueta: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className="boton"
    >
      {etiqueta}
    </button>
  );
}

/** El regreso de la vista sin actividad, que no tiene nombre que poner de título. */
function Volver() {
  return (
    <Link
      href="/actividades"
      className="transicion-ui inline-flex min-h-7 w-fit items-center gap-1.5 text-sm text-tinta-suave transition-colors hover:text-tinta"
    >
      <ArrowLeft className="size-[0.9375rem]" aria-hidden />
      Actividades
    </Link>
  );
}

function Dato({
  etiqueta,
  valor,
  ancho,
}: {
  etiqueta: string;
  valor: string;
  ancho?: boolean;
}) {
  return (
    <div className={ancho ? "min-w-0 sm:col-span-full" : "min-w-0"}>
      <p className="text-xs text-tinta-suave">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-tinta">{valor}</p>
    </div>
  );
}
