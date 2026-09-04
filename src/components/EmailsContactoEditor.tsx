"use client";

import { Plus, Trash2 } from "lucide-react";

// Editor de la lista de emails de contacto de un cliente — mismo patrón de
// agregar/sacar filas que ClavesAccesoEditor, compartido entre los 4
// modales de Nueva/Editar empresa (Panel General y Clientes).
export function EmailsContactoEditor({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (e: string[]) => void;
}) {
  function update(i: number, value: string) {
    onChange(emails.map((e, idx) => (idx === i ? value : e)));
  }

  function remove(i: number) {
    onChange(emails.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...emails, ""]);
  }

  return (
    <div className="space-y-2">
      {emails.map((email, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => update(i, e.target.value)}
            placeholder="contacto@empresa.com"
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
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
        <Plus size={13} /> Agregar email
      </button>
    </div>
  );
}
