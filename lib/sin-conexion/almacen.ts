/**
 * El almacén del teléfono: una base IndexedDB con un solo depósito, `capturas`.
 *
 * IndexedDB y no localStorage porque esto guarda capturas completas de personas reales mientras
 * no hay señal: localStorage tiene un tope de unos 5 MB por origen, es sincrónico y bloquea la
 * pantalla, y Safari lo vacía con más ganas. IndexedDB tampoco es eterno —ver la entrada de
 * PENDIENTES.md sobre iPhone y la app instalada—, pero es lo más firme que da el navegador.
 *
 * Sin librería a propósito (CLAUDE.md: nada de motores de sincronización). Son cuatro operaciones
 * y caben aquí.
 */

const NOMBRE_BASE = "soet";
const VERSION_BASE = 1;
const DEPOSITO = "capturas";

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (abierta) return abierta;
  abierta = new Promise<IDBDatabase>((resolver, rechazar) => {
    if (typeof indexedDB === "undefined") {
      rechazar(new Error("Este navegador no puede guardar capturas en el teléfono."));
      return;
    }
    const peticion = indexedDB.open(NOMBRE_BASE, VERSION_BASE);
    peticion.onupgradeneeded = () => {
      const base = peticion.result;
      if (!base.objectStoreNames.contains(DEPOSITO)) {
        const deposito = base.createObjectStore(DEPOSITO, { keyPath: "id" });
        deposito.createIndex("usuario", "usuarioId");
      }
    };
    peticion.onsuccess = () => {
      const base = peticion.result;
      // Si otra pestaña sube la versión, esta suelta la conexión en vez de bloquearla.
      base.onversionchange = () => {
        base.close();
        abierta = null;
      };
      resolver(base);
    };
    peticion.onerror = () => {
      abierta = null;
      rechazar(peticion.error ?? new Error("No se pudo abrir el almacén del teléfono."));
    };
  });
  return abierta;
}

/** Corre una operación y espera a que la transacción **termine**, no solo a que la petición conteste. */
async function operar<T>(
  modo: IDBTransactionMode,
  hacer: (deposito: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await abrir();
  return new Promise<T>((resolver, rechazar) => {
    const transaccion = base.transaction(DEPOSITO, modo);
    const peticion = hacer(transaccion.objectStore(DEPOSITO));
    // Se resuelve en `oncomplete`: hasta ahí no está garantizado que lo escrito quedó en disco, y
    // eso es justo lo que se le promete al brigadista cuando ve "guardada en este teléfono".
    transaccion.oncomplete = () => resolver(peticion.result);
    transaccion.onerror = () => rechazar(transaccion.error ?? peticion.error);
    transaccion.onabort = () => rechazar(transaccion.error ?? new Error("Se canceló la escritura."));
  });
}

export function guardarEnAlmacen<T extends { id: string; usuarioId: string }>(
  registro: T,
): Promise<IDBValidKey> {
  return operar("readwrite", (d) => d.put(registro));
}

export function leerDelAlmacen<T>(id: string): Promise<T | undefined> {
  return operar("readonly", (d) => d.get(id) as IDBRequest<T | undefined>);
}

export function borrarDelAlmacen(id: string): Promise<undefined> {
  return operar("readwrite", (d) => d.delete(id));
}

/** Todo lo de un usuario. Las capturas de otra cuenta en el mismo teléfono no se ven ni se envían. */
export function delUsuario<T>(usuarioId: string): Promise<T[]> {
  return operar("readonly", (d) => d.index("usuario").getAll(usuarioId) as IDBRequest<T[]>);
}
