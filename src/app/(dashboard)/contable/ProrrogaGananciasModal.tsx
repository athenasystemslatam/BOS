"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { aplicarProrrogaGanancias } from "./actions";
import { useBackdropClose } from "@/lib/useBackdropClose";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function ProrrogaGananciasModal({
  anio,
  balances,
  onClose,
  onAplicado,
}: {
  anio: number;
  balances: { id: string; fecha_cierre: string }[];
  onClose: () => void;
  onAplicado: (ids: string[], fecha: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const backdrop = useBackdropClose(onClose);

  // Solo los meses de cierre que tienen balances este año, con su cantidad.
  const meses = useMemo(() => {
    const conteo = new Map<number, number>();
    for (const b of balances) {
      const mes = Number(b.fecha_cierre.slice(5, 7));
      conteo.set(mes, (conteo.get(mes) ?? 0) + 1);
    }
    return Array.from(conteo.entries()).sort((a, b) => a[0] - b[0]);
  }, [balances]);

  const [mes, setMes] = useState<number>(meses[0]?.[0] ?? 12);
  const [fecha, setFecha] = useState("");

  function aplicar(nuevaFecha: string | null) {
    setError(null);
    if (nuevaFecha === "") {
      setError("Elegí la fecha de la prórroga.");
      return;
    }
    startTransition(async () => {
      const result = await aplicarProrrogaGanancias(anio, mes, nuevaFecha);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onAplicado(result.ids ?? [], nuevaFecha);
      onClose();
    });
  }

  const cantidad = meses.find(([m]) => m === mes)?.[1] ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Prórroga de Ganancias {anio}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Mes de cierre</label>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 bg-white"
            >
              {meses.map(([m, n]) => (
                <option key={m} value={m}>
                  {MESES[m - 1]} — {n} {n === 1 ? "balance" : "balances"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Nuevo vencimiento de Ganancias</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Se aplica a los {cantidad} balances {anio} con cierre en {MESES[mes - 1]?.toLowerCase()}, incluso
              los que ya tenían una fecha cargada a mano. El VTO balance y los formularios no cambian.
            </p>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => aplicar(null)}
              disabled={isPending || cantidad === 0}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
              title="Borra la prórroga de esos balances: Ganancias vuelve a vencer junto con el balance"
            >
              Volver a la regla
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => aplicar(fecha)}
                disabled={isPending || cantidad === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                {isPending ? "Aplicando…" : "Aplicar prórroga"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
