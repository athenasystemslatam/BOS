"use client";

import { useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { hoyArgentina } from "@/lib/monotributo";
import type { CambiosTarea } from "@/app/(dashboard)/monotributo/actions";

export const DEUDA_LABEL = { sin_verificar: "Sin verificar", no: "No", si: "Sí" } as const;
export type DeudaEstado = keyof typeof DEUDA_LABEL;

/** Campos de la deuda de una fila del mes (monotributo_tareas). */
export type DatosDeuda = {
  deuda_estado: DeudaEstado;
  deuda_periodos: string | null;
  deuda_texto_original: string | null;
  deuda_nota: string | null;
  deuda_monto: number | null;
  deuda_aviso: boolean;
  deuda_aviso_fecha: string | null;
  deuda_resuelta: boolean;
  deuda_resuelta_fecha: string | null;
};

/** NOTAS de la planilla, sacadas del texto original importado ("DEUDA: SI | PERIODOS: … | NOTAS: …"). */
function notasDeLaPlanilla(textoOriginal: string | null): string {
  const m = (textoOriginal ?? "").match(/NOTAS:\s*(.*)$/);
  return m ? m[1].trim() : "";
}

/** Ventana chica de la deuda del mes: estado, períodos, importe, avisada (+fecha), abonada (+fecha) y nota.
 * Precargada con lo importado de la planilla. Guarda con historial y "Deshacer". */
export function DeudaMonotributoModal({
  nombre,
  tarea,
  mes,
  anio,
  puedeEditar,
  onGuardar,
  onClose,
}: {
  nombre: string;
  tarea: DatosDeuda;
  mes: number;
  anio: number;
  puedeEditar: boolean;
  onGuardar: (cambios: CambiosTarea) => void;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<DeudaEstado>(tarea.deuda_estado);
  const [periodos, setPeriodos] = useState(tarea.deuda_periodos ?? "");
  const [monto, setMonto] = useState(tarea.deuda_monto === null ? "" : String(tarea.deuda_monto).replace(".", ","));
  const [avisada, setAvisada] = useState(tarea.deuda_aviso);
  const [avisadaFecha, setAvisadaFecha] = useState(tarea.deuda_aviso_fecha ?? "");
  const [abonada, setAbonada] = useState(tarea.deuda_resuelta);
  const [abonadaFecha, setAbonadaFecha] = useState(tarea.deuda_resuelta_fecha ?? "");
  const [nota, setNota] = useState(tarea.deuda_nota ?? notasDeLaPlanilla(tarea.deuda_texto_original));
  const [err, setErr] = useState<string | null>(null);

  function guardar() {
    const limpio = monto.trim().replace(/\$|\s/g, "");
    const m = limpio === "" ? null : Number(limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio);
    if (m !== null && (!Number.isFinite(m) || m < 0)) return setErr("El importe tiene que ser un número (ej. 208.274,38).");
    onGuardar({
      deuda_estado: estado,
      deuda_periodos: periodos.trim() || null,
      deuda_monto: m,
      deuda_aviso: avisada,
      deuda_aviso_fecha: avisada ? (avisadaFecha || hoyArgentina()) : null,
      // Abonada: sale de "con deuda" y de las alertas; el registro y las fechas quedan.
      deuda_resuelta: estado === "si" && abonada,
      deuda_resuelta_fecha: estado === "si" && abonada ? (abonadaFecha || hoyArgentina()) : null,
      deuda_nota: nota.trim() || null,
    });
  }

  const input = "w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 disabled:bg-gray-50";
  const label = "text-[10.5px] font-semibold tracking-[.08em] uppercase text-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.14em] uppercase text-gray-400">Deuda · {MESES_NOMBRES[mes]} {anio}</p>
            <h2 className="text-[15px] font-semibold text-gray-900 mt-0.5">{nombre}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            {(["si", "no", "sin_verificar"] as DeudaEstado[]).map((k) => (
              <button
                key={k}
                disabled={!puedeEditar}
                onClick={() => setEstado(k)}
                className={clsx(
                  "text-[12px] px-3 py-1.5 rounded-lg border font-medium",
                  estado === k
                    ? k === "si" ? "bg-red-50 border-red-300 text-red-700" : k === "no" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-white border-gray-200 text-gray-500"
                )}
              >
                {DEUDA_LABEL[k]}
              </button>
            ))}
          </div>
          <div>
            <p className={label}>Períodos adeudados</p>
            <input className={input} value={periodos} onChange={(e) => setPeriodos(e.target.value)} disabled={!puedeEditar} placeholder="ej. 07/2026 + intereses" />
          </div>
          <div>
            <p className={label}>Importe (opcional)</p>
            <input className={input} value={monto} onChange={(e) => setMonto(e.target.value)} disabled={!puedeEditar} placeholder="ej. 208.274,38" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-gray-700 shrink-0">
              <input type="checkbox" checked={avisada} onChange={(e) => setAvisada(e.target.checked)} disabled={!puedeEditar} className="accent-bordo" />
              Avisada al cliente
            </label>
            {avisada && <input type="date" className={input} value={avisadaFecha} onChange={(e) => setAvisadaFecha(e.target.value)} disabled={!puedeEditar} />}
          </div>
          <div className="flex items-center gap-3">
            <label className={clsx("flex items-center gap-2 text-[13px] shrink-0", estado === "si" ? "text-gray-700" : "text-gray-300")}>
              <input type="checkbox" checked={estado === "si" && abonada} onChange={(e) => setAbonada(e.target.checked)} disabled={!puedeEditar || estado !== "si"} className="accent-bordo" />
              El cliente la abonó
            </label>
            {estado === "si" && abonada && <input type="date" className={input} value={abonadaFecha} onChange={(e) => setAbonadaFecha(e.target.value)} disabled={!puedeEditar} />}
          </div>
          <div>
            <p className={label}>Nota</p>
            <textarea className={clsx(input, "resize-y")} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} disabled={!puedeEditar} placeholder="—" />
          </div>
          {tarea.deuda_texto_original && (
            <p className="text-[11px] text-gray-400">Planilla: {tarea.deuda_texto_original}</p>
          )}
          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-[13px] px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600">
            {puedeEditar ? "Cancelar" : "Cerrar"}
          </button>
          {puedeEditar && (
            <button onClick={guardar} className="text-[13px] px-4 py-1.5 rounded-lg bg-gray-900 text-white font-medium">Guardar</button>
          )}
        </div>
      </div>
    </div>
  );
}
