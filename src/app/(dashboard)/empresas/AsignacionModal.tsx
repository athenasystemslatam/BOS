"use client";

import { useState, useTransition } from "react";
import { X, History, ChevronRight } from "lucide-react";
import { Asignacion, Cliente, Liquidadora } from "@/types";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { getAsignaciones, crearAsignacion } from "./actions";

const MESES = MESES_NOMBRES.slice(1).map((nombre, i) => ({ valor: i + 1, nombre }));

function periodoLabel(anio: number, mes: number) {
  return `${MESES_NOMBRES[mes]} ${anio}`;
}

export function AsignacionModal({
  cliente,
  liquidadoras,
  creadoPor,
  onClose,
}: {
  cliente: Cliente & { liquidadora?: Liquidadora };
  liquidadoras: Liquidadora[];
  creadoPor: string | null;
  onClose: () => void;
}) {
  const hoy = new Date();
  const [historial, setHistorial] = useState<Asignacion[]>([]);
  const [cargado, setCargado] = useState(false);
  const [nuevaLiq, setNuevaLiq] = useState("");
  const [desdeMes, setDesdeMes] = useState(hoy.getMonth() + 1);
  const [desdeAnio, setDesdeAnio] = useState(hoy.getFullYear());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Cargar historial al abrir
  if (!cargado) {
    setCargado(true);
    getAsignaciones(cliente.id).then(setHistorial);
  }

  function handleGuardar() {
    if (!nuevaLiq) { setError("Seleccioná una liquidadora."); return; }
    setError("");
    startTransition(async () => {
      const res = await crearAsignacion(cliente.id, nuevaLiq, desdeAnio, desdeMes, motivo || null, creadoPor);
      if (res.error) { setError(res.error); return; }
      const nuevo = await getAsignaciones(cliente.id);
      setHistorial(nuevo);
      setNuevaLiq("");
      setMotivo("");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <History size={18} className="text-bordo" />
            <div>
              <p className="text-[13px] font-semibold text-gray-900">{cliente.nombre}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Historial de liquidadoras</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Historial */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Historial
            </p>
            {historial.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">
                <p>Sin reasignaciones registradas.</p>
                <p className="text-[12px] mt-1">
                  Liquidadora actual:{" "}
                  <span className="font-medium text-gray-700">
                    {cliente.liquidadora?.nombre ?? "—"}
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {historial.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-2 text-[13px]">
                    <div className="flex items-center gap-1.5 text-gray-500 w-28 shrink-0">
                      <span className="font-medium text-bordo">
                        {periodoLabel(a.desde_anio, a.desde_mes)}
                      </span>
                    </div>
                    <ChevronRight size={12} className="text-gray-300 shrink-0" />
                    <span className={i === 0 ? "font-semibold text-gray-900" : "text-gray-600"}>
                      {(a.liquidadora as { nombre: string } | undefined)?.nombre ?? "—"}
                    </span>
                    {i === 0 && (
                      <span className="ml-1 text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                        actual
                      </span>
                    )}
                    {a.motivo && (
                      <span className="text-[11px] text-gray-400 ml-1 truncate">— {a.motivo}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nueva reasignación */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Nueva reasignación
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  Nueva liquidadora
                </label>
                <select
                  value={nuevaLiq}
                  onChange={(e) => setNuevaLiq(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
                >
                  <option value="">Seleccioná…</option>
                  {liquidadoras.map((l) => (
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
                  placeholder="Ej: reemplaza a Diego por renuncia"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={handleGuardar}
            disabled={isPending || !nuevaLiq}
            className="text-sm font-medium bg-bordo text-white px-4 py-2 rounded-lg hover:bg-bordo/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar reasignación"}
          </button>
        </div>
      </div>
    </div>
  );
}
