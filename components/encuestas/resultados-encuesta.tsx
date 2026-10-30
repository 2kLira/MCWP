"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Download, MessageSquareText, Pencil, UserPlus, Users } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { Estado } from "@/components/sistema/estado";
import { TarjetaCifra } from "@/components/sistema/tarjeta-cifra";
import { Tarjeta } from "@/components/tablero/tarjeta";
import { TarjetaQr } from "@/components/encuestas/tarjeta-qr";
import { descargarCsv } from "@/lib/csv";
import { PUNTOS_ESCALA, type PreguntaEncuesta } from "@/lib/encuestas";
import {
  cambiarActivaEncuesta,
  conteosDeEncuesta,
  obtenerEncuesta,
  respuestasDeEncuesta,
  TOPE_RESPUESTAS,
  type ConteoOpcion,
  type EncuestaCompleta,
  type RespuestaEncuesta,
} from "@/lib/datos/encuestas";
import { formatearTelefono } from "@/lib/territorio";
import { useConsulta } from "@/lib/usar-consulta";

/** Respuestas de texto libre que se muestran por pregunta. El resto va en el CSV. */
const TEXTOS_VISIBLES = 30;

export function ResultadosEncuesta({ id }: { id: string }) {
  const { actuante } = useActuante();
  const [version, setVersion] = useState(0);
  const [cambiando, setCambiando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const encuesta = useConsulta<EncuestaCompleta | null>(
    () => obtenerEncuesta(actuante, id),
    null,
    [actuante.id, id, version],
  );
  const conteos = useConsulta<ConteoOpcion[]>(
    () => conteosDeEncuesta(actuante, id),
    [],
    [actuante.id, id, version],
  );
  const respuestas = useConsulta<RespuestaEncuesta[]>(
    () => respuestasDeEncuesta(actuante, id),
    [],
    [actuante.id, id, version],
  );

  const conteoDe = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const c of conteos.datos) {
      if (!m.has(c.pregunta_id)) m.set(c.pregunta_id, new Map());
      m.get(c.pregunta_id)!.set(c.valor, c.total);
    }
    return m;
  }, [conteos.datos]);

  const e = encuesta.datos;

  if (encuesta.cargando && !e) {
    return (
      <div className="flex flex-col gap-5">
        <div className="esqueleto h-16 w-2/3 rounded-[var(--radio-control)]" />
        <div className="esqueleto h-72 rounded-[var(--radio-tarjeta)]" />
      </div>
    );
  }

  if (!e) {
    return (
      <section className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Encuesta" volver={{ href: "/encuestas", etiqueta: "Encuestas" }} />
        <p className="text-sm text-tinta-suave">{encuesta.aviso ?? "Esta encuesta no existe."}</p>
      </section>
    );
  }

  const r = e.resumen;
  const yaRegistrados = respuestas.datos.filter((x) => x.telefono_ya_registrado).length;

  const alternar = async () => {
    setCambiando(true);
    setAviso(null);
    const res = await cambiarActivaEncuesta(e.id, !e.activa);
    if (res.aviso) setAviso(res.aviso);
    setCambiando(false);
    setVersion((v) => v + 1);
  };

  const exportar = () => {
    const columnas = [
      { llave: "fecha", etiqueta: "Fecha" },
      ...(e.incluye_registro
        ? [
            { llave: "nombre", etiqueta: "Nombre" },
            { llave: "telefono", etiqueta: "Teléfono" },
            { llave: "ya_registrado", etiqueta: "Teléfono ya registrado" },
          ]
        : []),
      { llave: "seccion", etiqueta: "Sección" },
      ...e.preguntas.map((p) => ({ llave: p.id, etiqueta: p.texto })),
    ];
    const filas = respuestas.datos.map((x) => {
      const fila: Record<string, unknown> = {
        fecha: new Date(x.created_at).toLocaleString("es-MX"),
        nombre: x.persona?.nombre ?? "",
        telefono: x.persona?.telefono_norm ?? "",
        ya_registrado: x.telefono_ya_registrado ? "Sí" : "No",
        seccion: x.seccion_clave ?? "",
      };
      for (const p of e.preguntas) fila[p.id] = textoDeRespuesta(p, x.respuestas[p.id]);
      return fila;
    });
    descargarCsv(`encuesta-${e.codigo}`, columnas, filas);
  };

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo={e.titulo}
        volver={{ href: "/encuestas", etiqueta: "Encuestas" }}
        apoyo={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Estado vivo={e.activa}>{e.activa ? "Recibiendo respuestas" : "Cerrada"}</Estado>
            <span>{e.incluye_registro ? "Con registro de datos" : "Sin registro de datos"}</span>
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Link href={`/encuestas/${e.id}/editar`} className="boton">
          <Pencil className="size-4" aria-hidden />
          Editar
        </Link>
        <button type="button" onClick={alternar} disabled={cambiando} className="boton">
          {e.activa ? "Cerrar encuesta" : "Volver a abrir"}
        </button>
        <button
          type="button"
          onClick={exportar}
          disabled={respuestas.datos.length === 0}
          className="boton sm:ml-auto"
        >
          <Download className="size-4" aria-hidden />
          Descargar respuestas
        </button>
      </div>

      {aviso && (
        <p role="alert" className="text-sm text-alerta">
          {aviso}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <TarjetaQr codigo={e.codigo} titulo={e.titulo} activa={e.activa} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TarjetaCifra
              icono={MessageSquareText}
              etiqueta="Respuestas"
              valor={r?.respuestas ?? 0}
              pie={
                r?.ultima_respuesta
                  ? `Última hace ${formatDistanceToNowStrict(new Date(r.ultima_respuesta), { locale: es })}`
                  : "Todavía ninguna"
              }
            />
            {e.incluye_registro && (
              <>
                <TarjetaCifra
                  icono={Users}
                  etiqueta="Dejaron sus datos"
                  valor={r?.con_datos ?? 0}
                />
                <TarjetaCifra
                  icono={UserPlus}
                  etiqueta="Personas nuevas en el padrón"
                  valor={r?.personas_nuevas ?? 0}
                  pie={
                    yaRegistrados > 0
                      ? `${yaRegistrados} con teléfono ya registrado: su ficha no se tocó`
                      : undefined
                  }
                />
              </>
            )}
          </div>

          {e.preguntas.map((p, i) => (
            <Tarjeta key={p.id} titulo={`${i + 1}. ${p.texto}`}>
              {p.tipo === "texto" ? (
                <RespuestasTexto pregunta={p} respuestas={respuestas.datos} />
              ) : p.tipo === "escala" ? (
                <Escala conteo={conteoDe.get(p.id)} />
              ) : (
                <Opciones pregunta={p} conteo={conteoDe.get(p.id)} />
              )}
            </Tarjeta>
          ))}

          {respuestas.datos.length >= TOPE_RESPUESTAS && (
            <p className="text-xs text-tinta-tenue">
              Las gráficas cuentan todas las respuestas. El texto libre y la descarga traen las{" "}
              {TOPE_RESPUESTAS.toLocaleString("es-MX")} más recientes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function textoDeRespuesta(p: PreguntaEncuesta, valor: unknown): string {
  if (valor === undefined || valor === null) return "";
  if (p.tipo === "opcion_unica" || p.tipo === "opcion_multiple") {
    const ids = Array.isArray(valor) ? valor : [valor];
    return ids
      .map((id) => p.opciones.find((o) => o.id === id)?.texto ?? String(id))
      .join("; ");
  }
  return String(valor);
}

/**
 * Barras de HTML y no de Recharts: las etiquetas son frases que escribe el administrador y en
 * 390 px un eje de categorías las corta. Aquí envuelven. Una sola barra naranja, la que más
 * votos tiene; las demás en neutro, igual que en Reportes.
 */
function Opciones({
  pregunta,
  conteo,
}: {
  pregunta: PreguntaEncuesta;
  conteo: Map<string, number> | undefined;
}) {
  const filas = pregunta.opciones.map((o) => ({ ...o, total: conteo?.get(o.id) ?? 0 }));
  const suma = filas.reduce((s, f) => s + f.total, 0);
  const maximo = Math.max(0, ...filas.map((f) => f.total));

  if (suma === 0) return <p className="text-sm text-tinta-tenue">Sin respuestas todavía.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {filas.map((f, i) => {
        const lider = f.total === maximo && maximo > 0;
        return (
          <li key={f.id} className="entrada flex flex-col gap-1.5" style={{ "--retraso": `${i * 50}ms` } as React.CSSProperties}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-tinta">{f.texto}</span>
              <span className="cifras shrink-0 text-tinta-suave">
                <span className="font-semibold text-tinta">{f.total.toLocaleString("es-MX")}</span>
                {/* En varias opciones las marcas suman más que las personas: solo la cifra. */}
                {pregunta.tipo === "opcion_unica" && (
                  <span className="ml-1.5">{Math.round((f.total / suma) * 100)} %</span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--superficie-hundida)]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-[var(--curva)]"
                style={{
                  width: `${maximo ? (f.total / maximo) * 100 : 0}%`,
                  background: lider ? "var(--naranja)" : "var(--tinta-tenue)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Escala({ conteo }: { conteo: Map<string, number> | undefined }) {
  const filas = PUNTOS_ESCALA.map((n) => ({ n, total: conteo?.get(String(n)) ?? 0 }));
  const suma = filas.reduce((s, f) => s + f.total, 0);
  const maximo = Math.max(0, ...filas.map((f) => f.total));
  if (suma === 0) return <p className="text-sm text-tinta-tenue">Sin respuestas todavía.</p>;
  const promedio = filas.reduce((s, f) => s + f.n * f.total, 0) / suma;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-tinta-suave">
        Promedio{" "}
        <span className="cifras text-[1.375rem] font-semibold text-tinta">
          {promedio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}
        </span>{" "}
        de 5
      </p>
      <div className="grid h-40 grid-cols-5 items-end gap-2">
        {filas.map((f) => (
          <div key={f.n} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className="cifras text-xs text-tinta-suave">{f.total}</span>
            <div
              className="w-full rounded-t-md transition-[height] duration-700"
              style={{
                height: `${maximo ? Math.max((f.total / maximo) * 100, f.total ? 4 : 0) : 0}%`,
                background: f.total === maximo ? "var(--naranja)" : "var(--tinta-tenue)",
              }}
            />
            <span className="cifras text-sm font-medium text-tinta">{f.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RespuestasTexto({
  pregunta,
  respuestas,
}: {
  pregunta: PreguntaEncuesta;
  respuestas: RespuestaEncuesta[];
}) {
  const textos = respuestas
    .map((r) => ({ r, texto: r.respuestas[pregunta.id] }))
    .filter((x): x is { r: RespuestaEncuesta; texto: string } => typeof x.texto === "string" && x.texto !== "");

  if (textos.length === 0) return <p className="text-sm text-tinta-tenue">Sin respuestas todavía.</p>;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {textos.slice(0, TEXTOS_VISIBLES).map(({ r, texto }) => (
          <li
            key={r.id}
            className="rounded-[var(--radio-control)] bg-[var(--superficie-hundida)] px-3 py-2 text-sm"
          >
            <p className="whitespace-pre-line text-tinta">{texto}</p>
            <p className="mt-1 text-xs text-tinta-tenue">
              {r.persona
                ? `${r.persona.nombre} · ${formatearTelefono(r.persona.telefono_norm)}`
                : "Sin datos"}{" "}
              · hace {formatDistanceToNowStrict(new Date(r.created_at), { locale: es })}
            </p>
          </li>
        ))}
      </ul>
      {textos.length > TEXTOS_VISIBLES && (
        <p className="text-xs text-tinta-tenue">
          {textos.length - TEXTOS_VISIBLES} más en la descarga.
        </p>
      )}
    </div>
  );
}
