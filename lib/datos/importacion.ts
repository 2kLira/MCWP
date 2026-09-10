/**
 * Carga masiva de promovidos, en dos etapas separadas a propósito: revisarArchivo lee y valida sin
 * escribir nada; aplicarImportacion escribe solo lo que ya se revisó y alguien confirmó. Ningún
 * renglón llega a la base sin pasar primero por la revisión.
 *
 * El recorte territorial de cada renglón sale de puedeVerSeccion, nunca de comparar ids a mano. El
 * catálogo de secciones se trae una sola vez y se resuelve todo contra un mapa en memoria: un
 * archivo de miles de renglones no puede disparar una consulta por renglón.
 */

import { leerCsv } from "@/lib/csv";
import { validarTelefonoMexicano } from "@/lib/territorio";
import { puedeImportar, puedeVerSeccion } from "@/lib/permisos";
import { GENEROS } from "@/lib/tipos";
import type { Genero, UsuarioActuante } from "@/lib/tipos";
import { db, lista, uno, resultado, type Resultado } from "@/lib/datos/cliente";

/* ---------------------------------------------------------------------------
 * Plantilla
 * ------------------------------------------------------------------------- */

export type ColumnaPlantilla = {
  llave: string;
  etiqueta: string;
  obligatoria: boolean;
  ayuda: string;
};

export const PLANTILLA_PROMOVIDOS: readonly ColumnaPlantilla[] = [
  {
    llave: "nombre",
    etiqueta: "Nombre",
    obligatoria: true,
    ayuda: "Nombre completo de la persona.",
  },
  {
    llave: "telefono",
    etiqueta: "Teléfono",
    obligatoria: true,
    ayuda: "Diez dígitos. Es la llave para saber si la persona ya está en la base.",
  },
  {
    llave: "seccion",
    etiqueta: "Sección",
    obligatoria: false,
    ayuda: "Clave de la sección electoral. Si se deja en blanco, la persona queda sin territorio.",
  },
  {
    llave: "calle",
    etiqueta: "Calle",
    obligatoria: false,
    ayuda: "Calle y número, como referencia.",
  },
  {
    llave: "colonia",
    etiqueta: "Colonia",
    obligatoria: false,
    ayuda:
      "Solo referencia: la colonia nunca es fuente de verdad territorial, así que no se guarda " +
      "en la ficha. Si hay duda de territorio, la resuelve la sección.",
  },
  {
    llave: "genero",
    etiqueta: "Género",
    obligatoria: false,
    ayuda: "Mujer, hombre, otro o prefiere no decir. Si no coincide con ninguno, se deja en blanco.",
  },
  {
    llave: "fecha_nacimiento",
    etiqueta: "Fecha de nacimiento",
    obligatoria: false,
    ayuda: "AAAA-MM-DD o DD/MM/AAAA. La persona debe ser mayor de edad.",
  },
];

/**
 * Nombres alternos que la gente escribe de verdad en el archivo, hacia la llave canónica de la
 * plantilla. Un mapa explícito, no adivinanzas por similitud de texto.
 */
const SINONIMOS_ENCABEZADO: Record<string, string> = {
  celular: "telefono",
  seccion_electoral: "seccion",
  nombre_completo: "nombre",
};

/** Empareja cada llave de la plantilla con el encabezado real del archivo, si aparece. */
function resolverColumnas(encabezados: string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const columna of PLANTILLA_PROMOVIDOS) {
    const directo = encabezados.find((e) => e === columna.llave);
    if (directo) {
      mapa.set(columna.llave, directo);
      continue;
    }
    const porSinonimo = encabezados.find((e) => SINONIMOS_ENCABEZADO[e] === columna.llave);
    if (porSinonimo) mapa.set(columna.llave, porSinonimo);
  }
  return mapa;
}

/* ---------------------------------------------------------------------------
 * Revisión
 * ------------------------------------------------------------------------- */

export type MotivoRechazo = string;

export type RenglonRevisado = {
  numero: number;
  nombre: string;
  telefonoNorm: string | null;
  seccionClave: string | null;
  demarcacionId: number | null;
  genero: string | null;
  fechaNacimiento: string | null;
  calle: string | null;
  destino: "nueva" | "actualizar" | "rechazada";
  personaExistenteId: string | null;
  motivo: MotivoRechazo | null;
};

export type Revision = {
  archivo: string;
  columnasFaltantes: string[];
  nuevas: RenglonRevisado[];
  actualizar: RenglonRevisado[];
  rechazadas: RenglonRevisado[];
};

