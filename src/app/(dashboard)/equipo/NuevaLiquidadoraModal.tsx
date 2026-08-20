"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { crearLiquidadora } from "./actions";

const ROLES = [
  { value: "liquidadora", label: "Liquidadora" },
  { value: "supervisor", label: "Supervisora" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Solo lectura" },
];

const AREAS = [
  { value: "sueldos", label: "Sueldos" },
  { value: "impuestos", label: "Impuestos" },
  { value: "contable", label: "Contable" },
  { value: "monotributo", label: "Monotributo" },
  { value: "libros", label: "Libros" },
];

export function NuevaLiquidadoraModal() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await crearLiquidadora(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="bg-bordo text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-bordo-dark transition-colors"
      >
        + Nueva persona
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-gray-900">Nueva persona</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Nombre completo <span className="text-danger">*</span>
                </label>
                <input
                  name="nombre"
                  type="text"
                  required
                  placeholder="Ej: María García"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Email
                  <span className="text-gray-300 font-normal ml-1">(opcional — sin email, la persona no tiene acceso al sistema)</span>
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="persona@kma.com.ar"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Rol <span className="text-danger">*</span>
                </label>
                <select
                  name="rol"
                  defaultValue="liquidadora"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo bg-white transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Áreas <span className="text-gray-300 font-normal">(a qué módulos pertenece)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {AREAS.map((a) => (
                    <label key={a.value} className="flex items-center gap-1.5 text-sm text-gray-600">
                      <input type="checkbox" name="areas" value={a.value} className="rounded border-gray-300 text-bordo focus:ring-bordo/30" />
                      {a.label}
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-bordo text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-bordo-dark transition-colors disabled:opacity-60"
                >
                  {isPending ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
