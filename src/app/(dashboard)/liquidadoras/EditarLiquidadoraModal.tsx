"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { editarLiquidadora } from "./actions";
import { Liquidadora } from "@/types";

const ROLES = [
  { value: "liquidadora", label: "Liquidadora" },
  { value: "supervisor",  label: "Supervisora" },
  { value: "admin",       label: "Admin" },
  { value: "viewer",      label: "Solo lectura" },
];

const inputCls =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors bg-white";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${value ? "bg-bordo" : "bg-gray-200"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function EditarLiquidadoraModal({
  liquidadora,
  onClose,
}: {
  liquidadora: Liquidadora;
  onClose: () => void;
}) {
  const [activa, setActiva] = useState(liquidadora.activa);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("activa", String(activa));
    setError(null);
    startTransition(async () => {
      const result = await editarLiquidadora(formData);
      if (result?.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">Editar liquidadora</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <input type="hidden" name="id" value={liquidadora.id} />

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Nombre completo <span className="text-danger">*</span>
            </label>
            <input
              name="nombre"
              type="text"
              required
              defaultValue={liquidadora.nombre}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Email <span className="text-gray-300 font-normal ml-1">(opcional)</span>
            </label>
            <input
              name="email"
              type="email"
              defaultValue={liquidadora.email ?? ""}
              placeholder="liquidadora@kma.com.ar"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Rol</label>
            <select name="rol" defaultValue={liquidadora.rol} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div className="border border-gray-100 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-700">Activa</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {activa ? "Habilitada para operar" : "Marcada como inactiva"}
                </p>
              </div>
              <Toggle value={activa} onChange={setActiva} />
            </div>

            {!activa && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Fecha de baja <span className="text-gray-300 font-normal">(opcional)</span>
                </label>
                <input
                  name="fecha_baja"
                  type="date"
                  defaultValue={
                    liquidadora.fecha_baja
                      ? liquidadora.fecha_baja.split("T")[0]
                      : new Date().toISOString().split("T")[0]
                  }
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-bordo text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-bordo-dark transition-colors disabled:opacity-60"
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