/** Deja solo dígitos y rellena a cuatro posiciones, que es como se guardan las claves en `secciones`. */
function normalizarClaveSeccion(texto: string): string {
  return texto.replace(/\D/g, "").padStart(4, "0");
}

/** "Mujer" o " MUJER " deben caer en el mismo valor del enum que "mujer". */
function normalizarGenero(texto: string): Genero | null {
  const limpio = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  return (GENEROS as readonly string[]).includes(limpio) ? (limpio as Genero) : null;
}

/** Hoy a medianoche UTC, para comparar fechas de nacimiento sin que la hora del día estorbe. */
function fechaHoyUtc(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}

/**
 * Acepta AAAA-MM-DD (como lo guarda la base) y DD/MM/AAAA (como lo escribe la gente aquí). Cero
 * tolerancia a fechas que no cuadran, como el 31 de febrero: Date las corrige en silencio y por eso
 * se revisa que año, mes y día sobrevivan intactos.
 */
function parsearFechaNacimiento(texto: string): { fecha: Date; iso: string } | null {
  let anio: number, mes: number, dia: number;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const conBarras = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (iso) {
    anio = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else if (conBarras) {
    dia = Number(conBarras[1]);
    mes = Number(conBarras[2]);
    anio = Number(conBarras[3]);
  } else {
    return null;
  }

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const esValida =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  if (!esValida) return null;

  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return { fecha, iso: `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}` };
}

function calcularEdad(nacimiento: Date, hoy: Date): number {
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const noHaCumplidoAnos =
    hoy.getUTCMonth() < nacimiento.getUTCMonth() ||
    (hoy.getUTCMonth() === nacimiento.getUTCMonth() && hoy.getUTCDate() < nacimiento.getUTCDate());
  if (noHaCumplidoAnos) edad -= 1;
  return edad;
}

function trocear<T>(elementos: T[], tamano: number): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < elementos.length; i += tamano) {
    partes.push(elementos.slice(i, i + tamano));
  }
  return partes;
}

/**
 * Revisa un solo renglón contra el catálogo de secciones y el mapa de teléfonos ya vistos en este
 * mismo archivo. El orden de las comprobaciones es el que importa al capturista: nombre, forma del
 * teléfono, repetido en el archivo, existencia y territorio de la sección, y por último la fecha de
 * nacimiento. En cuanto una falla, ahí se detiene: no tiene caso seguir validando un renglón que ya
 * se va a rechazar.
 *
 * El teléfono se registra en `telefonosVistos` en cuanto pasa la validación de forma, no hasta el
 * final: así, si un renglón más adelante repite ese mismo teléfono, se rechaza como repetido aunque
 * este primer renglón termine rechazado por otra razón (por ejemplo, una sección fuera de
 * territorio). Ese primer renglón se queda con el reclamo del teléfono, tal como pide el spec.
 */
function revisarRenglon(
  numero: number,
  fila: Record<string, string>,
  columnas: Map<string, string>,
  usuario: UsuarioActuante | null,
  catalogoSecciones: Map<string, number>,
  telefonosVistos: Map<string, number>,
  hoy: Date,
): RenglonRevisado {
  const obtener = (llave: string): string => {
    const encabezado = columnas.get(llave);
    return encabezado ? (fila[encabezado] ?? "").trim() : "";
  };

  const nombre = obtener("nombre");
  const generoTexto = obtener("genero");

  const base = {
    numero,
    nombre,
    telefonoNorm: null as string | null,
    seccionClave: null as string | null,
    demarcacionId: null as number | null,
    genero: generoTexto ? normalizarGenero(generoTexto) : null,
    fechaNacimiento: null as string | null,
    calle: obtener("calle") || null,
  };

  const rechazar = (motivo: MotivoRechazo): RenglonRevisado => ({
    ...base,
    destino: "rechazada",
    personaExistenteId: null,
    motivo,
  });

  if (nombre === "") return rechazar("Falta el nombre.");

  const telefono = validarTelefonoMexicano(obtener("telefono"));
  if (!telefono.valido) return rechazar(telefono.motivo);
  base.telefonoNorm = telefono.normalizado;

  const primeraAparicion = telefonosVistos.get(telefono.normalizado);
  if (primeraAparicion !== undefined) {
    return rechazar(`El teléfono se repite en el renglón ${primeraAparicion} de este archivo.`);
  }
  telefonosVistos.set(telefono.normalizado, numero);

  const seccionTexto = obtener("seccion");
  if (seccionTexto !== "") {
    const clave = normalizarClaveSeccion(seccionTexto);
    const demarcacionId = catalogoSecciones.get(clave);
    if (demarcacionId === undefined) {
      return rechazar(`La sección ${clave} no existe en el catálogo.`);
    }
    if (!puedeVerSeccion(usuario, clave, demarcacionId)) {
      return rechazar(`La sección ${clave} no está en tu territorio.`);
    }
    base.seccionClave = clave;
    base.demarcacionId = demarcacionId;
  }

  const fechaTexto = obtener("fecha_nacimiento");
  if (fechaTexto !== "") {
    const nacimiento = parsearFechaNacimiento(fechaTexto);
    if (!nacimiento) {
      return rechazar("La fecha de nacimiento no se entiende: usa AAAA-MM-DD o DD/MM/AAAA.");
    }
    if (nacimiento.fecha.getTime() > hoy.getTime()) {
      return rechazar("La fecha de nacimiento no puede ser futura.");
    }
    if (calcularEdad(nacimiento.fecha, hoy) < 18) {
      return rechazar("Es menor de edad: no se puede marcar como promovido.");
    }
    base.fechaNacimiento = nacimiento.iso;
  }

  // "Nueva" es provisional: revisarArchivo lo corrige a "actualizar" cuando el teléfono ya existe.
  return { ...base, destino: "nueva", personaExistenteId: null, motivo: null };
}

