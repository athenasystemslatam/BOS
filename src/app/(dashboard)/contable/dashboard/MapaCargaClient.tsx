"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Map as MapIcon } from "lucide-react";

const MESES_ABR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

type Contador = { id: string; nombre: string };
type BalanceLigero = {
  responsable_id: string | null;
  responsable2_id: string | null;
  fechaCierre: string;
  fechaVencimiento: string;
};

function mesDe(fechaISO: string): { anio: number; mes: number } {
  const [anio, mes] = fechaISO.split("-").map(Number);
  return { anio, mes };
}

// Más intenso cuanto más alto el conteo contra el máximo de toda la grilla
// (no por fila), así se ve de un vistazo dónde está el pico real del
// estudio, no solo el pico relativo de cada contador.
function colorCarga(count: number, max: number): string {
  if (count === 0 || max === 0) return "transparent";
  const intensidad = 0.15 + (count / max) * 0.65;
  return `rgba(16, 185, 129, ${intensidad.toFixed(2)})`;
}

export function MapaCargaClient({
  contadores,
  balances,
  anios,
}: {
  contadores: Contador[];
  balances: BalanceLigero[];
  anios: number[];
}) {
  // Ítem 125: por defecto "por vencimiento" — es lo que importa para
  // detectar picos de carga próximos, no el mes en que cerró el ejercicio.
  const [modo, setModo] = useState<"cierre" | "vencimiento">("vencimiento");

  const meses = useMemo(() => {
    const out: { anio: number; mes: number; label: string }[] = [];
    for (const anio of anios) {
      for (let mes = 1; mes <= 12; mes++) {
        out.push({ anio, mes, label: `${MESES_ABR[mes - 1]} ${String(anio).slice(2)}` });
      }
    }
    return out;
  }, [anios]);

  // Mapa contadorId -> "anio-mes" -> cantidad
  const { conteos, max } = useMemo(() => {
    const mapa = new Map<string, Map<string, number>>();
    for (const c of contadores) mapa.set(c.id, new Map());
    let maxLocal = 0;

    for (const b of balances) {
      const fecha = modo === "cierre" ? b.fechaCierre : b.fechaVencimiento;
      const { anio, mes } = mesDe(fecha);
      const key = `${anio}-${mes}`;
      const resps = [b.responsable_id, b.responsable2_id].filter(Boolean) as string[];
      for (const respId of resps) {
        const porMes = mapa.get(respId);
        if (!porMes) continue;
        const nuevo = (porMes.get(key) ?? 0) + 1;
        porMes.set(key, nuevo);
        if (nuevo > maxLocal) maxLocal = nuevo;
      }
    }
    return { conteos: mapa, max: maxLocal };
  }, [contadores, balances, modo]);

  const filas = contadores
    .map((c) => ({ ...c, porMes: conteos.get(c.id) ?? new Map<string, number>() }))
    .filter((f) => Array.from(f.porMes.values()).some((v) => v > 0))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <MapIcon size={14} className="text-emerald-500" />
        <h2 className="text-[14px] font-semibold text-gray-900">Mapa de carga por contador</h2>
        <p className="text-[11px] text-gray-400 ml-1">cantidad de balances por mes — detecta picos y sobrecarga</p>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg ml-auto">
          {(["cierre", "vencimiento"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={clsx(
                "px-3 py-1.5 text-[12px] font-medium rounded-md transition-all",
                modo === m ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {m === "cierre" ? "Por fecha de cierre" : "Por fecha de vencimiento"}
            </button>
          ))}
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="py-14 text-center text-[13px] text-gray-400">Sin balances en esta ventana</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="sticky left-0 z-10 bg-white px-5 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                  Contador
                </th>
                {meses.map((m) => (
                  <th key={m.label} className="px-1.5 py-2.5 text-center font-medium text-gray-400 text-[10px] w-10">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="sticky left-0 z-10 bg-white px-5 py-2 text-[12px] font-medium text-gray-700">
                    {f.nombre}
                  </td>
                  {meses.map((m) => {
                    const key = `${m.anio}-${m.mes}`;
                    const count = f.porMes.get(key) ?? 0;
                    const bg = colorCarga(count, max);
                    const intensidad = max > 0 ? count / max : 0;
                    return (
                      <td
                        key={key}
                        className="px-1.5 py-2 text-center"
                        style={{ backgroundColor: bg }}
                        title={`${f.nombre} — ${m.label}: ${count} balance${count === 1 ? "" : "s"}`}
                      >
                        <span className={clsx(
                          "font-medium",
                          count === 0 ? "text-gray-200" : intensidad > 0.5 ? "text-white" : "text-emerald-900"
                        )}>
                          {count || ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 py-3 border-t border-gray-50 text-[11px] text-gray-400">
        Cada celda = cantidad de balances no finalizados que {modo === "cierre" ? "cierran" : "vencen"} ese mes para ese contador — más oscuro, más carga.
        Un balance con dos responsables aparece en la fila de ambos. El color es relativo al mes de mayor carga de todo el estudio.
      </div>
    </div>
  );
}
