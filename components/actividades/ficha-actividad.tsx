"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ClipboardList, UserPlus } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { Tarjeta } from "@/components/tablero/tarjeta";
import { FotosActividad } from "@/components/actividades/fotos-actividad";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { puedeEditar, puedeVerRegistro } from "@/lib/permisos";
import { ETIQUETA_ESTATUS, ETIQUETA_TIPO_ACTIVIDAD, type EstatusActividad } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  cambiarEstatus,
  cerrarActividad,
  consolidadoDeActividad,
  fotosDeActividad,
  obtenerActividad,
  participacionesDeActividad,
  type Actividad,
  type Consolidado,
  type Foto,
  type ParticipacionEnLista,
} from "@/lib/datos/actividades";
import {
  colaboradoresDeActividad,
  obtenerUsuario,
  type Colaborador,
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
    () => obtenerActividad(id),
    null,
    [id, recargar],
  );

  const responsable = useConsulta<UsuarioBreve | null>(
    () => obtenerUsuario(actividad.datos?.responsable_id ?? null),
    null,
    [actividad.datos?.responsable_id, recargar],
  );

  const colaboradores = useConsulta<Colaborador[]>(
    () => colaboradoresDeActividad(id),
    [],
    [id, recargar],
  );

  const participaciones = useConsulta<ParticipacionEnLista[]>(
    () => participacionesDeActividad(id),
    [],
    [id, recargar],
  );

  const fotos = useConsulta<Foto[]>(() => fotosDeActividad(id), [], [id, recargar]);

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
      <div className="flex flex-col gap-4">
        <div className="h-6 w-32 animate-pulse rounded-control bg-superficie-hundida" />
        <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-hundida" />
        <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-hundida" />
      </div>
    );
  }

  const a = actividad.datos;

  if (!a || !puedeVerRegistro(actuante, a)) {
    return (
      <div className="flex flex-col gap-4">
        <Volver />
        <p className="text-sm text-tinta-suave">
          {actividad.aviso ?? "Esta actividad está fuera de tu territorio o no existe."}
        </p>
      </div>
    );
  }

  const editable = puedeEditar(actuante, "actividad", a);
  const demarcacion = demarcacionPorId(a.demarcacion_id)?.nombre;
  const enCierre = editable && (a.estatus === "programada" || a.estatus === "en_curso");

  return (
    <div className="flex flex-col gap-5">
      <Volver />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl">{a.nombre}</h1>
          <p className="text-sm text-tinta-suave">
            {ETIQUETA_TIPO_ACTIVIDAD[a.tipo]}
            {a.subtipo && ` · ${a.subtipo}`}
          </p>
        </div>
        <span className="pildora shrink-0">{ETIQUETA_ESTATUS[a.estatus]}</span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
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
        <Dato
          etiqueta="Colaboradores"
          valor={
            colaboradores.datos.length > 0
              ? colaboradores.datos.map((c) => c.nombre).join(", ")
              : "Sin colaboradores"
          }
        />
        {a.objetivo && <Dato etiqueta="Objetivo" valor={a.objetivo} ancho />}
        {a.notas && <Dato etiqueta="Notas" valor={a.notas} ancho />}
      </section>

      {editable && a.estatus !== "realizada" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {a.estatus === "programada" && (
              <BotonEstatus etiqueta="Marcar en curso" onClick={() => moverA("en_curso")} deshabilitado={moviendo} />
            )}
            {(a.estatus === "programada" || a.estatus === "en_curso") && (
              <BotonEstatus etiqueta="Cancelar" onClick={() => moverA("cancelada")} deshabilitado={moviendo} />
            )}
            {a.estatus === "cancelada" && (
              <BotonEstatus etiqueta="Reprogramar" onClick={() => moverA("programada")} deshabilitado={moviendo} />
            )}
          </div>
          {avisoEstatus && <p className="text-sm text-alerta">{avisoEstatus}</p>}
        </div>
      )}

      <Link
        href={`/registrar?actividad=${id}` as never}
        className="transicion-ui flex items-center justify-center gap-2 vidrio filo rounded-tarjeta px-4 text-base font-medium text-tinta toque-actividad elevacion-apoyo"
        style={{ minHeight: "var(--toque-actividad)" }}
      >
        <UserPlus className="size-5" aria-hidden />
        Registrar personas en esta actividad
      </Link>

      <Tarjeta titulo="Participaciones">
        {participaciones.cargando ? (
          <div className="h-16 animate-pulse rounded-control bg-superficie-hundida" />
        ) : participaciones.datos.length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía nadie se ha registrado aquí.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {participaciones.datos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-tinta">
                  {p.personas?.nombre ?? "Persona sin nombre"}
                </span>
                <span className="pildora shrink-0">
                  {p.tipo === "registro" ? "Nueva" : "Asistencia"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Fotos">
        <FotosActividad
          actividadId={id}
          fotos={fotos.datos}
          cargando={fotos.cargando}
          puedeSubir={editable}
          usuarioId={actuante.id}
          alSubir={() => setRecargar((v) => v + 1)}
        />
      </Tarjeta>

      {enCierre ? (
        <BloqueCierre
          id={id}
          consolidado={consolidado.datos}
          cargandoConsolidado={consolidado.cargando}
          alCerrar={() => setRecargar((v) => v + 1)}
        />
      ) : a.estatus === "realizada" ? (
        <Tarjeta titulo="Cierre">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-tinta-tenue">Conclusión</p>
              <p className="mt-1 text-sm text-tinta">
                {a.conclusion || "Sin conclusión registrada."}
              </p>
            </div>
            <ConsolidadoTabla consolidado={consolidado.datos} cargando={consolidado.cargando} />
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}

function BloqueCierre({
  id,
  consolidado,
  cargandoConsolidado,
  alCerrar,
}: {
  id: string;
  consolidado: Consolidado;
  cargandoConsolidado: boolean;
  alCerrar: () => void;
}) {
  const { actuante } = useActuante();
  const [conclusion, setConclusion] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!conclusion.trim() || cerrando) return;
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
    <Tarjeta
      titulo="Cerrar actividad"
      accion={<ClipboardList className="size-4 text-tinta-tenue" aria-hidden />}
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-tinta">
            Esto lo calcula el sistema. Lo único que se escribe abajo es la conclusión.
          </p>
          <div className="mt-2">
            <ConsolidadoTabla consolidado={consolidado} cargando={cargandoConsolidado} />
          </div>
        </div>

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

        {error && <p className="text-sm text-alerta">{error}</p>}

        <button
          type="button"
          disabled={!conclusion.trim() || cerrando}
          onClick={confirmar}
          className="transicion-ui rounded-control bg-naranja text-base font-medium text-tinta toque-actividad disabled:opacity-50"
        >
          {cerrando ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>
    </Tarjeta>
  );
}

function ConsolidadoTabla({
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
    <div className="flex flex-col gap-3 rounded-control border border-borde bg-superficie-hundida p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra etiqueta="Asistentes" valor={consolidado.asistentes} />
        <Cifra etiqueta="Personas nuevas" valor={consolidado.nuevas} />
        <Cifra etiqueta="Quieren participar" valor={consolidado.quierenParticipar} />
        <Cifra etiqueta="Quieren información" valor={consolidado.quierenInfo} />
      </div>
      {consolidado.menciones.length > 0 && (
        <div>
          <p className="text-xs text-tinta-tenue">Menciones por problemática</p>
          <ul className="mt-1 flex flex-col gap-1">
            {consolidado.menciones.map((m) => (
              <li key={m.problematica} className="flex items-center justify-between text-sm">
                <span className="text-tinta">{m.problematica}</span>
                <span className="cifras text-tinta-suave">{m.menciones}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <p className="cifras text-lg font-semibold text-tinta">{valor.toLocaleString("es-MX")}</p>
      <p className="text-xs text-tinta-tenue">{etiqueta}</p>
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
      className="transicion-ui rounded-control border border-borde bg-superficie px-4 text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
    >
      {etiqueta}
    </button>
  );
}

function Volver() {
  return (
    <Link
      href="/actividades"
      className="transicion-ui inline-flex w-fit items-center gap-2 text-sm text-tinta-suave hover:text-tinta"
    >
      <ArrowLeft className="size-4" aria-hidden />
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
    <div
      className={`rounded-control border border-borde bg-superficie p-3 ${ancho ? "sm:col-span-2" : ""}`}
    >
      <p className="text-xs text-tinta-tenue">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-tinta">{valor}</p>
    </div>
  );
}