export async function revisarArchivo(
  usuario: UsuarioActuante | null,
  archivo: string,
  texto: string,
): Promise<Resultado<Revision | null>> {
  if (!puedeImportar(usuario)) {
    return { datos: null, sinEsquema: false, aviso: "No tienes permiso para importar promovidos." };
  }

  const leido = leerCsv(texto);
  if (leido.filas.length === 0) {
    return {
      datos: { archivo, columnasFaltantes: [], nuevas: [], actualizar: [], rechazadas: [] },
      sinEsquema: false,
      aviso: "El archivo no tiene renglones para importar.",
    };
  }

  const columnas = resolverColumnas(leido.encabezados);
  const columnasFaltantes = PLANTILLA_PROMOVIDOS.filter(
    (c) => c.obligatoria && !columnas.has(c.llave),
  ).map((c) => c.etiqueta);

  if (columnasFaltantes.length > 0) {
    // Sin nombre o sin teléfono no hay nada que revisar renglón por renglón: se avisa de una vez.
    return {
      datos: { archivo, columnasFaltantes, nuevas: [], actualizar: [], rechazadas: [] },
      sinEsquema: false,
      aviso: null,
    };
  }

  // Catálogo de secciones, una sola vez y en memoria. Un archivo de cinco mil renglones no puede
  // hacer cinco mil consultas.
  const catalogo = await lista<{ clave: string; demarcacion_id: number }>(
    db().from("secciones").select("clave, demarcacion_id"),
  );
  if (catalogo.aviso) {
    return { datos: null, sinEsquema: catalogo.sinEsquema, aviso: catalogo.aviso };
  }
  const catalogoSecciones = new Map(catalogo.datos.map((s) => [s.clave, s.demarcacion_id]));

  const telefonosVistos = new Map<string, number>();
  const hoy = fechaHoyUtc();

  const renglones = leido.filas.map((fila, indice) =>
    revisarRenglon(indice + 2, fila, columnas, usuario, catalogoSecciones, telefonosVistos, hoy),
  );

  const rechazadas = renglones.filter((r) => r.destino === "rechazada");
  const aprobados = renglones.filter((r) => r.destino !== "rechazada");

  // Quiénes ya existen en la base, para decidir "nueva" contra "actualizar". A propósito no se
  // recorta por territorio, igual que buscarPorTelefono en personas.ts: el teléfono es la llave de
  // deduplicación en todo el municipio, no solo dentro del territorio del usuario.
  const telefonosAprobados = [
    ...new Set(aprobados.map((r) => r.telefonoNorm).filter((t): t is string => t !== null)),
  ];
  const existentes = new Map<string, string>();
  for (const lote of trocear(telefonosAprobados, 500)) {
    const r = await lista<{ id: string; telefono_norm: string | null }>(
      db().from("personas").select("id, telefono_norm").in("telefono_norm", lote),
    );
    if (r.aviso) {
      return { datos: null, sinEsquema: r.sinEsquema, aviso: r.aviso };
    }
    for (const persona of r.datos) {
      if (persona.telefono_norm) existentes.set(persona.telefono_norm, persona.id);
    }
  }

  const nuevas: RenglonRevisado[] = [];
  const actualizar: RenglonRevisado[] = [];
  for (const renglon of aprobados) {
    const existenteId = renglon.telefonoNorm ? existentes.get(renglon.telefonoNorm) : undefined;
    if (existenteId) {
      actualizar.push({ ...renglon, destino: "actualizar", personaExistenteId: existenteId });
    } else {
      nuevas.push(renglon);
    }
  }

  return {
    datos: { archivo, columnasFaltantes: [], nuevas, actualizar, rechazadas },
    sinEsquema: false,
    aviso: null,
  };
}

