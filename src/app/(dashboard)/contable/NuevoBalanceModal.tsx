"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { crearBalance } from "./actions";

type Cliente = { id: string; nombre: string; cuit: string };
type EquipoMiembro = { id: string; nombre: string };

export function NuevoBalanceModal({
  anio,
  clientesDisponibles,
  equipoContable,
  onClose,
}: {
  anio: number;
  clientesDisponibles: Cliente[];
  equipoContable: EquipoMiembro[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Combobox state
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const clientesFiltrados = clientesDisponibles
    .filter(
      (c) =>
        c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.cuit.includes(busqueda)
    )
    .slice(0, 30);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const clienteId = fd.get("cliente_id") as string;
    const fechaCierre = fd.get("fecha_cierre") as string;
    const resp1 = (fd.get("responsable_id") as string) || null;
    const resp2 = (fd.get("responsable2_id") as string) || null;

    if (!clienteId || !fechaCierre) {
      setError("Cliente y fecha de cierre son obligatorios.");
      return;
    }

    startTransition(async () => {
      const result = await crearBalance({
        cliente_id: clienteId,
        anio_fiscal: anio,
        fecha_cierre: fechaCierre,
        responsable_id: resp1,
        responsable2_id: resp2 || null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Nuevo balance {anio}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Cliente — combobox con búsqueda */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Cliente <span className="text-red-400">*</span>
            </label>
            <input type="hidden" name="cliente_id" value={clienteSeleccionado?.id ?? ""} />
            <div className="relative">
              <input
                type="text"
                value={clienteSeleccionado ? clienteSeleccionado.nombre : busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setClienteSeleccionado(null);
                  setAbierto(true);
                }}
                onFocus={() => setAbierto(true)}
                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                placeholder="Buscar por nombre o CUIT…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
              {clienteSeleccionado && (
                <button
                  type="button"
                  onClick={() => { setClienteSeleccionado(null); setBusqueda(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X size={14} />
                </button>
              )}
              {abierto && clientesFiltrados.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setClienteSeleccionado(c);
                        setBusqueda("");
                        setAbierto(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors"
                    >
                      <span className="font-medium text-gray-800">{c.nombre}</span>
                      <span className="text-gray-400 text-xs ml-2">{c.cuit}</span>
                    </button>
                  ))}
                </div>
              )}
              {abierto && busqueda.length > 0 && clientesFiltrados.length === 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400">
                  Sin resultados para &ldquo;{busqueda}&rdquo;
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Fecha de cierre <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              name="fecha_cierre"
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              VTO Balance = cierre + 135 días · 855/F899 = VTO + 25 días
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Responsable
            </label>
            <select
              name="responsable_id"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 bg-white"
            >
              <option value="">Sin asignar</option>
              {equipoContable.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Responsable 2 (opcional)
            </label>
            <select
              name="responsable2_id"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 bg-white"
            >
              <option value="">—</option>
              {equipoContable.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Crear balance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
