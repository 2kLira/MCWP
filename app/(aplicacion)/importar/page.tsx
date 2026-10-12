"use client";

import { useState } from "react";
import { Download, Upload, UserCheck, UserPlus, UserX } from "lucide-react";
import { EncabezadoPagina } from "@/components/sistema/encabezado-pagina";
import { TarjetaCifra } from "@/components/sistema/tarjeta-cifra";
import { cn } from "@/lib/utils";
import { useActuante } from "@/components/proveedor-actuante";
import { descargarCsv } from "@/lib/csv";
import {
  PLANTILLA_PROMOVIDOS,
  revisarArchivo,
  aplicarImportacion,
  type Revision,
  type RenglonRevisado,
  type SaldoImportacion,
} from "@/lib/datos/importacion";
import { PortonAgenda } from "@/components/porton-agenda";
import { puedeImportar, puedeVerListadosGenerales } from "@/lib/puertas-ui";

/** Cuántos renglones se pintan por montón antes de resumir el resto con "y N más". */
const MAX_VISIBLES = 5;

type Momento = "elegir" | "previsualizar" | "saldo";

/**
 * Valor de ejemplo por columna, para el renglón de muestra de la plantilla descargable. El
 * teléfono cae dentro del rango sembrado del proyecto (951 100 0000 a 951 100 9999): ni en un
 * ejemplo se genera un patrón distinto.
 */
function valorEjemplo(llave: string): string {
  if (llave.includes("telefono")) return "951 100 0001";
  if (llave.includes("nombre")) return "María López García";
  if (llave.includes("seccion")) return "0450";
  if (llave.includes("genero")) return "mujer";
  if (llave.includes("nacimiento")) return "1990-05-14";
  if (llave.includes("calle") || llave.includes("direccion")) return "Calle Hidalgo 12";
  return "";
}

function descargarPlantilla() {
  const columnas = PLANTILLA_PROMOVIDOS.map((c) => ({ llave: c.llave, etiqueta: c.etiqueta }));
  const ejemplo = Object.fromEntries(
    PLANTILLA_PROMOVIDOS.map((c) => [c.llave, valorEjemplo(c.llave)]),
  );
  descargarCsv("plantilla_promovidos", columnas, [ejemplo]);
}