/* ---------------------------------------------------------------------------
 * Aplicación
 * ------------------------------------------------------------------------- */

export type SaldoImportacion = {
  importacionId: string | null;
  nuevas: number;
  actualizadas: number;
  rechazadas: number;
};

export async function aplicarImportacion(
  usuario: UsuarioActuante | null,
  revision: Revision,
): Promise<Resultado<SaldoImportacion | null>> {
  if (!puedeImportar(usuario)) {
    return { datos: null, sinEsquema: false, aviso: "No tienes permiso para importar promovidos." };
  }

  // El renglón de importaciones se crea primero: su id sella a cada persona nueva con su origen,
  // que es lo que permite deshacer una carga completa si el archivo no debía estar ahí.
  const registro = await uno<{ id: string }>(
    db()
      .from("importaciones")
      .insert({ archivo: revision.archivo, importada_por: usuario?.id ?? null })
      .select("id")
      .single(),
  );
  if (!registro.datos) {
    return {
      datos: null,
      sinEsquema: registro.sinEsquema,
      aviso: registro.aviso ?? "No se pudo registrar la importación.",
    };
  }
  const importacionId = registro.datos.id;
  const selladoEn = new Date().toISOString();

  // Las nuevas se insertan en lotes: un viaje por cada quinientos renglones, no uno por persona.
  // La colonia del archivo no se guarda: es referencia, nunca fuente de verdad, y la ficha no
  // tiene dónde ponerla sin inventar una columna que el esquema no pidió.
  const filasNuevas = revision.nuevas.map((r) => ({
    nombre: r.nombre,
    telefono_raw: r.telefonoNorm,
    telefono_norm: r.telefonoNorm,
    calle: r.calle,
    seccion_clave: r.seccionClave,
    demarcacion_id: r.demarcacionId,
    genero: r.genero,
    fecha_nacimiento: r.fechaNacimiento,
    es_promovido: true,
    promovido_en: selladoEn,
    promovido_por: usuario?.id ?? null,
    registrada_por: usuario?.id ?? null,
    importacion_id: importacionId,
  }));

  let nuevasInsertadas = 0;
  for (const lote of trocear(filasNuevas, 500)) {
    const { data, error } = await db().from("personas").insert(lote).select("id");
    if (error) {
      const r = resultado(null, error, null);
      return {
        datos: null,
        sinEsquema: r.sinEsquema,
        aviso: r.aviso ?? "No se pudieron guardar las personas nuevas.",
      };
    }
    nuevasInsertadas += data?.length ?? lote.length;
  }

  // Las que ya existen nunca se sobrescriben: solo se les marca la promoción. Nombre, calle,
  // sección o cualquier otro dato que ya tuvieran se queda como estaba. Se actualiza en lotes por
  // la misma razón que las altas: son los mismos tres valores para todo el lote.
  let actualizadas = 0;
  const idsActualizar = revision.actualizar
    .map((r) => r.personaExistenteId)
    .filter((id): id is string => id !== null);
  for (const lote of trocear(idsActualizar, 500)) {
    const { data, error } = await db()
      .from("personas")
      .update({ es_promovido: true, promovido_en: selladoEn, promovido_por: usuario?.id ?? null })
      .in("id", lote)
      .select("id");
    if (error) {
      const r = resultado(null, error, null);
      return {
        datos: null,
        sinEsquema: r.sinEsquema,
        aviso: r.aviso ?? "No se pudo actualizar a los promovidos que ya existían.",
      };
    }
    actualizadas += data?.length ?? lote.length;
  }

  const saldo: SaldoImportacion = {
    importacionId,
    nuevas: nuevasInsertadas,
    actualizadas,
    rechazadas: revision.rechazadas.length,
  };

  // Se cierra el renglón de la importación con los conteos reales, no con lo previsto en la revisión.
  await db()
    .from("importaciones")
    .update({
      renglones: revision.nuevas.length + revision.actualizar.length + revision.rechazadas.length,
      nuevas: saldo.nuevas,
      actualizadas: saldo.actualizadas,
      rechazadas: saldo.rechazadas,
    })
    .eq("id", importacionId);

  return { datos: saldo, sinEsquema: false, aviso: null };
}
