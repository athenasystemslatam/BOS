"use client";

import { X } from "lucide-react";
import clsx from "clsx";
import { useBackdropClose } from "@/lib/useBackdropClose";

export const LABEL = "text-xs font-medium text-gray-500 block mb-1";
export const INPUT =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 bg-white";

export function aEntero(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

export function Modal({
  titulo,
  subtitulo,
  onClose,
  ancho = "max-w-lg",
  children,
}: {
  titulo: string;
  subtitulo: string;
  onClose: () => void;
  ancho?: string;
  children: React.ReactNode;
}) {
  const backdrop = useBackdropClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className={clsx("bg-white rounded-2xl shadow-xl w-full max-h-[90vh] flex flex-col overflow-hidden", ancho)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.18em] uppercase text-gray-400">{subtitulo}</p>
            <h2 className="text-[15px] font-semibold text-gray-900 mt-1">{titulo}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pie({
  error,
  pendiente,
  onClose,
  textoGuardar = "Guardar",
}: {
  error: string | null;
  pendiente: boolean;
  onClose: () => void;
  textoGuardar?: string;
}) {
  return (
    <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pendiente}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : textoGuardar}
        </button>
      </div>
    </div>
  );
}
