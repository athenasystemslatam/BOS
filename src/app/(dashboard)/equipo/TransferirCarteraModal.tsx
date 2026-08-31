"use client";

import { useState, useTransition } from "react";
import { X, ArrowRightLeft } from "lucide-react";
import { Liquidadora } from "@/types";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { getClientesActivosDeLiquidadora, transferirCartera } from "../empresas/actions";

const MESES = MESES_NOMBRES.slice(1).map((nombre, i) => ({ valor: i + 1, nombre }));

export function TransferirCarteraModal({
  liquidadora,
  liquidadoras,
  creadoPor,
  onClose,
}: {
  liquidadora: Liquidadora;
  liquidadoras: Liquidadora[];
  creadoPor: string | null;
  onClose: () => void;
}) {
  const hoy = new Date();
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[] | null>(null);
  const [destino, setDestino] = useState("");
  const [desdeMes, setDesdeMes] = useState(hoy.getMonth() + 1);
  const [desdeAnio, setDesdeAnio] = useState(hoy.getFullYear());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ total: number; transferidas: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (clientes === null) {
    getClientesActivosDeLiquidadora(liquidadora.id).then(setClientes);
  }

  const otrasLiquidadoras = liquidadoras.filter((l) => l.id !== liquidadora.id && l.activa);

  function handleTransferir() {
    if (!destino) { setError("Seleccioná a quién transferirle la cartera."); return; }
    setError("");
    startTransition(async () => {
      const res = await transferirCartera(
        liquidadora.id,
        destino,
        desdeAnio,
        desdeMes,
        motivo || null,
        creadoPor
      );
      if (res.error) { setError(res.error); return; }
      setResultado({ total: res.total ?? 0, transferidas: res.transferidas ?? 0 });
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <ArrowRightLeft size={18} className="text-bordo" />
            <div>
              <p className="text-[13px] font-semibold text-gray-900">Transferir cartera</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Empresas de sueldos a cargo de {liquidadora.nombre}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {resultado ? (
            <div className="text-center py-6">
              <p className="text-[14px] font-semibold text-gray-900">
                {resultado.transferidas} de {resultado.total} empresas transferidas
              </p>
              <p className="text-[12px] text-gray-400 mt-1">
                Ya quedaron a cargo de la nueva liquidadora, con el historial guardado.
              </p>
            </div>
          ) : clientes === null ? (
            <p className="text-sm text-gray-400 py-2">Cargando empresas…</p>
          ) : clientes.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              {liquidadora.nombre} no tiene empresas activas de sueldos asignadas.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {clientes.length} {clientes.length === 1 ? "empresa" : "empresas"} a transferir
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {clientes.map((c) => (
                    <span
                      key={c.id}
                      className="text-[11px] bg-gray-50 text-gray-600 px-2 py-1 rounded-md"
                    >
                      {c.nombre}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">
                    Transferir a
                  </label>
                  <select
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
                  >
                    <option value="">Seleccioná…</option>
                    {otrasLiquidadoras.map((l) => (
                      <option key={l.id} value={l.id}>{l.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 font-medium block mb-1">Desde mes</label>
                    <select
                      value={desdeMes}
                      onChange={(e) => setDesdeMes(Number(e.target.value))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
                    >
                      {MESES.map((m) => (
                        <option key={m.valor} value={m.valor}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-gray-500 font-medium block mb-1">Año</label>
                    <input
                      type="number"
                      value={desdeAnio}
                      onChange={(e) => setDesdeAnio(Number(e.target.value))}
                      min={2024}
                      max={2030}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">
                    Motivo <span className="text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: baja de Diego, pasa toda su cartera a Romina"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
                  />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            {resultado ? "Cerrar" : "Cancelar"}
          </button>
          {!resultado && clientes && clientes.length > 0 && (
            <button
              onClick={handleTransferir}
              disabled={isPending || !destino}
              className="text-sm font-medium bg-bordo text-white px-4 py-2 rounded-lg hover:bg-bordo/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Transfiriendo…" : `Transferir ${clientes.length} ${clientes.length === 1 ? "empresa" : "empresas"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
