"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Local } from "@/types";

// Editor de la lista de locales/sucursales de un cliente — mismo patrón de
// agregar/sacar filas que ClavesAccesoEditor/EmailsContactoEditor,
// compartido entre los 4 modales de Nueva/Editar empresa (Panel General y
// Clientes). Cada local lleva su propio domicilio + jurisdicción, porque
// Convenio Multilateral de IIBB reparte el impuesto según en qué provincias
// hay establecimientos, no solo según el domicilio fiscal.
export function LocalesEditor({
  locales,
  onChange,
}: {
  locales: Local[];
  onChange: (l: Local[]) => void;
}) {
  function update(i: number, field: keyof Local, value: string) {
    onChange(locales.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function remove(i: number) {
    onChange(locales.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...locales, { domicilio: "", jurisdiccion: "" }]);
  }

  return (
    <div className="space-y-2">
      {locales.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
          <input
            type="text"
            value={l.domicilio}
            onChange={(e) => update(i, "domicilio", e.target.value)}
            placeholder="Domicilio del local"
            className="min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
          />
          <input
            type="text"
            value={l.jurisdiccion}
            onChange={(e) => update(i, "jurisdiccion", e.target.value)}
            placeholder="Jurisdicción"
            className="min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-300 hover:text-danger transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bordo transition-colors"
      >
        <Plus size={13} /> Agregar local
      </button>
    </div>
  );
}
