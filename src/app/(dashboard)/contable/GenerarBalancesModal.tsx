"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { previsualizarBalancesAGenerar, generarBalancesDelAnio, type BalanceAGenerar } from "./actions";
import { useBackdropClose } from "@/lib/useBackdropClose";

function fmt(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

// Ítem 109: crea de una vez el balance del año para cada cliente de Contable
// con fecha de cierre fija que todavía no lo tiene. Muestra antes qué va a crear.
export function GenerarBalancesModal({ anio, onClose }: { anio: number; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [cargando, setCargando] = useState(true);
  const [aGenerar, setAGenerar] = useState<BalanceAGenerar[]>([]);
  const [sinCierre, setSinCierre] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    previsualizarBalancesAGenerar(anio).then((r) => {
      if ("error" in r && r.error) setError(r.error);
      else if ("aGenerar" in r) {
        setAGenerar(r.aGenerar);
        setSinCierre(r.sinCierre);
      }
      setCargando(false);
    });
  }, [anio]);

  function generar() {
    setError(null);
    startTransition(async () => {
      const r = await generarBalancesDelAnio(anio);
      if (r?.error) return setError(r.error);
      // La tabla de Seguimiento arma su estado una sola vez desde el servidor:
      // recargar es la forma segura de que aparezcan los balances nuevos.
      window.location.reload();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">Generar balances {anio}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          {cargando ? (
            <p className="text-sm text-gray-400">Buscando clientes…</p>
          ) : (
            <>
              <p className="text-[12px] text-gray-500">
                Se crea un balance {anio} &quot;Sin asignar&quot; para cada cliente activo con Contable y fecha de cierre
                fija que todavía no lo tiene. Los que ya existen no se tocan.
              </p>

              {aGenerar.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-3">
                  No hay balances para generar: todos los clientes con fecha de cierre fija ya tienen su balance {anio}.
                </p>
              ) : (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Se van a crear {aGenerar.length}:</p>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-64 overflow-y-auto">
                    {aGenerar.map((b) => (
                      <div key={b.cliente_id} className="flex justify-between px-3 py-1.5 text-[13px]">
                        <span className="text-gray-700">{b.nombre}</span>
                        <span className="text-gray-400 tabular-nums">cierre {fmt(b.fecha_cierre)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sinCierre.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-[12px] text-amber-800 font-medium">
                    {sinCierre.length} sin fecha de cierre fija (no se generan):
                  </p>
                  <p className="text-[12px] text-amber-700 mt-0.5">{sinCierre.join(" · ")}</p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Cargala en la ficha del cliente, o creá su balance con &quot;Agregar balance&quot;.
                  </p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            Cancelar
          </button>
          <button
            type="button"
            onClick={generar}
            disabled={cargando || isPending || aGenerar.length === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
          >
            {isPending ? "Generando…" : `Generar ${aGenerar.length || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
