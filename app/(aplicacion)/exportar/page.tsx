"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, ShieldAlert, Table } from "lucide-react";
import { Caja } from "@/components/sistema/caja";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
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
      <section className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Exportar a Excel" />
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
      <EncabezadoPagina
        titulo="Exportar a Excel"
        apoyo={
          <>
            Baja la información en un archivo que abre directo en Excel, Google Sheets o Numbers.
            Cada tabla viene en su propia hoja, con filtros y fechas listas para ordenar.
            {!esAdmin(actuante) && " Solo incluye lo de tu demarcación."}
          </>
        }
      />

      <div className="flex w-full max-w-[47.5rem] flex-col gap-4">
        <Caja icono={FileSpreadsheet} titulo="Todo en un solo archivo">
          <p className="text-sm text-tinta-suave">
            {tablas.length} hojas: {tablas.map((t) => t.titulo).join(", ")}.
          </p>
          <button
            type="button"
            onClick={() => bajar("todo", tablas, "soet")}
            disabled={bajando !== null}
            className="boton-primario mt-3.5 max-sm:w-full"
          >
            {bajando === "todo" ? (
              <>
                Armando el archivo…
              </>
            ) : (
              <>
                <Download className="size-4" aria-hidden />
                Descargar todo
              </>
            )}
          </button>
        </Caja>

        {aviso && (
          <p
            role="status"
            className={`text-sm ${aviso.tono === "error" ? "text-alerta" : "text-tinta-suave"}`}
          >
            {aviso.texto}
          </p>
        )}

        <Caja icono={Table} titulo="O una tabla a la vez">
          <ul className="divide-y divide-separador">
            {tablas.map((t) => (
              <li key={t.clave} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-tinta">{t.titulo}</p>
                  <p className="text-[0.78125rem] text-tinta-suave">{t.descripcion}</p>
                </div>
                <button
                  type="button"
                  onClick={() => bajar(t.clave, [t], t.clave)}
                  disabled={bajando !== null}
                  aria-label={`Descargar ${t.titulo}`}
                  className="boton shrink-0 max-sm:w-11 max-sm:px-0"
                >
                  <Download
                    className={cn("size-4", bajando === t.clave && "animate-pulse")}
                    aria-hidden
                  />
                  <span className="max-sm:hidden">Descargar</span>
                </button>
              </li>
            ))}
          </ul>
        </Caja>

        <p className="medida flex items-start gap-2 text-xs text-tinta-suave">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          El archivo trae datos personales y, ya descargado, el sistema no lo puede proteger. No lo
          mandes por WhatsApp ni lo dejes en computadoras compartidas.
        </p>
      </div>
    </section>
  );
}
