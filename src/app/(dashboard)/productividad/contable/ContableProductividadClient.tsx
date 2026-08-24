"use client";

import { useState } from "react";
import clsx from "clsx";
import { ProductividadTabs } from "@/components/ProductividadTabs";

export interface FilaResponsableContable {
  id: string;
  nombre: string;
  anios: {
    anio: number;
    total: number;
    finalizados: number;
    enProceso: number;
    frenados: number;
    sinEmpezar: number;
    avancePromedio: number;
    vencidos: number;
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

export function ContableProductividadClient({ filas }: { filas: FilaResponsableContable[] }) {
  const [seleccionado, setSeleccionado] = useState<string>(filas[0]?.id ?? "");
  const fila = filas.find((f) => f.id === seleccionado);

  return (
    <div className="p-4 md:p-8">
      <ProductividadTabs current="/productividad/contable" />
      <div className="mb-6 md:mb-8">
        <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Módulo Contable</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Productividad</h1>
        <p className="text-sm text-gray-400 mt-1">
          Balances por responsable, año a año — cuenta doble si el balance tiene 2 responsables
        </p>
      </div>

      <div className="flex gap-2 mb-4 md:mb-6 flex-wrap">
        {filas.map((f) => (
          <button
            key={f.id}
            onClick={() => setSeleccionado(f.id)}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
              seleccionado === f.id
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-600"
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
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Año fiscal</th>
                  <th className="px-4 py-3 text-center font-medium">Balances</th>
                  <th className="px-4 py-3 text-center font-medium">Finalizados</th>
                  <th className="px-4 py-3 text-center font-medium">En proceso</th>
                  <th className="px-4 py-3 text-center font-medium">Frenados</th>
                  <th className="px-4 py-3 text-center font-medium">Sin empezar</th>
                  <th className="px-4 py-3 text-center font-medium">Avance prom.</th>
                  <th className="px-4 py-3 text-center font-medium">Vencidos sin cerrar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...fila.anios].reverse().map((a) => (
                  <tr key={a.anio} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3 text-[13px] font-medium text-gray-900 whitespace-nowrap">{a.anio}</td>
                    <td className="px-4 py-3 text-center text-[13px] text-gray-600">{a.total}</td>
                    <td className="px-4 py-3 text-center">
                      <Pill value={a.finalizados} total={a.total} />
                    </td>
                    <td className="px-4 py-3 text-center text-[13px] text-gray-600">{a.enProceso || "—"}</td>
                    <td className="px-4 py-3 text-center text-[13px] text-red-500 font-medium">{a.frenados || "—"}</td>
                    <td className="px-4 py-3 text-center text-[13px] text-gray-400">{a.sinEmpezar || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={clsx(
                          "text-sm font-semibold",
                          a.avancePromedio === 100 ? "text-green-600" : a.avancePromedio >= 50 ? "text-amber-600" : "text-gray-500"
                        )}
                      >
                        {a.avancePromedio}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-[13px] font-medium">
                      {a.vencidos > 0 ? <span className="text-red-600">{a.vencidos}</span> : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-50 text-[11px] text-gray-400">
            &quot;Vencidos sin cerrar&quot; = balances con vencimiento (cierre + 135 días) ya pasado que todavía no están en estado Finalizado.
          </div>
        </div>
      )}
    </div>
  );
}
