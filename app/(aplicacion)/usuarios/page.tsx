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
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
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
      <section className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Usuarios" />
        <p className="medida text-sm text-tinta-suave">
          Esta pantalla solo la ve el administrador general.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Usuarios"
        apoyo={
          <span className="cifras">
            {usuarios.cargando
              ? "Cargando…"
              : `${usuarios.datos.length} usuarios · ${totalPersonas.toLocaleString("es-MX")} personas registradas, ${totalHoy.toLocaleString("es-MX")} hoy`}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        {/* La única acción primaria de la pantalla. */}
        <button type="button" onClick={() => setHojaAlta(true)} className="boton-primario ml-auto">
          <UserPlus className="size-4" aria-hidden />
          Agregar usuario
        </button>
      </div>

      {(usuarios.aviso || avisoBaja) && (
        <p role="alert" className="medida text-sm text-alerta">
          {avisoBaja ?? usuarios.aviso}
        </p>
      )}

      <div className="tarjeta overflow-x-auto">
        <table className="tabla min-w-[56rem]">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>
                {/* El encabezado es el control: tocarlo ordena de quien más registró a quien
                    menos, y tocarlo otra vez regresa al orden por rol. */}
                <button
                  type="button"
                  onClick={() => setPorRegistros((v) => !v)}
                  aria-pressed={porRegistros}
                  className={cn(
                    "transicion-ui -mx-2 -my-3 flex min-h-11 items-center gap-1.5 rounded-control px-2 transition-colors hover:bg-superficie-hundida hover:text-tinta",
                    porRegistros && "text-tinta",
                  )}
                >
                  Personas registradas
                  <ArrowDownWideNarrow
                    className={cn("size-3.5", !porRegistros && "opacity-40")}
                    aria-hidden
                  />
                </button>
              </th>
              <th>Rol</th>
              <th>Territorio</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold text-tinta">{u.nombre}</td>
                <td>
                  <CeldaCapturas c={capturasDe.get(u.id)} cargando={capturas.cargando} />
                </td>
                <td className="text-tinta-suave">{ETIQUETA_ROL[u.rol]}</td>
                <td className="text-tinta-suave">
                  {u.rol === "brigadista" ? (
                    "Por invitación"
                  ) : u.seccion_clave ? (
                    <span className="cifras">Sección {u.seccion_clave}</span>
                  ) : (
                    (demarcacionPorId(u.demarcacion_id)?.nombre ?? "Todo el municipio")
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={async () => {
                      setAvisoBaja(null);
                      const r = await cambiarActivo(actuante, u.id, !u.activo);
                      if (r.aviso) setAvisoBaja(r.aviso);
                      recargar();
                    }}
                    aria-pressed={u.activo}
                    className="chip"
                  >
                    {u.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditando(u)} className="boton">
                      <Pencil className="size-4 text-tinta-suave" aria-hidden />
                      Editar
                    </button>
                    <button type="button" onClick={() => setReponiendo(u)} className="boton">
                      <KeyRound className="size-4 text-tinta-suave" aria-hidden />
                      Reponer contraseña
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <span className="cifras text-sm font-semibold text-tinta">
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
