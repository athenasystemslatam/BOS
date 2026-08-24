"use client";

import { useState } from "react";
import clsx from "clsx";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { ProductividadTabs } from "@/components/ProductividadTabs";

export interface FilaResponsableMono {
  id: string;
  nombre: string;
  meses: {
    anio: number;
    mes: number;
    total: number;
    pagadas: number;
    aTiempo: number;
    tarde: number;
    recatRealizada: number;
    recatPendiente: number;
  }[];
}

function Pill({ value, total }: { value: number; total: number }) {
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  const pct = Math.round((value / total) * 100);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded",
        pct === 100 ? "bg-green-50 text-green-700" : pct >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
      )}
    >
      {value}/{total}
    </span>
  );
}

export function MonotributoProductividadClient({ filas }: { filas: FilaResponsableMono[] }) {
  const [seleccionado, setSeleccionado] = useState<string>(filas[0]?.id ?? "");
  const fila = filas.find((f) => f.id === seleccionado);

  return (
    <div className="p-4 md:p-8">
      <ProductividadTabs current="/productividad/monotributo" />
      <div className="mb-6 md:mb-8">
        <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Módulo Monotributo</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Productividad</h1>
        <p className="text-sm text-gray-400 mt-1">Cuotas y recategorización por responsable, mes a mes</p>
      </div>

      <div className="flex gap-2 mb-4 md:mb-6 flex-wrap">
        {filas.map((f) => (
          <button
            key={f.id}
            onClick={() => setSeleccionado(f.id)}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
              seleccionado === f.id
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-amber-400 hover:text-amber-600"
            )}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      {!fila ? (
        <p className="text-gray-400 text-sm">Sin datos.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Período</th>
                  <th className="px-4 py-3 text-center font-medium">Clientes</th>
                  <th className="px-4 py-3 text-center font-medium">Cuotas pagadas</th>
                  <th className="px-4 py-3 text-center font-medium">A tiempo</th>
                  <th className="px-4 py-3 text-center font-medium">Tarde</th>
                  <th className="px-4 py-3 text-center font-medium">Recategorización</th>
                  <th className="px-4 py-3 text-center font-medium">% completitud</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...fila.meses].reverse().map((m) => {
                  const pct = m.total > 0 ? Math.round((m.pagadas / m.total) * 100) : 0;
                  const tieneRecat = m.recatRealizada + m.recatPendiente > 0;
                  return (
                    <tr key={`${m.anio}-${m.mes}`} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 text-[13px] font-medium text-gray-900 whitespace-nowrap">
                        {MESES_NOMBRES[m.mes]} {m.anio}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-gray-600">{m.total}</td>
                      <td className="px-4 py-3 text-center">
                        <Pill value={m.pagadas} total={m.total} />
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-green-600 font-medium">{m.aTiempo || "—"}</td>
                      <td className="px-4 py-3 text-center text-[13px] text-red-500 font-medium">{m.tarde || "—"}</td>
                      <td className="px-4 py-3 text-center text-[12px] text-gray-500">
                        {tieneRecat ? `${m.recatRealizada}/${m.recatRealizada + m.recatPendiente} realizadas` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={clsx(
                            "text-sm font-semibold",
                            pct === 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600"
                          )}
                        >
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-50 text-[11px] text-gray-400">
            &quot;A tiempo&quot; compara la fecha de pago contra el día 20 del mismo mes. Recategorización solo tiene datos en febrero y agosto.
          </div>
        </div>
      )}
    </div>
  );
}
