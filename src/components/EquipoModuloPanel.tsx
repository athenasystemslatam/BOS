"use client";

import { X, Users } from "lucide-react";
import clsx from "clsx";

export type EquipoModuloAccent = {
  dot: string;   // ej: "bg-blue-500"
  bg: string;    // ej: "bg-blue-50"
  text: string;  // ej: "text-blue-700"
};

export function EquipoModuloPanel({
  moduloNombre,
  equipo,
  conteos,
  filterResp,
  onSelect,
  onClose,
  accent,
}: {
  moduloNombre: string;
  equipo: { id: string; nombre: string }[];
  conteos: Record<string, number>;
  filterResp: string;
  onSelect: (nombre: string) => void;
  onClose: () => void;
  accent: EquipoModuloAccent;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-72 h-full bg-white shadow-xl border-l border-gray-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[13px] font-semibold text-gray-900">Equipo</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{moduloNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 py-2">
          {equipo.length === 0 ? (
            <p className="text-[12px] text-gray-400 px-5 py-4">
              Nadie está asignado a esta área todavía. Se configura desde Panel General.
            </p>
          ) : (
            equipo.map((e) => {
              const activo = filterResp === e.nombre;
              return (
                <button
                  key={e.id}
                  onClick={() => onSelect(e.nombre)}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-5 py-2.5 text-left transition-colors",
                    activo ? accent.bg : "hover:bg-gray-50"
                  )}
                >
                  <div className={clsx(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                    activo ? clsx(accent.bg, accent.text) : "bg-gray-100 text-gray-500"
                  )}>
                    {e.nombre.charAt(0)}
                  </div>
                  <span className={clsx(
                    "text-[13px] flex-1 truncate",
                    activo ? clsx(accent.text, "font-medium") : "text-gray-700"
                  )}>
                    {e.nombre}
                  </span>
                  <span className={clsx(
                    "text-[11px] px-1.5 py-0.5 rounded-full shrink-0",
                    activo ? clsx(accent.bg, accent.text, "font-medium") : "bg-gray-100 text-gray-400"
                  )}>
                    {conteos[e.nombre] ?? 0}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {filterResp && (
          <div className="px-5 py-3 border-t border-gray-100">
            <button
              onClick={() => onSelect(filterResp)}
              className="text-[12px] text-gray-500 hover:text-gray-700 transition-colors"
            >
              Quitar filtro ({filterResp})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EquipoModuloBoton({
  cantidad,
  accent,
  onClick,
}: {
  cantidad: number;
  accent: EquipoModuloAccent;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg transition-colors",
        "bg-gray-100 text-gray-600 hover:bg-gray-200"
      )}
    >
      <Users size={14} />
      Equipo
      <span className={clsx("text-[11px] px-1.5 py-0.5 rounded-full", accent.bg, accent.text)}>
        {cantidad}
      </span>
    </button>
  );
}
