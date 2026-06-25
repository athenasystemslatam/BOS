"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { crearEmpresa } from "./actions";
import { Liquidadora } from "@/types";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors bg-white";

function formatCuit(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

export function NuevaEmpresaModal({ liquidadoras }: { liquidadoras: Liquidadora[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cuit, setCuit] = useState("");
  const [tieneSindicato, setTieneSindicato] = useState(false);
  const [tieneRubrica, setTieneRubrica] = useState(false);

  const terminacion = cuit.replace(/\D/g, "").length === 11
    ? cuit.replace(/\D/g, "")[10]
    : "—";

  function handleOpen() {
    setOpen(true);
    setError(null);
    setCuit("");
    setTieneSindicato(false);
    setTieneRubrica(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("tiene_sindicato", String(tieneSindicato));
    formData.set("tiene_rubrica_lsd", String(tieneRubrica));
    setError(null);
    startTransition(async () => {
      const result = await crearEmpresa(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="bg-bordo text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-bordo-dark transition-colors"
      >
        + Nueva empresa
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-[15px] font-semibold text-gray-900">Nueva empresa</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
              <div className="px-6 py-5 space-y-4">

                <Field label="Nombre / Razón social" required>
                  <input
                    name="nombre"
                    type="text"
                    required
                    placeholder="Ej: Empresa S.A."
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="CUIT" required>
                    <input
                      name="cuit"
                      type="text"
                      required
                      value={cuit}
                      onChange={(e) => setCuit(formatCuit(e.target.value))}
                      placeholder="20-12345678-9"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Terminación CUIT">
                    <div className="text-sm border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50 text-gray-500 font-mono">
                      {terminacion}
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tipo de liquidación" required>
                    <select name="tipo" defaultValue="mensual" className={inputCls}>
                      <option value="mensual">Mensual</option>
                      <option value="quincenal">Quincenal</option>
                    </select>
                  </Field>

                  <Field label="Liquidadora asignada" required>
                    <select name="liquidador_id" required className={inputCls}>
                      <option value="">Seleccionar…</option>
                      {liquidadoras.map((l) => (
                        <option key={l.id} value={l.id}>{l.nombre}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                {/* Sindicato */}
                <div className="border border-gray-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">Sindicato</span>
                    <button
                      type="button"
                      onClick={() => setTieneSindicato(!tieneSindicato)}
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                        tieneSindicato ? "bg-bordo" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                          tieneSindicato ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  {tieneSindicato && (
                    <input
                      name="sindicato_nombre"
                      type="text"
                      placeholder="Nombre del sindicato"
                      className={inputCls}
                    />
                  )}
                </div>

                {/* Rúbrica LSD */}
                <div className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">Rúbrica LSD</span>
                    <button
                      type="button"
                      onClick={() => setTieneRubrica(!tieneRubrica)}
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                        tieneRubrica ? "bg-bordo" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                          tieneRubrica ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <Field label="Jurisdicción">
                  <input
                    name="jurisdiccion"
                    type="text"
                    placeholder="Ej: Buenos Aires"
                    className={inputCls}
                  />
                </Field>

                <Field label="Observaciones">
                  <textarea
                    name="observaciones"
                    rows={3}
                    placeholder="Notas adicionales…"
                    className={`${inputCls} resize-none`}
                  />
                </Field>

                {error && (
                  <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
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
                  {isPending ? "Guardando…" : "Guardar empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
