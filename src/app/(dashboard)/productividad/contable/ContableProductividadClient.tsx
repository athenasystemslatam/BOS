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
    terminadosEnTermino: number;
    margenProm: number | null;
    demoraClienteProm: number | null;
    tiempoInternoProm: number | null;
    frenados: number;
    diasFrenadoProm: number | null;
    pctFormularios: number | null;
    f855EnTermino: number;
    f855Total: number;
  }[];
}

function Pill({ value, total }: { value: number; total: number }) {
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  const pct = Math.round((value / total) * 100);
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded",
      pct === 100 ? "bg-green-50 text-green-700" : pct >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
    )}>
      {value}/{total}
    </span>
  );
}

function DeltaDias({ avg }: { avg: number | null }) {
  if (avg === null) return <span className="text-gray-300 text-xs">—</span>;
  const label = avg >= 0 ? `+${Math.round(avg)}d` : `${Math.round(avg)}d`;
  return (
    <span className={clsx("text-xs font-medium", avg >= 3 ? "text-green-600" : avg >= 0 ? "text-amber-600" : "text-red-600")}>
      {label}
    </span>
  );
}

function DiasSimple({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-gray-300 text-xs">—</span>;
  return <span className="text-xs text-gray-600 font-medium">{Math.round(dias)}d</span>;
}

function PctPill({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className={clsx(
      "text-xs font-semibold",
      pct === 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600"
    )}>
      {pct}%
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
          Por contador y año fiscal, contra el objetivo del área — cuenta doble si el balance tiene 2 responsables
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
            <table className="w-full min-w-[1080px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Año fiscal</th>
                  <th className="px-4 py-3 text-center font-medium">Balances</th>
                  <th className="px-4 py-3 text-center font-medium">En término</th>
                  <th className="px-4 py-3 text-center font-medium">Margen prom.</th>
                  <th className="px-4 py-3 text-center font-medium">Demora cliente</th>
                  <th className="px-4 py-3 text-center font-medium">Tiempo interno</th>
                  <th className="px-4 py-3 text-center font-medium">Frenados</th>
                  <th className="px-4 py-3 text-center font-medium">Formularios</th>
                  <th className="px-4 py-3 text-center font-medium">F.855 en término</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...fila.anios].reverse().map((a) => (
                  <tr key={a.anio} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3 text-[13px] font-medium text-gray-900 whitespace-nowrap">{a.anio}</td>
                    <td className="px-4 py-3 text-center text-[13px] text-gray-600">{a.total}</td>
                    <td className="px-4 py-3 text-center">
                      <Pill value={a.terminadosEnTermino} total={a.total} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <DeltaDias avg={a.margenProm} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <DiasSimple dias={a.demoraClienteProm} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <DiasSimple dias={a.tiempoInternoProm} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.frenados > 0 ? (
                        <span className="text-[13px] text-red-600 font-medium">
                          {a.frenados}
                          {a.diasFrenadoProm !== null && (
                            <span className="text-[11px] text-red-400 font-normal"> ({a.diasFrenadoProm}d prom.)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PctPill pct={a.pctFormularios} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Pill value={a.f855EnTermino} total={a.f855Total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-50 text-[11px] text-gray-400 space-y-0.5">
            <p>&quot;Balances&quot; y &quot;En término&quot; no cuentan los frenados. &quot;En término&quot; = llegó a En ARCA antes de su vencimiento (regla, prórroga o fecha manual de Productividad → Configuración).</p>
            <p>&quot;Demora cliente&quot; = días entre pedido y recepción de información. &quot;Tiempo interno&quot; = días entre recepción y Legalizado.</p>
            <p>&quot;Formularios&quot; = % presentados de 855/899/713/657/IGJ/tasa, sin contar los que no aplican. &quot;F.855 en término&quot; se mide aparte, contra su propio vencimiento.</p>
          </div>
        </div>
      )}
    </div>
  );
}
