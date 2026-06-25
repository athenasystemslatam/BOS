"use client";

import { useState, useTransition } from "react";
import { X, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { editarEmpresa } from "./actions";
import { Cliente, Liquidadora, ClaveAcceso } from "@/types";

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

function formatCuit(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function ClavesAccesoEditor({
  claves,
  onChange,
}: {
  claves: ClaveAcceso[];
  onChange: (c: ClaveAcceso[]) => void;
}) {
  const [showPass, setShowPass] = useState<Record<number, boolean>>({});

  function update(i: number, field: keyof ClaveAcceso, value: string) {
    const next = claves.map((c, idx) => (idx === i ? { ...c, [field]: value } : c));
    onChange(next);
  }

  function remove(i: number) {
    onChange(claves.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {claves.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <input
            type="text"
            placeholder="Sistema (ARCA, TAD…)"
            value={c.sistema}
            onChange={(e) => update(i, "sistema", e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-2 focus:outline-none focus:border-bordo bg-white"
          />
          <input
            type="text"
            placeholder="Usuario / CUIT"
            value={c.usuario}
            onChange={(e) => update(i, "usuario", e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-2 focus:outline-none focus:border-bordo bg-white"
          />
          <div className="relative">
            <input
              type={showPass[i] ? "text" : "password"}
              placeholder="Contraseña"
              value={c.contrasena}
              onChange={(e) => update(i, "contrasena", e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2.5 py-2 pr-8 focus:outline-none focus:border-bordo bg-white w-full"
            />
            <button
              type="button"
              onClick={() => setShowPass((p) => ({ ...p, [i]: !p[i] }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass[i] ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-300 hover:text-danger transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...claves, { sistema: "", usuario: "", contrasena: "" }])}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bordo transition-colors"
      >
        <Plus size={13} /> Agregar clave
      </button>
    </div>
  );
}

export function EditarEmpresaModal({
  cliente,
  liquidadoras,
  onClose,
}: {
  cliente: Cliente & { liquidadora?: Liquidadora };
  liquidadoras: Liquidadora[];
  onClose: () => void;
}) {
  const [cuit, setCuit] = useState(formatCuit(cliente.cuit));
  const [tieneSindicato, setTieneSindicato] = useState(cliente.tiene_sindicato);
  const [tieneRubrica, setTieneRubrica] = useState(cliente.tiene_rubrica_lsd);
  const [claves, setClaves] = useState<ClaveAcceso[]>(cliente.claves_acceso ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const terminacion =
    cuit.replace(/\D/g, "").length === 11 ? cuit.replace(/\D/g, "")[10] : "—";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("tiene_sindicato", String(tieneSindicato));
    formData.set("tiene_rubrica_lsd", String(tieneRubrica));
    formData.set("claves_acceso", JSON.stringify(claves));
    setError(null);
    startTransition(async () => {
      const result = await editarEmpresa(formData);
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
        className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">Editar empresa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 flex flex-col">
          <div className="px-6 py-5 space-y-4 flex-1">
            <input type="hidden" name="id" value={cliente.id} />

            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Nombre / Razón social <span className="text-danger">*</span>
              </label>
              <input name="nombre" type="text" required defaultValue={cliente.nombre} className={inputCls} />
            </div>

            {/* CUIT + Terminación */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  CUIT <span className="text-danger">*</span>
                </label>
                <input
                  name="cuit"
                  type="text"
                  required
                  value={cuit}
                  onChange={(e) => setCuit(formatCuit(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Term. CUIT
                </label>
                <div className="text-sm border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50 text-gray-500 font-mono">
                  {terminacion}
                </div>
              </div>
            </div>

            {/* Tipo + Liquidadora */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Tipo <span className="text-danger">*</span>
                </label>
                <select name="tipo" defaultValue={cliente.tipo} className={inputCls}>
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Liquidadora <span className="text-danger">*</span>
                </label>
                <select name="liquidador_id" required defaultValue={cliente.liquidador_id} className={inputCls}>
                  <option value="">Seleccionar…</option>
                  {liquidadoras.map((l) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Jurisdicción + Estado */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Jurisdicción</label>
                <input name="jurisdiccion" type="text" defaultValue={cliente.jurisdiccion ?? ""} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Estado</label>
                <select name="estado" defaultValue={cliente.estado} className={inputCls}>
                  <option value="activo">Activa</option>
                  <option value="inactivo">Inactiva</option>
                </select>
              </div>
            </div>

            {/* Sindicato */}
            <div className="border border-gray-100 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Sindicato</span>
                <Toggle value={tieneSindicato} onChange={setTieneSindicato} />
              </div>
              {tieneSindicato && (
                <input
                  name="sindicato_nombre"
                  type="text"
                  placeholder="Nombre del sindicato"
                  defaultValue={cliente.sindicato_nombre ?? ""}
                  className={inputCls}
                />
              )}
            </div>

            {/* Rúbrica LSD */}
            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Rúbrica LSD</span>
                <Toggle value={tieneRubrica} onChange={setTieneRubrica} />
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Observaciones</label>
              <textarea
                name="observaciones"
                rows={2}
                defaultValue={cliente.observaciones ?? ""}
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* Claves de acceso */}
            <div className="border border-gray-100 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-700 mb-3">Claves de acceso</p>
              <ClavesAccesoEditor claves={claves} onChange={setClaves} />
            </div>

            {error && (
              <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
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
