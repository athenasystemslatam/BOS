"use client";

import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import type { ClaveAcceso } from "@/types";

// Editor de claves de acceso, compartido entre Clientes → Editar y Panel
// General → Nueva empresa (bloque de Sueldos) — antes vivía solo dentro de
// EditarEmpresaModal.tsx; se extrajo acá para que ambas pantallas editen el
// mismo campo `claves_acceso` con el mismo componente, en vez de mantener
// dos copias del formulario.
export function ClavesAccesoEditor({
  claves,
  onChange,
  sugerencias,
}: {
  claves: ClaveAcceso[];
  onChange: (c: ClaveAcceso[]) => void;
  sugerencias: string[];
}) {
  const [showPass, setShowPass] = useState<Record<number, boolean>>({});

  function update(i: number, field: keyof ClaveAcceso, value: string) {
    const next = claves.map((c, idx) => (idx === i ? { ...c, [field]: value } : c));
    onChange(next);
  }

  function remove(i: number) {
    onChange(claves.filter((_, idx) => idx !== i));
  }

  function quickAdd(sistema: string) {
    onChange([...claves, { sistema, usuario: "", contrasena: "", url: "", modulo: "" }]);
  }

  const faltantes = sugerencias.filter(
    (s) => !claves.some((c) => c.sistema.trim().toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {claves.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_auto] gap-2 items-center">
          <input
            type="text"
            placeholder="Sistema (ARCA, TAD…)"
            value={c.sistema}
            onChange={(e) => update(i, "sistema", e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-2 focus:outline-none focus:border-bordo bg-white"
          />
          <input
            type="text"
            placeholder="Usuario / CUIT"
            value={c.usuario}
            onChange={(e) => update(i, "usuario", e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-2 focus:outline-none focus:border-bordo bg-white"
          />
          <div className="relative">
            <input
              type={showPass[i] ? "text" : "password"}
              placeholder="Contraseña"
              value={c.contrasena}
              onChange={(e) => update(i, "contrasena", e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2.5 py-2 pr-8 focus:outline-none focus:border-bordo bg-white w-full"
            />
            <button
              type="button"
              onClick={() => setShowPass((p) => ({ ...p, [i]: !p[i] }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass[i] ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="URL"
              value={c.url ?? ""}
              onChange={(e) => update(i, "url", e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2.5 py-2 pr-7 focus:outline-none focus:border-bordo bg-white w-full"
            />
            {c.url && (
              <a
                href={/^https?:\/\//.test(c.url) ? c.url : `https://${c.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-bordo"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          <select
            value={c.modulo ?? ""}
            onChange={(e) => update(i, "modulo", e.target.value)}
            title="Módulo — si se etiqueta, la clave también aparece dentro de ese módulo"
            className="text-xs border border-gray-200 rounded-md px-2 py-2 focus:outline-none focus:border-bordo bg-white text-gray-600"
          >
            <option value="">General</option>
            <option value="sueldos">Sueldos</option>
            <option value="impuestos">Impuestos</option>
            <option value="contable">Contable</option>
            <option value="monotributo">Monotributo</option>
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-300 hover:text-danger transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => quickAdd("")}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bordo transition-colors"
        >
          <Plus size={13} /> Agregar clave
        </button>
        {faltantes.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => quickAdd(s)}
            className="text-[11px] font-medium text-bordo bg-bordo/5 hover:bg-bordo/10 px-2 py-1 rounded-full transition-colors"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
