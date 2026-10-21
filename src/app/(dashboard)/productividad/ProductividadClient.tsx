"use client";

import { useState } from "react";
import clsx from "clsx";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { ProductividadTabs } from "@/components/ProductividadTabs";

export interface FilaLiquidadora {
  id: string;
  nombre: string;
  meses: {
    periodoId: string;
    anio: number;
    mes: number;
    total: number;
    f931Verde: number;
    f931Amarillo: number;
    f931Rojo: number;
    f931SinTs: number;
    recibosVerde: number;
    recibosAmarillo: number;
    recibosRojo: number;
    recibosSinTs: number;
    completadas: number;
    legajos: number;
    preliquidadoCount: number;
    avgDiasF931Objetivo: number | null;
    avgDiasF931Limite: number | null;
    avgDiasRecibosObjetivo: number | null;
    avgDiasRecibosLimite: number | null;
  }[];
  // Ítem 72: acumulado en toda la ventana de períodos, para ver qué
  // clientes mandan tarde (ordenado de más a menos veces marcado).
  clientesPreliquidado: { clienteId: string; nombre: string; veces: number; totalPeriodos: number }[];
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

/** Ítem 69: clasificación por tarea contra el objetivo configurado, con el
 * desglose en % (ítem 69bis). Verde = dentro de objetivo, amarillo =
 * después del objetivo pero dentro del límite, rojo = pasado el límite. */
function Clasificacion({ verde, amarillo, rojo, sinTs }: { verde: number; amarillo: number; rojo: number; sinTs: number }) {
  const totalClasif = verde + amarillo + rojo;
  if (totalClasif + sinTs === 0) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium">
        {verde > 0 && <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">{verde}</span>}
        {amarillo > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{amarillo}</span>}
        {rojo > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">{rojo}</span>}
        {sinTs > 0 && <span className="text-[10px] text-gray-400">({sinTs} sin ts)</span>}
      </span>
      {totalClasif > 0 && (
        <span className="text-[10px] text-gray-400">
          {Math.round((verde / totalClasif) * 100)}% · {Math.round((amarillo / totalClasif) * 100)}% · {Math.round((rojo / totalClasif) * 100)}%
        </span>
      )}
    </div>
  );
}

/** Ítem 69bis: promedio de días contra el objetivo y contra el límite,
 * para no depender solo del conteo verde/amarillo/rojo. */
function DiasObjetivoLimite({ objetivo, limite }: { objetivo: number | null; limite: number | null }) {
  if (objetivo === null && limite === null) return null;
  return (
    <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
      <span>Obj: <DeltaDias avg={objetivo} /></span>
      <span>Lím: <DeltaDias avg={limite} /></span>
    </div>
  );
}

export function ProductividadClient({ filas }: {
  filas: FilaLiquidadora[];
}) {
  const [liqSeleccionada, setLiqSeleccionada] = useState<string>(filas[0]?.id ?? "");

  const fila = filas.find((f) => f.id === liqSeleccionada);

  return (
    <div className="p-4 md:p-8">
      <ProductividadTabs current="/productividad" />
      <div className="mb-6 md:mb-8">
        <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Módulo Sueldos</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Productividad</h1>
        <p className="text-sm text-gray-400 mt-1">
          Rendimiento por liquidadora — clasificación contra el objetivo configurado al marcar cada tarea
        </p>
      </div>

      {/* Selector liquidadora */}
      <div className="flex gap-2 mb-4 md:mb-6 flex-wrap">
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
        <>
        <p className="text-[11px] text-gray-400 mb-3">
          <span className="text-green-700 font-medium">Verde</span> = dentro del objetivo · <span className="text-amber-700 font-medium">amarillo</span> = después del objetivo pero antes del límite · <span className="text-red-600 font-medium">rojo</span> = pasado el límite. &quot;sin ts&quot; = marcado antes de julio 2026 (sin registro de hora).
        </p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="sticky left-0 z-10 bg-gray-50 px-5 py-3 text-left font-medium">Período</th>
                  <th className="px-4 py-3 text-center font-medium">Clientes</th>
                  <th className="px-4 py-3 text-center font-medium">Legajos liquidados</th>
                  <th className="px-4 py-3 text-center font-medium">F.931 completadas</th>
                  <th className="px-4 py-3 text-center font-medium">F.931 contra objetivo</th>
                  <th className="px-4 py-3 text-center font-medium">Recibos completados</th>
                  <th className="px-4 py-3 text-center font-medium">Recibos contra objetivo</th>
                  <th className="px-4 py-3 text-center font-medium">Preliquidado</th>
                  <th className="px-4 py-3 text-center font-medium">% completitud</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...fila.meses].reverse().map((m) => {
                  const pct = m.total > 0 ? Math.round((m.completadas / m.total) * 100) : 0;
                  return (
                    <tr key={m.periodoId} className="group hover:bg-gray-50/60 transition-colors">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-5 py-3 text-[13px] font-medium text-gray-900 whitespace-nowrap">
                        {MESES_NOMBRES[m.mes]} {m.anio}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-gray-600">
                        {m.total}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] font-medium text-gray-900">
                        {m.legajos}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Pill value={m.f931Verde + m.f931Amarillo + m.f931Rojo + m.f931SinTs} total={m.total} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Clasificacion verde={m.f931Verde} amarillo={m.f931Amarillo} rojo={m.f931Rojo} sinTs={m.f931SinTs} />
                        <DiasObjetivoLimite objetivo={m.avgDiasF931Objetivo} limite={m.avgDiasF931Limite} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Pill value={m.recibosVerde + m.recibosAmarillo + m.recibosRojo + m.recibosSinTs} total={m.total} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Clasificacion verde={m.recibosVerde} amarillo={m.recibosAmarillo} rojo={m.recibosRojo} sinTs={m.recibosSinTs} />
                        <DiasObjetivoLimite objetivo={m.avgDiasRecibosObjetivo} limite={m.avgDiasRecibosLimite} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.preliquidadoCount > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                            {m.preliquidadoCount}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
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
        </div>

        {/* Ítem 72: clientes que más usan Preliquidado, para ver quién
            manda las novedades tarde de forma recurrente. */}
        {fila.clientesPreliquidado.length > 0 && (
          <div className="mt-5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-[13px] font-semibold text-gray-900">Clientes con &quot;Preliquidado&quot;</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Cuántas veces se tildó &quot;Preliquidado – esperando novedades&quot; (ítem 97) en toda la ventana de períodos — para ver qué clientes mandan tarde.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
              <table className="w-full min-w-[420px]">
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                    <th className="px-5 py-2.5 text-left font-medium">Cliente</th>
                    <th className="px-4 py-2.5 text-center font-medium">Veces preliquidado</th>
                    <th className="px-4 py-2.5 text-center font-medium">Períodos</th>
                    <th className="px-4 py-2.5 text-center font-medium">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fila.clientesPreliquidado.map((c) => {
                    const pct = c.totalPeriodos > 0 ? Math.round((c.veces / c.totalPeriodos) * 100) : 0;
                    return (
                      <tr key={c.clienteId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-2.5 text-[13px] font-medium text-gray-800">{c.nombre}</td>
                        <td className="px-4 py-2.5 text-center text-[13px] text-amber-700 font-medium">{c.veces}</td>
                        <td className="px-4 py-2.5 text-center text-[13px] text-gray-500">{c.totalPeriodos}</td>
                        <td className="px-4 py-2.5 text-center text-[13px] font-semibold text-gray-700">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
