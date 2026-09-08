"use client";

import { useEffect, useState } from "react";
import { useActuante } from "@/components/proveedor-actuante";
import { alcanceDe } from "@/lib/permisos";
import { ETIQUETA_TIPO_ACTIVIDAD, type TipoActividad } from "@/lib/tipos";
import { crearActividad } from "@/lib/datos/actividades";
import { usuariosAsignables, type UsuarioBreve } from "@/components/actividades/datos";
import { cn } from "@/lib/utils";

const TIPOS: TipoActividad[] = ["reunion", "activismo", "recorrido"];

/**
 * Alta de actividad. No se pregunta quién la crea ni cuándo se captura: el sistema lo pone solo.
 * El territorio tampoco se pregunta: sale del responsable elegido o, si no hay, del territorio
 * propio de quien está capturando.
 */
export function FormularioActividad({ alCrear }: { alCrear: (id: string) => void }) {
  const { actuante } = useActuante();
  const alcance = alcanceDe(actuante);

  const [tipo, setTipo] = useState<TipoActividad>("reunion");
  const [subtipo, setSubtipo] = useState("");
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [direccion, setDireccion] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [notas, setNotas] = useState("");
  const [responsableId, setResponsableId] = useState("");

  const [usuarios, setUsuarios] = useState<UsuarioBreve[]>([]);
  useEffect(() => {
    usuariosAsignables(actuante).then((r) => setUsuarios(r.datos));
  }, [actuante]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim().length > 1 && fecha.length > 0;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || guardando) return;
    setGuardando(true);
    setError(null);

    const elegido = usuarios.find((u) => u.id === responsableId) ?? null;
    const territorioPropio =
      alcance.tipo === "seccion"
        ? { seccionClave: alcance.seccionClave, demarcacionId: alcance.demarcacionId }
        : alcance.tipo === "demarcacion"
          ? { seccionClave: null, demarcacionId: alcance.demarcacionId }
          : { seccionClave: null, demarcacionId: null };

    const r = await crearActividad({
      tipo,
      subtipo: subtipo.trim() || null,
      nombre: nombre.trim(),
      fecha,
      hora: hora || null,
      direccion: direccion.trim() || null,
      objetivo: objetivo.trim() || null,
      notas: notas.trim() || null,
      responsable_id: responsableId || null,
      seccion_clave: elegido?.seccion_clave ?? territorioPropio.seccionClave,
      demarcacion_id: elegido?.demarcacion_id ?? territorioPropio.demarcacionId,
      created_by: actuante.id,
      estatus: "programada",
    });

    if (!r.datos) {
      setGuardando(false);
      setError(r.aviso ?? "No se pudo guardar la actividad.");
      return;
    }
    alCrear(r.datos.id);
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 pb-2">
      <Campo etiqueta="Tipo">
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              onClick={() => setTipo(t)}
              className={cn(
                "transicion-ui rounded-control border px-3 text-sm toque-actividad",
                tipo === t
                  ? "border-tinta bg-tinta text-superficie"
                  : "border-borde bg-superficie text-tinta-suave",
              )}
            >
              {ETIQUETA_TIPO_ACTIVIDAD[t]}
            </button>
          ))}
        </div>
      </Campo>

      <Campo etiqueta="Subtipo" apoyo="Texto libre. Opcional.">
        <input
          value={subtipo}
          onChange={(e) => setSubtipo(e.target.value)}
          placeholder="Por ejemplo: brigada de limpieza"
          className="campo"
        />
      </Campo>

      <Campo etiqueta="Nombre">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className="campo"
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="campo cifras"
          />
        </Campo>
        <Campo etiqueta="Hora" apoyo="Opcional.">
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="campo cifras"
          />
        </Campo>
      </div>

      <Campo etiqueta="Dirección">
        <input
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          className="campo"
        />
      </Campo>

      <Campo etiqueta="Responsable" apoyo="Opcional. Define también el territorio de la actividad.">
        <select
          value={responsableId}
          onChange={(e) => setResponsableId(e.target.value)}
          className="campo"
        >
          <option value="">Sin asignar</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Objetivo">
        <textarea
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          rows={2}
          className="campo min-h-20 resize-y py-2"
        />
      </Campo>

      <Campo etiqueta="Notas">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className="campo min-h-24 resize-y py-2"
        />
      </Campo>

      {error && <p className="text-sm text-alerta">{error}</p>}

      <button
        type="submit"
        disabled={!listo || guardando}
        className="transicion-ui rounded-control bg-naranja text-base font-medium text-tinta toque-actividad disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Crear actividad"}
      </button>
    </form>
  );
}

function Campo({
  etiqueta,
  apoyo,
  children,
}: {
  etiqueta: string;
  apoyo?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-tinta-suave">
        {etiqueta}
        {apoyo && <span className="ml-2 text-xs text-tinta-tenue">{apoyo}</span>}
      </span>
      {children}
    </label>
  );
}
