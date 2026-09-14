"use client";

import { Plus, Trash2 } from "lucide-react";
import type { EmailContacto } from "@/types";

const MAX_EMAILS = 5;

// Editor de la lista de emails de contacto de un cliente, cada uno con su
// aclaración de área (sueldos, impuestos, administración...) — mismo patrón
// de agregar/sacar filas que ClavesAccesoEditor/LocalesEditor, compartido
// entre los 4 modales de Nueva/Editar empresa (Panel General y Clientes) y
// la llavecita de Seguimiento. Tope de 5 (ver también el recorte del lado
// del servidor en actions.ts) para que la ficha del cliente no crezca sin
// límite.
export function EmailsContactoEditor({
  emails,
  onChange,
}: {
  emails: EmailContacto[];
  onChange: (e: EmailContacto[]) => void;
}) {
  function update(i: number, field: keyof EmailContacto, value: string) {
    onChange(emails.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  function remove(i: number) {
    onChange(emails.filter((_, idx) => idx !== i));
  }

  function add() {
    if (emails.length >= MAX_EMAILS) return;
    onChange([...emails, { email: "", aclaracion: "" }]);
  }

  return (
    <div className="space-y-2">
      {emails.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="email"
            value={e.email}
            onChange={(ev) => update(i, "email", ev.target.value)}
            placeholder="contacto@cliente.com"
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
          />
          <input
            type="text"
            value={e.aclaracion}
            onChange={(ev) => update(i, "aclaracion", ev.target.value)}
            placeholder="Área (sueldos, impuestos…)"
            className="w-[150px] shrink-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
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
      {emails.length < MAX_EMAILS ? (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bordo transition-colors"
        >
          <Plus size={13} /> Agregar email
        </button>
      ) : (
        <p className="text-[11px] text-gray-300">Máximo {MAX_EMAILS} emails.</p>
      )}
    </div>
  );
}
