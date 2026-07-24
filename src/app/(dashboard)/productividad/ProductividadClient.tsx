"use client";

import { useState } from "react";
import clsx from "clsx";
import { MESES_NOMBRES } from "@/lib/vencimientos";

export interface FilaLiquidadora {
  id: string;
  nombre: string;
  meses: {
    periodoId: string;
    anio: number;
    mes: number;
    total: number;
    f931ATiempo: number;
    f931Tarde: number;
    f931SinTs: number;
    recibosATiempo: number;
    recibosTarde: number;
    recibosSinTs: number;
    completadas: number;
    avgDiasF931: number | null;
    avgDiasRecibos: number | null;
  }[];
}

function Pill({ value, total }: { value: number; total: number }) {
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  const pct = Math.round((value / total) * 100);
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded",
      pct === 100 ? "bg-green-50 text-green-700" :
      pct >= 70 ? "bg-amber-50 text-amber-700" :
      "bg-red-50 text-red-600"
    )}>
      {value}/{total}
    </span>
  );
}

function DeltaDias({ avg }: { avg: number | null }) {
  if (avg === null) return <span className="text-gray-300 text-xs">—</span>;
  const label = avg >= 0 ? `+${Math.round(avg)}d` : `${Math.round(avg)}d`;
  return (
    <span className={clsx(
      "text-xs font-medium",
      avg >= 3 ? "text-green-600" : avg >= 0 ? "text-amber-600" : "text-red-600"
    )}>
      {label}
    </span>
  );
}

export function ProductividadClient({ filas, periodos }: {
  filas: FilaLiquidadora[];
  periodos: { id: string; anio: number; mes: number }[];
}) {
  const [liqSeleccionada, setLiqSeleccionada] = useState<string>(filas[0]?.id ?? "");

  const fila = filas.find((f) => f.id === liqSeleccionada);

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Módulo Sueldos</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Productividad</h1>
        <p className="text-sm text-gray-400 mt-1">
          Rendimiento por liquidadora — días antes/después del vencimiento al marcar cada tarea
        </p>
      </div>

      {/* Selector liquidadora */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filas.map((f) => (
          <button
            key={f.id}
            onClick={() => setLiqSeleccionada(f.id)}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
              liqSeleccionada === f.id
                ? "bg-bordo text-white border-bordo"
                : "bg-white text-gray-600 border-gray-200 hover:border-bordo hover:text-bordo"
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
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Período</th>
                  <th className="px-4 py-3 text-center font-medium">Empresas</th>
                  <th className="px-4 py-3 text-center font-medium">F.931 completadas</th>
                  <th className="px-4 py-3 text-center font-medium">Días al venc. F.931</th>
                  <th className="px-4 py-3 text-center font-medium">Recibos completados</th>
                  <th className="px-4 py-3 text-center font-medium">Días al venc. recibos</th>
                  <th className="px-4 py-3 text-center font-medium">% completitud</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...fila.meses].reverse().map((m) => {
                  const pct = m.total > 0 ? Math.round((m.completadas / m.total) * 100) : 0;
                  return (
                    <tr key={m.periodoId} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 text-[13px] font-medium text-gray-900 whitespace-nowrap">
                        {MESES_NOMBRES[m.mes]} {m.anio}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-gray-600">
                        {m.total}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Pill value={m.f931ATiempo + m.f931Tarde + m.f931SinTs} total={m.total} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DeltaDias avg={m.avgDiasF931} />
                        {m.f931SinTs > 0 && (
                          <span className="text-[10px] text-gray-400 ml-1">({m.f931SinTs} sin ts)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Pill value={m.recibosATiempo + m.recibosTarde + m.recibosSinTs} total={m.total} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DeltaDias avg={m.avgDiasRecibos} />
                        {m.recibosSinTs > 0 && (
                          <span className="text-[10px] text-gray-400 ml-1">({m.recibosSinTs} sin ts)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx(
                          "text-sm font-semibold",
                          pct === 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600"
                        )}>
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
            Días al vencimiento: positivo = completado antes, negativo = completado después. &quot;sin ts&quot; = marcado antes de julio 2026 (sin registro de hora).
          </div>
        </div>
      )}
    </div>
  );
}
