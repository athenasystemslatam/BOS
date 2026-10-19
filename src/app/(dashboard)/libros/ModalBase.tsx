"use client";

import { X } from "lucide-react";
import clsx from "clsx";
import { useBackdropClose } from "@/lib/useBackdropClose";

export const LABEL = "text-xs font-medium text-ink-muted block mb-1";
export const INPUT =
  "w-full text-sm text-ink border border-line-input rounded-[9px] px-3 py-2 focus:outline-none focus:border-bordo bg-paper";

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
      <div className={clsx("bg-paper rounded-2xl shadow-xl w-full max-h-[90vh] flex flex-col overflow-hidden", ancho)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line-row shrink-0">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.18em] uppercase text-ink-subtle">{subtitulo}</p>
            <h2 className="font-archivo text-[16px] font-bold text-ink mt-1">{titulo}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-ink-subtle hover:text-ink">
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
    <div className="px-6 py-4 border-t border-line-row shrink-0 space-y-3">
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted hover:text-ink rounded-lg">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pendiente}
          className="px-4 py-2 text-sm font-semibold text-white bg-bordo hover:bg-bordo-dark rounded-[9px] disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : textoGuardar}
        </button>
      </div>
    </div>
  );
}
