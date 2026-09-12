"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  cargarSecciones,
  rasgoPorClave,
  type ColeccionSecciones,
  type PropiedadesSeccion,
} from "@/lib/territorio";

/**
 * Campo de sección del alta de actividades: un buscador por clave de cuatro dígitos, contra la
 * misma cartografía cacheada que ya resuelve el registro de personas. Al elegir una, la
 * demarcación se resuelve sola y se muestra como confirmación, nunca como campo a llenar.
 */
export function CampoSeccion({
  valor,
  onCambiar,
}: {
  valor: string;
  onCambiar: (clave: string) => void;
}) {
  const [coleccion, setColeccion] = useState<ColeccionSecciones | null>(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    let vigente = true;
    cargarSecciones().then((c) => {
      if (vigente) setColeccion(c);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const elegida = valor && coleccion ? rasgoPorClave(valor, coleccion) : null;

  const digitos = texto.replace(/\D/g, "");
  const resultados = useMemo<PropiedadesSeccion[]>(() => {
    if (!coleccion || digitos.length === 0) return [];
    return coleccion.features
      .map((f) => f.properties)
      .filter((p) => p.clave.includes(digitos))
      .sort((a, b) => a.clave.localeCompare(b.clave))
      .slice(0, 8);
  }, [coleccion, digitos]);

  if (elegida) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-control border border-borde bg-superficie p-3">
        <p className="text-sm">
          <span className="cifras block text-base font-medium text-tinta">
            Sección {elegida.properties.clave}
          </span>
          <span className="block text-tinta-suave">{elegida.properties.demarcacion}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            onCambiar("");
            setTexto("");
          }}
          className="transicion-ui shrink-0 rounded-control border border-borde px-3 text-sm text-tinta-suave toque-actividad"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
          aria-hidden
        />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Clave de cuatro dígitos"
          className="campo cifras pl-9"
        />
      </div>

      {!coleccion && (
        <p className="text-xs text-tinta-tenue">Cargando cartografía de secciones…</p>
      )}

      {digitos.length > 0 &&
        coleccion &&
        (resultados.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {resultados.map((s) => (
              <li key={s.clave}>
                <button
                  type="button"
                  onClick={() => {
                    onCambiar(s.clave);
                    setTexto("");
                  }}
                  className="transicion-ui flex w-full items-center justify-between gap-2 rounded-control border border-borde bg-superficie px-3 py-2 text-left text-sm toque-actividad"
                >
                  <span className="cifras text-tinta">Sección {s.clave}</span>
                  <span className="text-xs text-tinta-suave">{s.demarcacion}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-tinta-tenue">Sin coincidencias.</p>
        ))}
    </div>
  );
}
