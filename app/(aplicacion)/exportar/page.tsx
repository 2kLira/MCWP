"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { PortonAgenda } from "@/components/porton-agenda";
import { esAdmin, puedeExportar, puedeVerListadosGenerales } from "@/lib/puertas-ui";
import { descargarXlsx, type Hoja } from "@/lib/xlsx";
import { cn } from "@/lib/utils";
import {
  hojaActividades,
  hojaAsistencias,
  hojaPersonas,
  hojaProblematicas,
  hojaRepresentantes,
  hojaSeguimientos,
  hojaSolicitudes,
} from "@/lib/datos/exportar";

type Tabla = {
  clave: string;
  titulo: string;
  descripcion: string;
  armar: () => Promise<Hoja>;
  /** Seguimiento y representantes son solo del administrador por RLS: a otro rol le saldrían vacías. */
  soloAdmin?: boolean;
};

const TABLAS: Tabla[] = [
  {
    clave: "personas",
    titulo: "Personas",
    descripcion: "El padrón: datos de contacto, sección, intereses y quién la registró.",
    armar: hojaPersonas,
  },
  {
    clave: "actividades",
    titulo: "Actividades",
    descripcion: "Cada actividad con su responsable, asistentes, personas nuevas y conclusión.",
    armar: hojaActividades,
  },
  {
    clave: "asistencias",
    titulo: "Asistencias",
    descripcion: "Quién estuvo en qué actividad y quién lo capturó.",
    armar: hojaAsistencias,
  },
  {
    clave: "problematicas",
    titulo: "Problemáticas",
    descripcion: "Cada problemática mencionada, con su comentario, sección y actividad.",
    armar: hojaProblematicas,
  },
  {
    clave: "solicitudes",
    titulo: "Solicitudes",
    descripcion: "Lo que pidió la gente y si requiere seguimiento.",
    armar: hojaSolicitudes,
  },
  {
    clave: "seguimiento",
    titulo: "Seguimiento",
    descripcion: "Llamadas, mensajes y reuniones de seguimiento, con su estado.",
    armar: hojaSeguimientos,
    soloAdmin: true,
  },
  {
    clave: "representantes",
    titulo: "Representantes de casilla",
    descripcion: "Titulares y suplentes por casilla, con capacitación, manual y acreditación.",
    armar: hojaRepresentantes,
    soloAdmin: true,
  },
];

function hoyEnNombre(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export default function Exportar() {
  const { actuante } = useActuante();
  // Qué se está bajando ahora: "todo", la clave de una tabla, o nada.
  const [bajando, setBajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Exportar a Excel" />;
  }

  if (!puedeExportar(actuante)) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-xl">Exportar a Excel</h1>
        <p className="medida text-sm text-tinta-suave">
          La exportación la hacen el administrador general y los responsables de demarcación.
        </p>
      </section>
    );
  }

  const tablas = TABLAS.filter((t) => !t.soloAdmin || esAdmin(actuante));

  async function bajar(clave: string, cuales: Tabla[], nombreArchivo: string) {
    if (bajando) return;
    setBajando(clave);
    setAviso(null);
    try {
      const hojas = await Promise.all(cuales.map((t) => t.armar()));
      descargarXlsx(`${nombreArchivo}-${hoyEnNombre()}`, hojas);
      const renglones = hojas.reduce((suma, h) => suma + h.filas.length, 0);
      setAviso({
        tono: "ok",
        texto: `Listo: ${renglones.toLocaleString("es-MX")} ${renglones === 1 ? "renglón" : "renglones"} en ${hojas.length === 1 ? "1 hoja" : `${hojas.length} hojas`}. Revisa tus descargas.`,
      });
    } catch (e) {
      console.warn("No se pudo exportar:", e);
      setAviso({
        tono: "error",
        texto: "No se pudo armar el archivo. Revisa tu conexión e intenta de nuevo.",
      });
    } finally {
      setBajando(null);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl">Exportar a Excel</h1>
        <p className="medida text-sm text-tinta-suave">
          Baja la información en un archivo que abre directo en Excel, Google Sheets o Numbers.
          Cada tabla viene en su propia hoja, con filtros y fechas listas para ordenar.
          {!esAdmin(actuante) && " Solo incluye lo de tu demarcación."}
        </p>
      </header>

      <div className="vidrio filo flex flex-col gap-3 rounded-tarjeta p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-naranja-texto" aria-hidden />
          <div>
            <p className="text-base font-medium text-tinta">Todo en un solo archivo</p>
            <p className="text-sm text-tinta-suave">
              {tablas.length} hojas: {tablas.map((t) => t.titulo).join(", ")}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => bajar("todo", tablas, "soet")}
          disabled={bajando !== null}
          className="transicion-ui flex items-center justify-center gap-2 rounded-control bg-naranja text-base font-medium text-sobre-naranja toque-actividad disabled:opacity-50"
        >
          {bajando === "todo" ? (
            <>
              Armando el archivo…
            </>
          ) : (
            <>
              <Download className="size-5" aria-hidden />
              Descargar todo
            </>
          )}
        </button>
      </div>

      {aviso && (
        <p
          role="status"
          className={`text-sm ${aviso.tono === "error" ? "text-alerta" : "text-tinta-suave"}`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-tinta-suave">O una tabla a la vez</h2>
        <ul className="vidrio filo overflow-hidden rounded-tarjeta">
          {tablas.map((t, i) => (
            <li
              key={t.clave}
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-borde" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tinta">{t.titulo}</p>
                <p className="text-xs text-tinta-suave">{t.descripcion}</p>
              </div>
              <button
                type="button"
                onClick={() => bajar(t.clave, [t], t.clave)}
                disabled={bajando !== null}
                aria-label={`Descargar ${t.titulo}`}
                className="transicion-ui grid size-11 shrink-0 place-items-center rounded-control border border-borde text-tinta hover:bg-superficie-hundida disabled:opacity-50"
              >
                <Download
                  className={cn("size-5", bajando === t.clave && "animate-pulse")}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="medida flex items-start gap-2 text-xs text-tinta-tenue">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        El archivo trae datos personales y, ya descargado, el sistema no lo puede proteger. No lo
        mandes por WhatsApp ni lo dejes en computadoras compartidas.
      </p>
    </section>
  );
}
