"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useActuante } from "@/components/proveedor-actuante";
import { DEMARCACIONES } from "@/lib/demarcaciones";
import { cargarSecciones, rasgoPorClave } from "@/lib/territorio";
import { buscarColonias } from "@/lib/datos/catalogos";
import { listarPersonas } from "@/lib/datos/personas";
import { cn } from "@/lib/utils";

type Resultado =
  | { tipo: "seccion"; clave: string; apoyo: string }
  | { tipo: "demarcacion"; id: number; nombre: string }
  | { tipo: "colonia"; id: number; nombre: string; apoyo: string }
  | { tipo: "persona"; id: string; nombre: string; apoyo: string };

/**
 * Una sola caja que resuelve tres cosas: nombre de demarcación o colonia, nombre de persona, y
 * clave de sección de cuatro dígitos. Cada una abre lo que corresponde.
 */
export function Buscador({ className }: { className?: string }) {
  const router = useRouter();
  const { actuante } = useActuante();
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const consulta = texto.trim();
    let vigente = true;

    const temporizador = setTimeout(async () => {
      if (consulta.length < 2) {
        if (vigente) {
          setResultados([]);
          setAbierto(false);
        }
        return;
      }

      const encontrados: Resultado[] = [];

      // Clave de sección: cuatro dígitos.
      const digitos = consulta.replace(/\D/g, "");
      if (/^\d{1,4}$/.test(consulta)) {
        const clave = digitos.padStart(4, "0");
        await cargarSecciones();
        const rasgo = rasgoPorClave(clave);
        if (rasgo) {
          encontrados.push({
            tipo: "seccion",
            clave,
            apoyo: rasgo.properties.demarcacion,
          });
        }
      }

      const minuscula = consulta.toLowerCase();
      for (const d of DEMARCACIONES) {
        if (d.nombre.toLowerCase().includes(minuscula)) {
          encontrados.push({ tipo: "demarcacion", id: d.id, nombre: d.nombre });
        }
      }

      const [colonias, personas] = await Promise.all([
        buscarColonias(consulta, 4),
        listarPersonas(actuante, { texto: consulta }, { desde: 0, limite: 4 }),
      ]);

      for (const c of colonias.datos) {
        encontrados.push({
          tipo: "colonia",
          id: c.id,
          nombre: c.nombre,
          apoyo: c.cp ? `CP ${c.cp}` : "Colonia",
        });
      }
      for (const p of personas.datos.filas) {
        encontrados.push({
          tipo: "persona",
          id: p.id,
          nombre: p.nombre,
          apoyo: p.seccion_clave ? `Sección ${p.seccion_clave}` : "Persona",
        });
      }

      if (vigente) {
        setResultados(encontrados.slice(0, 8));
        setAbierto(true);
      }
    }, 250);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [texto, actuante]);

  useEffect(() => {
    function alTocarFuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, []);

  function abrir(r: Resultado) {
    setAbierto(false);
    setTexto("");
    if (r.tipo === "persona") router.push(`/personas/${r.id}` as never);
    else if (r.tipo === "seccion") router.push(`/mapa?seccion=${r.clave}` as never);
    else router.push("/territorio");
  }

  return (
    <div ref={contenedor} className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
        aria-hidden
      />
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Buscar sección, colonia o persona"
        aria-label="Buscador general"
        className="campo pl-9"
        style={{ minHeight: 44 }}
      />

      {abierto && resultados.length > 0 && (
        <ul className="elevacion-flotante absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-tarjeta border border-borde bg-superficie py-1">
          {resultados.map((r) => (
            <li key={`${r.tipo}-${"id" in r ? r.id : r.clave}`}>
              <button
                type="button"
                onClick={() => abrir(r)}
                className="transicion-ui flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors hover:bg-superficie-hundida"
              >
                <span className="truncate text-sm text-tinta">
                  {r.tipo === "seccion" ? (
                    <span className="cifras">Sección {r.clave}</span>
                  ) : (
                    r.nombre
                  )}
                </span>
                <span className="ml-auto shrink-0 text-xs text-tinta-tenue">
                  {r.tipo === "demarcacion" ? "Demarcación" : r.apoyo}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
