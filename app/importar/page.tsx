"use client";

import { useState } from "react";
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
import { puedeImportar } from "@/lib/permisos";

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

  if (!puedeImportar(actuante)) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-xl">Carga masiva</h1>
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
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-xl">Carga masiva de promovidos</h1>
        <p className="medida text-sm text-tinta-suave">
          Sube un csv con varios promovidos a la vez. Antes de guardar nada, el sistema revisa el
          archivo completo y muestra qué se va a crear, qué ya existe y qué se rechaza.
        </p>
      </header>

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
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={descargarPlantilla}
        className="transicion-ui w-fit rounded-control border border-borde bg-superficie px-4 text-sm font-medium text-tinta toque-actividad"
      >
        Descargar plantilla
      </button>

      <div className="vidrio filo overflow-hidden rounded-tarjeta">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="px-4 py-3 font-medium">Columna</th>
                <th className="px-4 py-3 font-medium">Obligatoria</th>
                <th className="px-4 py-3 font-medium">Para qué sirve</th>
              </tr>
            </thead>
            <tbody>
              {PLANTILLA_PROMOVIDOS.map((c) => (
                <tr key={c.llave} className="border-t border-borde">
                  <td className="px-4 py-2 text-tinta">{c.etiqueta}</td>
                  <td className="px-4 py-2 text-tinta-suave">{c.obligatoria ? "Sí" : "No"}</td>
                  <td className="px-4 py-2 text-tinta-suave">{c.ayuda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <label className="flex flex-col gap-2 rounded-control border border-borde bg-superficie p-3 text-sm">
        <span className="font-medium text-tinta">Subir archivo</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onElegir}
          disabled={revisando}
          className="text-sm text-tinta-suave file:mr-3 file:rounded-control file:border-0 file:bg-naranja file:px-3 file:py-2 file:text-sm file:font-medium file:text-tinta disabled:opacity-50"
        />
      </label>

      {revisando && <p className="text-sm text-tinta-suave">Revisando el archivo…</p>}

      {columnasFaltantes && columnasFaltantes.length > 0 && (
        <p className="text-sm text-alerta">
          Faltan estas columnas: {columnasFaltantes.join(", ")}. Corrige el archivo y vuelve a
          subirlo.
        </p>
      )}

      {aviso && <p className="text-sm text-alerta">{aviso}</p>}
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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-suave">
        Archivo <span className="text-tinta">{revision.archivo}</span>. Nada se ha guardado
        todavía.
      </p>

      <MontonPersonas
        titulo="Nuevas"
        descripcion="Se van a crear como promovidos nuevos."
        renglones={revision.nuevas}
      />

      <MontonPersonas
        titulo="Ya existen"
        descripcion="Ya están en el padrón: se les va a marcar promovido, sin tocarles ningún otro dato."
        renglones={revision.actualizar}
      />

      <MontonRechazadas renglones={revision.rechazadas} />

      {aviso && <p className="text-sm text-alerta">{aviso}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onCancelar}
          disabled={importando}
          className="transicion-ui flex-1 rounded-control border border-borde bg-superficie text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
        >
          Cancelar
        </button>
        {totalImportar > 0 && (
          <button
            type="button"
            onClick={onImportar}
            disabled={importando}
            className="transicion-ui flex-1 rounded-control bg-naranja text-sm font-medium text-tinta toque-actividad disabled:opacity-50"
          >
            {importando ? "Importando…" : `Importar ${totalImportar} promovidos`}
          </button>
        )}
      </div>
    </div>
  );
}

function MontonPersonas({
  titulo,
  descripcion,
  renglones,
}: {
  titulo: string;
  descripcion: string;
  renglones: readonly RenglonRevisado[];
}) {
  const visibles = renglones.slice(0, MAX_VISIBLES);
  const restantes = renglones.length - visibles.length;

  return (
    <div className="vidrio filo overflow-hidden rounded-tarjeta">
      <div className="flex flex-col gap-1 border-b border-borde px-4 py-3">
        <h2 className="text-sm font-medium text-tinta">
          {titulo} <span className="cifras text-tinta-suave">({renglones.length})</span>
        </h2>
        <p className="text-xs text-tinta-suave">{descripcion}</p>
      </div>

      {renglones.length === 0 ? (
        <p className="px-4 py-3 text-sm text-tinta-tenue">Ninguno.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="px-4 py-2 font-medium">Renglón</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Sección</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.numero} className="border-t border-borde">
                  <td className="cifras px-4 py-2 text-tinta-suave">{r.numero}</td>
                  <td className="px-4 py-2 text-tinta">{r.nombre}</td>
                  <td className="cifras px-4 py-2 text-tinta-suave">{r.telefonoNorm ?? "—"}</td>
                  <td className="cifras px-4 py-2 text-tinta-suave">{r.seccionClave ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {restantes > 0 && (
        <p className="cifras border-t border-borde px-4 py-2 text-xs text-tinta-tenue">
          Y {restantes} más.
        </p>
      )}
    </div>
  );
}

function MontonRechazadas({ renglones }: { renglones: readonly RenglonRevisado[] }) {
  const visibles = renglones.slice(0, MAX_VISIBLES);
  const restantes = renglones.length - visibles.length;

  return (
    <div className="vidrio filo overflow-hidden rounded-tarjeta">
      <div className="flex items-center justify-between gap-3 border-b border-borde px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-tinta">
            Rechazadas <span className="cifras text-tinta-suave">({renglones.length})</span>
          </h2>
          <p className="text-xs text-tinta-suave">No se van a importar. Corrígelas en el archivo.</p>
        </div>
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
            className="transicion-ui shrink-0 rounded-control border border-borde bg-superficie px-3 text-xs font-medium text-tinta toque-actividad"
          >
            Descargar rechazados
          </button>
        )}
      </div>

      {renglones.length === 0 ? (
        <p className="px-4 py-3 text-sm text-tinta-tenue">Ninguna.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-tenue">
                <th className="px-4 py-2 font-medium">Renglón</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.numero} className="border-t border-borde">
                  <td className="cifras px-4 py-2 text-tinta-suave">{r.numero}</td>
                  <td className="px-4 py-2 text-tinta">{r.nombre}</td>
                  <td className="px-4 py-2 text-alerta">{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {restantes > 0 && (
        <p className="cifras border-t border-borde px-4 py-2 text-xs text-tinta-tenue">
          Y {restantes} más.
        </p>
      )}
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
    <div className="flex flex-col gap-4">
      <div className="vidrio filo grid grid-cols-3 divide-x divide-borde overflow-hidden rounded-tarjeta text-center">
        <div className="flex flex-col gap-1 px-3 py-4">
          <span className="cifras text-2xl font-medium text-tinta">{saldo.nuevas}</span>
          <span className="text-xs text-tinta-suave">Nuevas</span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-4">
          <span className="cifras text-2xl font-medium text-tinta">{saldo.actualizadas}</span>
          <span className="text-xs text-tinta-suave">Actualizadas</span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-4">
          <span className="cifras text-2xl font-medium text-tinta">{saldo.rechazadas}</span>
          <span className="text-xs text-tinta-suave">Rechazadas</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onCargarOtro}
        className="transicion-ui w-fit rounded-control border border-borde bg-superficie px-4 text-sm font-medium text-tinta toque-actividad"
      >
        Cargar otro archivo
      </button>
    </div>
  );
}
