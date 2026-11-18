"use client";

import { Plus, Trash2 } from "lucide-react";
import type { TelefonoContacto } from "@/types";
import { MAX_TELEFONOS_CONTACTO } from "@/lib/contactos";

// Lista de teléfonos del cliente, cada uno con aclaración de quién es. Mismo patrón que
// EmailsContactoEditor; se usa en todas las pantallas donde se cargan contactos.
export function TelefonosContactoEditor({
  telefonos,
  onChange,
  disabled = false,
}: {
  telefonos: TelefonoContacto[];
  onChange: (t: TelefonoContacto[]) => void;
  disabled?: boolean;
}) {
  function update(i: number, field: keyof TelefonoContacto, value: string) {
    onChange(telefonos.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }

  return (
    <div className="space-y-2">
      {telefonos.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="tel"
            value={t.telefono}
            disabled={disabled}
            onChange={(ev) => update(i, "telefono", ev.target.value)}
            placeholder="Ej. 11 4567-8900"
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo disabled:bg-gray-50"
          />
          <input
            type="text"
            value={t.aclaracion}
            disabled={disabled}
            onChange={(ev) => update(i, "aclaracion", ev.target.value)}
            placeholder="De quién (titular, contadora…)"
            className="w-[170px] shrink-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo disabled:bg-gray-50"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(telefonos.filter((_, idx) => idx !== i))}
              className="text-gray-300 hover:text-danger transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (telefonos.length < MAX_TELEFONOS_CONTACTO ? (
        <button
          type="button"
          onClick={() => onChange([...telefonos, { telefono: "", aclaracion: "" }])}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bordo transition-colors"
        >
          <Plus size={13} /> Agregar teléfono
        </button>
      ) : (
        <p className="text-[11px] text-gray-300">Máximo {MAX_TELEFONOS_CONTACTO} teléfonos.</p>
      ))}
    </div>
  );
}