export default function Importar() {
  const { actuante } = useActuante();
  const [momento, setMomento] = useState<Momento>("elegir");
  const [revisando, setRevisando] = useState(false);
  const [columnasFaltantes, setColumnasFaltantes] = useState<string[] | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<SaldoImportacion | null>(null);

  // Dos portones, no uno, porque son dos conversaciones distintas. Al responsable de sección se
  // le dice que esta pantalla es de otro rol, porque el resto del sistema sí es suyo. Al
  // brigadista se le devuelve a su agenda, porque es lo único que tiene.
  if (!puedeVerListadosGenerales(actuante)) {
    return <PortonAgenda titulo="Carga masiva" />;
  }

  if (!puedeImportar(actuante)) {
    return (
      <section className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Carga masiva" />
        <p className="medida text-sm text-tinta-suave">
          La carga masiva de promovidos la hacen el administrador general y los responsables de
          demarcación. Cambia de rol en el conmutador para verla.
        </p>
      </section>
    );
  }

  async function elegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    // Se limpia de inmediato para poder volver a elegir el mismo archivo tras corregirlo.
    evento.target.value = "";
    if (!archivo) return;

    setColumnasFaltantes(null);
    setAviso(null);
    setRevisando(true);
    const texto = await archivo.text();
    const resultado = await revisarArchivo(actuante, archivo.name, texto);
    setRevisando(false);

    if (resultado.aviso) {
      setAviso(resultado.aviso);
      return;
    }
    if (!resultado.datos) return;

    if (resultado.datos.columnasFaltantes.length > 0) {
      setColumnasFaltantes(resultado.datos.columnasFaltantes);
      return;
    }

    setRevision(resultado.datos);
    setMomento("previsualizar");
  }

  function cancelar() {
    setRevision(null);
    setColumnasFaltantes(null);
    setAviso(null);
    setMomento("elegir");
  }

  async function importar() {
    if (!revision) return;
    setImportando(true);
    setAviso(null);
    const resultado = await aplicarImportacion(actuante, revision);
    setImportando(false);

    if (resultado.aviso) setAviso(resultado.aviso);
    if (resultado.datos) {
      setSaldo(resultado.datos);
      setRevision(null);
      setMomento("saldo");
    }
  }

  function cargarOtro() {
    setSaldo(null);
    setAviso(null);
    setMomento("elegir");
  }

  return (
    <section className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Carga masiva de promovidos"
        apoyo="Sube un csv con varios promovidos a la vez. Antes de guardar nada, el sistema revisa el archivo completo y muestra qué se va a crear, qué ya existe y qué se rechaza."
      />

      {momento === "elegir" && (
        <MomentoElegir
          revisando={revisando}
          columnasFaltantes={columnasFaltantes}
          aviso={aviso}
          onElegir={elegirArchivo}
        />
      )}

      {momento === "previsualizar" && revision && (
        <MomentoPrevisualizar
          revision={revision}
          importando={importando}
          aviso={aviso}
          onImportar={importar}
          onCancelar={cancelar}
        />
      )}

      {momento === "saldo" && saldo && <MomentoSaldo saldo={saldo} onCargarOtro={cargarOtro} />}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Momento uno: elegir archivo
 * ------------------------------------------------------------------------- */

function MomentoElegir({
  revisando,
  columnasFaltantes,
  aviso,
  onElegir,
}: {
  revisando: boolean;
  columnasFaltantes: string[] | null;
  aviso: string | null;
  onElegir: (evento: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={descargarPlantilla} className="boton">
          <Download className="size-4" aria-hidden />
          Descargar plantilla
        </button>

        {/* El control sigue siendo el input de archivo: la etiqueta lo envuelve y lo viste de
            botón. Se esconde a la vista, no al teclado ni al lector de pantalla. */}
        <label
          className={cn(
            "boton-primario cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-tinta",
            revisando && "pointer-events-none opacity-50",
          )}
        >
          <Upload className="size-4" aria-hidden />
          Subir archivo
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onElegir}
            disabled={revisando}
            className="sr-only"
          />
        </label>
      </div>

      {revisando && <p className="text-sm text-tinta-suave">Revisando el archivo…</p>}

      {columnasFaltantes && columnasFaltantes.length > 0 && (
        <p className="text-sm text-alerta">
          Faltan estas columnas: {columnasFaltantes.join(", ")}. Corrige el archivo y vuelve a
          subirlo.
        </p>
      )}

      {aviso && <p className="text-sm text-alerta">{aviso}</p>}

      <div className="tarjeta overflow-x-auto">
        <table className="tabla min-w-[28rem]">
          <thead>
            <tr>
              <th>Columna</th>
              <th>Obligatoria</th>
              <th>Para qué sirve</th>
            </tr>
          </thead>
          <tbody>
            {PLANTILLA_PROMOVIDOS.map((c) => (
              <tr key={c.llave}>
                <td className="text-tinta">{c.etiqueta}</td>
                <td className="text-tinta-suave">{c.obligatoria ? "Sí" : "No"}</td>
                <td className="text-tinta-suave">{c.ayuda}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Momento dos: previsualización
 * ------------------------------------------------------------------------- */

function MomentoPrevisualizar({
  revision,
  importando,
  aviso,
  onImportar,
  onCancelar,
}: {
  revision: Revision;
  importando: boolean;
  aviso: string | null;
  onImportar: () => void;
  onCancelar: () => void;
}) {
  const totalImportar = revision.nuevas.length + revision.actualizar.length;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-tinta-suave">
        Archivo <span className="text-tinta">{revision.archivo}</span>. Nada se ha guardado
        todavía.
      </p>

      {/* Los tres conteos arriba, con lo que le va a pasar a cada grupo; el detalle renglón por
          renglón va abajo, en el mismo orden. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaCifra
          icono={UserPlus}
          etiqueta="Nuevas"
          valor={revision.nuevas.length}
          pie="Se van a crear como promovidos nuevos."
        />
        <TarjetaCifra
          icono={UserCheck}
          etiqueta="Ya existen"
          valor={revision.actualizar.length}
          pie="Ya están en el padrón: se les va a marcar promovido, sin tocarles ningún otro dato."
        />
        <TarjetaCifra
          icono={UserX}
          etiqueta="Rechazadas"
          valor={revision.rechazadas.length}
          pie="No se van a importar. Corrígelas en el archivo."
        />
      </div>

      <MontonPersonas titulo="Nuevas" renglones={revision.nuevas} />

      <MontonPersonas titulo="Ya existen" renglones={revision.actualizar} />

      <MontonRechazadas renglones={revision.rechazadas} />

      {aviso && <p className="text-sm text-alerta">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2.5">
        {totalImportar > 0 && (
          <button
            type="button"
            onClick={onImportar}
            disabled={importando}
            className="boton-primario max-sm:w-full"
          >
            {importando ? "Importando…" : `Importar ${totalImportar} promovidos`}
          </button>
        )}
        <button
          type="button"
          onClick={onCancelar}
          disabled={importando}
          className="boton max-sm:w-full"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function MontonPersonas({
  titulo,
  renglones,
}: {
  titulo: string;
  renglones: readonly RenglonRevisado[];
}) {
  const visibles = renglones.slice(0, MAX_VISIBLES);
  const restantes = renglones.length - visibles.length;

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>

      <div className="tarjeta overflow-hidden">
        {renglones.length === 0 ? (
          <p className="px-4 py-3 text-sm text-tinta-tenue">Ninguno.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[28rem]">
              <thead>
                <tr>
                  <th className="num">Renglón</th>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Sección</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.numero}>
                    <td className="num text-tinta-suave">{r.numero}</td>
                    <td className="text-tinta">{r.nombre}</td>
                    <td className="cifras text-tinta-suave">{r.telefonoNorm ?? "—"}</td>
                    <td className="cifras text-tinta-suave">{r.seccionClave ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {restantes > 0 && (
          <p className="cifras border-t border-separador px-4 py-2.5 text-xs text-tinta-tenue">
            Y {restantes} más.
          </p>
        )}
      </div>
    </div>
  );
}

function MontonRechazadas({ renglones }: { renglones: readonly RenglonRevisado[] }) {
  const visibles = renglones.slice(0, MAX_VISIBLES);
  const restantes = renglones.length - visibles.length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="text-sm font-semibold text-tinta">Rechazadas</h2>
        {renglones.length > 0 && (
          <button
            type="button"
            onClick={() =>
              descargarCsv(
                "promovidos_rechazados",
                [
                  { llave: "numero", etiqueta: "Renglón" },
                  { llave: "nombre", etiqueta: "Nombre" },
                  { llave: "motivo", etiqueta: "Motivo" },
                ],
                renglones.map((r) => ({
                  numero: r.numero,
                  nombre: r.nombre,
                  motivo: r.motivo ?? "",
                })),
              )
            }
            className="boton"
          >
            <Download className="size-4" aria-hidden />
            Descargar rechazados
          </button>
        )}
      </div>

      <div className="tarjeta overflow-hidden">
        {renglones.length === 0 ? (
          <p className="px-4 py-3 text-sm text-tinta-tenue">Ninguna.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[28rem]">
              <thead>
                <tr>
                  <th className="num">Renglón</th>
                  <th>Nombre</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.numero}>
                    <td className="num text-tinta-suave">{r.numero}</td>
                    <td className="text-tinta">{r.nombre}</td>
                    <td className="text-alerta">{r.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {restantes > 0 && (
          <p className="cifras border-t border-separador px-4 py-2.5 text-xs text-tinta-tenue">
            Y {restantes} más.
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Momento tres: saldo
 * ------------------------------------------------------------------------- */

function MomentoSaldo({
  saldo,
  onCargarOtro,
}: {
  saldo: SaldoImportacion;
  onCargarOtro: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaCifra icono={UserPlus} etiqueta="Nuevas" valor={saldo.nuevas} />
        <TarjetaCifra icono={UserCheck} etiqueta="Actualizadas" valor={saldo.actualizadas} />
        <TarjetaCifra icono={UserX} etiqueta="Rechazadas" valor={saldo.rechazadas} />
      </div>

      <button type="button" onClick={onCargarOtro} className="boton w-fit">
        Cargar otro archivo
      </button>
    </div>
  );
}
