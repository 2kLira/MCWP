"use client";

import { ArrowDownWideNarrow, KeyRound, Pencil, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { useActuante } from "@/components/proveedor-actuante";
import { HojaContrasena } from "@/components/usuarios/hoja-contrasena";
import { HojaUsuario } from "@/components/usuarios/hoja-usuario";
import { demarcacionPorId } from "@/lib/demarcaciones";
import { PortonAgenda } from "@/components/porton-agenda";
import { puedeVerListadosGenerales, puedeVerUsuarios } from "@/lib/puertas-ui";
import { ETIQUETA_ROL } from "@/lib/tipos";
import { useConsulta } from "@/lib/usar-consulta";
import {
  cambiarActivo,
  capturasPorUsuario,
  listarUsuarios,
  type CapturasUsuario,
  type Usuario,
} from "@/lib/datos/usuarios";
import { cn } from "@/lib/utils";

export default function Usuarios() {
  const { actuante } = useActuante();
  const [version, setVersion] = useState(0);
  const [hojaAlta, setHojaAlta] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [reponiendo, setReponiendo] = useState<Usuario | null>(null);
  // El cambio de estado puede rebotar: el trigger del último administrador no deja que la
  // plataforma se quede sin nadie que pueda reponer contraseñas. Ese motivo hay que mostrarlo.
  const [avisoBaja, setAvisoBaja] = useState<string | null>(null);

  const usuarios = useConsulta<Usuario[]>(
    () => listarUsuarios(actuante),
    [],
    [actuante.id, version],
  );

  const capturas = useConsulta<CapturasUsuario[]>(
    () => capturasPorUsuario(actuante),
    [],
    [actuante.id, version],
  );
  // Por omisión la lista va por rol, como siempre. Ordenar por registros es para la pregunta
  // "quién está capturando y quién no", que es la que trae al administrador a esta columna.
  const [porRegistros, setPorRegistros] = useState(false);

  const capturasDe = useMemo(
    () => new Map(capturas.datos.map((c) => [c.usuario_id, c])),
    [capturas.datos],
  );
  const filas = useMemo(() => {
    if (!porRegistros) return usuarios.datos;
    return [...usuarios.datos].sort(
      (a, b) => (capturasDe.get(b.id)?.personas ?? 0) - (capturasDe.get(a.id)?.personas ?? 0),
    );
  }, [usuarios.datos, capturasDe, porRegistros]);
  const totalPersonas = capturas.datos.reduce((suma, c) => suma + c.personas, 0);
  const totalHoy = capturas.datos.reduce((suma, c) => suma + c.personas_hoy, 0);

  const recargar = () => setVersion((v) => v + 1);

  // Igual que en Carga masiva: al brigadista se le devuelve a su agenda, que es su módulo único;
  // a los demás roles se les dice de quién es esta pantalla.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Usuarios" />;
  }

  if (!puedeVerUsuarios(actuante)) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-xl">Usuarios</h1>
        <p className="medida text-sm text-tinta-suave">
          Esta pantalla solo la ve el administrador general.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl">Usuarios</h1>
          <p className="cifras text-sm text-tinta-suave">
            {usuarios.cargando
              ? "Cargando…"
              : `${usuarios.datos.length} usuarios · ${totalPersonas.toLocaleString("es-MX")} personas registradas, ${totalHoy.toLocaleString("es-MX")} hoy`}
          </p>
        </div>

        {/* La única acción primaria de la pantalla. */}
        <button
          type="button"
          onClick={() => setHojaAlta(true)}
          className="transicion-ui toque-actividad flex items-center gap-2 rounded-control bg-naranja px-4 text-sm font-medium text-sobre-naranja"
        >
          <UserPlus className="size-4" aria-hidden />
          Agregar usuario
        </button>
      </header>

      {(usuarios.aviso || avisoBaja) && (
        <p role="alert" className="medida text-sm text-alerta">
          {avisoBaja ?? usuarios.aviso}
        </p>
      )}

      <div className="vidrio filo overflow-hidden rounded-tarjeta">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">
                  {/* El encabezado es el control: tocarlo ordena de quien más registró a quien
                      menos, y tocarlo otra vez regresa al orden por rol. */}
                  <button
                    type="button"
                    onClick={() => setPorRegistros((v) => !v)}
                    aria-pressed={porRegistros}
                    className={cn(
                      "transicion-ui -mx-2 flex items-center gap-1.5 rounded-control px-2 hover:bg-superficie-hundida hover:text-tinta",
                      porRegistros && "text-tinta",
                    )}
                    style={{ minHeight: 32 }}
                  >
                    Personas registradas
                    <ArrowDownWideNarrow
                      className={cn("size-3.5", !porRegistros && "opacity-40")}
                      aria-hidden
                    />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Territorio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((u) => (
                <tr key={u.id} className="border-t border-borde">
                  <td className="px-4 py-2 text-tinta">{u.nombre}</td>
                  <td className="px-4 py-2">
                    <CeldaCapturas c={capturasDe.get(u.id)} cargando={capturas.cargando} />
                  </td>
                  <td className="px-4 py-2 text-tinta-suave">{ETIQUETA_ROL[u.rol]}</td>
                  <td className="px-4 py-2 text-tinta-suave">
                    {u.rol === "brigadista" ? (
                      "Por invitación"
                    ) : u.seccion_clave ? (
                      <span className="cifras">Sección {u.seccion_clave}</span>
                    ) : (
                      (demarcacionPorId(u.demarcacion_id)?.nombre ?? "Todo el municipio")
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setAvisoBaja(null);
                        const r = await cambiarActivo(actuante, u.id, !u.activo);
                        if (r.aviso) setAvisoBaja(r.aviso);
                        recargar();
                      }}
                      className={cn(
                        "pildora transicion-ui transition-colors",
                        !u.activo && "hueco-punteado",
                      )}
                      style={{ minHeight: 32 }}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditando(u)}
                        title="Editar"
                        className="transicion-ui flex items-center gap-1.5 rounded-control px-2 text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
                        style={{ minHeight: 32 }}
                      >
                        <Pencil className="size-4" aria-hidden />
                        <span className="sr-only md:not-sr-only">Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReponiendo(u)}
                        title="Reponer contraseña"
                        className="transicion-ui flex items-center gap-1.5 rounded-control px-2 text-tinta-suave transition-colors hover:bg-superficie-hundida hover:text-tinta"
                        style={{ minHeight: 32 }}
                      >
                        <KeyRound className="size-4" aria-hidden />
                        <span className="sr-only md:not-sr-only">Contraseña</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="medida text-sm text-tinta-suave">
        Las bajas se hacen desactivando la cuenta, nunca borrándola: el registro de quién capturó
        cada cosa no se tira. Una cuenta inactiva entra y ve un aviso, nada más.
      </p>

      {/* La clave fuerza que la hoja se reinicie entre un alta y una edición, y entre una ficha y
          otra: si no, los campos se quedarían con lo del usuario anterior. */}
      {hojaAlta && (
        <HojaUsuario
          key="alta"
          actuante={actuante}
          usuario={null}
          abierta
          alCerrar={() => setHojaAlta(false)}
          alGuardar={recargar}
        />
      )}

      {editando && (
        <HojaUsuario
          key={`editar-${editando.id}`}
          actuante={actuante}
          usuario={editando}
          abierta
          alCerrar={() => setEditando(null)}
          alGuardar={recargar}
        />
      )}

      {reponiendo && (
        <HojaContrasena
          key={`contrasena-${reponiendo.id}`}
          usuario={reponiendo}
          abierta
          alCerrar={() => setReponiendo(null)}
        />
      )}
    </div>
  );
}

function CeldaCapturas({ c, cargando }: { c: CapturasUsuario | undefined; cargando: boolean }) {
  if (cargando) return <span className="text-tinta-tenue">…</span>;
  if (!c || (c.personas === 0 && c.asistencias === 0)) {
    return <span className="text-tinta-tenue">Sin capturas</span>;
  }
  const detalle = [
    c.personas_hoy > 0 ? `${c.personas_hoy} hoy` : null,
    `${c.personas_7_dias} en 7 días`,
    c.asistencias > 0
      ? `${c.asistencias} ${c.asistencias === 1 ? "asistencia" : "asistencias"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col">
      <span className="cifras text-base font-semibold text-tinta">
        {c.personas.toLocaleString("es-MX")}
      </span>
      <span className="cifras text-xs text-tinta-suave">{detalle}</span>
      {c.ultima_captura && (
        <span className="text-xs text-tinta-tenue">
          Última{" "}
          {formatDistanceToNowStrict(new Date(c.ultima_captura), { addSuffix: true, locale: es })}
        </span>
      )}
    </div>
  );
}
