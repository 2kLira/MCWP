"use client";

import { TriangleAlert, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Hoja } from "@/components/actividades/hoja";
import { Tarjeta } from "@/components/tablero/tarjeta";
import {
  brigadistasDeActividad,
  brigadistasInvitables,
  type Brigadista,
  type UsuarioBreve,
} from "@/components/actividades/datos";
import { agregarBrigadista, quitarBrigadista } from "@/lib/datos/actividades";
import type { EstatusActividad } from "@/lib/tipos";

/**
 * Invitar brigadistas a una actividad.
 *
 * Esto no es una comodidad de interfaz: con Row Level Security, un renglón en
 * `actividad_brigadistas` más la actividad abierta **es todo el acceso del brigadista**. Sin
 * invitación entra al sistema y no ve absolutamente nada.
 *
 * Por eso la copia explica la consecuencia en lugar de limitarse a nombrar el control. Quien
 * administra tiene que entender que invitar es dar permiso y que cerrar la actividad lo retira.
 */
export function InvitarBrigadistas({
  actividadId,
  estatus,
  puedeInvitar,
}: {
  actividadId: string;
  estatus: EstatusActividad;
  /** Cosmética. La reja de verdad es la política `ab_admin`, que solo deja al admin. */
  puedeInvitar: boolean;
}) {
  const [invitados, setInvitados] = useState<Brigadista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hoja, setHoja] = useState(false);
  const [candidatos, setCandidatos] = useState<UsuarioBreve[]>([]);
  const [filtro, setFiltro] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const cerrada = estatus === "realizada" || estatus === "cancelada";

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await brigadistasDeActividad(actividadId);
      if (!vivo) return;
      setInvitados(r.datos);
      setError(r.aviso);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [actividadId, version]);

  async function abrirHoja() {
    setError(null);
    const r = await brigadistasInvitables(invitados.map((i) => i.usuario_id));
    setCandidatos(r.datos);
    if (r.aviso) setError(r.aviso);
    setHoja(true);
  }

  async function invitar(usuarioId: string) {
    const r = await agregarBrigadista(actividadId, usuarioId);
    if (r.aviso) {
      setError(r.aviso);
      return;
    }
    setHoja(false);
    setFiltro("");
    setVersion((v) => v + 1);
  }

  async function quitar(usuarioId: string) {
    const r = await quitarBrigadista(actividadId, usuarioId);
    if (r.aviso) {
      setError(r.aviso);
      return;
    }
    setVersion((v) => v + 1);
  }

  const visibles = candidatos.filter((c) =>
    c.nombre.toLowerCase().includes(filtro.trim().toLowerCase()),
  );

  return (
    <Tarjeta
      titulo="Brigadistas invitados"
      accion={
        puedeInvitar && !cerrada ? (
          <button
            type="button"
            onClick={abrirHoja}
            className="transicion-ui flex items-center gap-1.5 rounded-control px-2 text-sm text-naranja-texto transition-colors hover:bg-superficie-hundida"
            style={{ minHeight: 32 }}
          >
            <UserPlus className="size-4" aria-hidden />
            Invitar
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {cerrada ? (
          <p className="medida text-sm text-tinta-suave">
            Esta actividad está cerrada. Los brigadistas invitados ya no la ven ni pueden corregir
            lo que capturaron.
            {estatus === "cancelada"
              ? " Si alguien necesita corregir capturas, reprográmala."
              : " Las correcciones las hace el administrador general."}
          </p>
        ) : (
          <p className="medida text-sm text-tinta-suave">
            Invitar es dar permiso. Un brigadista solo ve esta actividad y las personas que se
            capturen en ella, y solo mientras siga programada o en curso.
          </p>
        )}

        {cargando ? (
          <div className="h-8 animate-pulse rounded-control bg-superficie-hundida" />
        ) : invitados.length === 0 ? (
          <p className="flex items-start gap-2 text-sm text-alerta">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="medida">
              Nadie está invitado todavía. Sin invitación, un brigadista entra y no ve nada.
            </span>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {invitados.map((i) => (
              <li
                key={i.usuario_id}
                className="flex items-center gap-1 rounded-pildora border border-borde bg-superficie px-3 py-1 text-sm text-tinta"
              >
                {i.nombre}
                {puedeInvitar && !cerrada && (
                  <button
                    type="button"
                    onClick={() => quitar(i.usuario_id)}
                    title={`Quitar a ${i.nombre}`}
                    className="transicion-ui ml-1 rounded-pildora p-1 text-tinta-tenue transition-colors hover:text-alerta"
                  >
                    <X className="size-3.5" aria-hidden />
                    <span className="sr-only">Quitar a {i.nombre}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {puedeInvitar && !cerrada && invitados.length > 0 && (
          <p className="medida text-xs text-tinta-tenue">
            Si quitas a alguien, deja de ver esta actividad y las personas que capturó aquí. Lo
            capturado no se borra.
          </p>
        )}

        {error && (
          <p role="alert" className="medida text-sm text-alerta">
            {error}
          </p>
        )}
      </div>

      <Hoja titulo="Invitar brigadistas" abierta={hoja} alCerrar={() => setHoja(false)}>
        <div className="flex flex-col gap-3">
          <input
            className="campo"
            placeholder="Buscar por nombre"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />

          {visibles.length === 0 ? (
            <p className="medida text-sm text-tinta-suave">
              {candidatos.length === 0
                ? "No hay brigadistas activos sin invitar. Se dan de alta en la pantalla de Usuarios."
                : "Ningún brigadista coincide con esa búsqueda."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {visibles.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => invitar(c.id)}
                    className={`transicion-ui toque-actividad flex w-full items-center px-1 text-left text-sm text-tinta transition-colors hover:bg-superficie-hundida ${
                      i > 0 ? "border-t border-borde" : ""
                    }`}
                  >
                    {c.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Hoja>
    </Tarjeta>
  );
}
