"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { deshacerCambios } from "@/app/(dashboard)/monotributo/historialActions";

/** Aviso "Deshacer" que aparece unos segundos después de un cambio (Monotributo).
 * Deshacer revierte las entradas del historial de ese cambio: no borra nada, deja
 * una entrada nueva. `ofrecer(ids, texto, alDeshacer)` lo muestra. */
export function useDeshacer(segundos = 8) {
  const [actual, setActual] = useState<{ ids: string[]; texto: string; alDeshacer?: () => void } | null>(null);
  const [estado, setEstado] = useState<"listo" | "deshaciendo" | "error">("listo");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const ofrecer = useCallback((ids: string[] | undefined, texto: string, alDeshacer?: () => void) => {
    if (!ids?.length) return;
    clearTimeout(timer.current);
    setEstado("listo");
    setError(null);
    setActual({ ids, texto, alDeshacer });
    timer.current = setTimeout(() => setActual(null), segundos * 1000);
  }, [segundos]);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function deshacer() {
    if (!actual) return;
    clearTimeout(timer.current);
    setEstado("deshaciendo");
    const r = await deshacerCambios(actual.ids).catch(() => ({ error: "No hay conexión con el servidor." }));
    if ("error" in r) {
      setEstado("error");
      setError(r.error);
      timer.current = setTimeout(() => setActual(null), 8000);
      return;
    }
    actual.alDeshacer?.();
    setActual(null);
  }

  const aviso = actual ? (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-gray-900 text-white shadow-lg rounded-xl px-4 py-2.5 text-[13px]">
      <span>{estado === "error" ? `No se pudo deshacer: ${error}` : actual.texto}</span>
      {estado !== "error" && (
        <button onClick={deshacer} disabled={estado === "deshaciendo"} className="flex items-center gap-1 font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-50">
          <RotateCcw size={13} /> {estado === "deshaciendo" ? "Deshaciendo…" : "Deshacer"}
        </button>
      )}
      <button onClick={() => setActual(null)} className="text-gray-400 hover:text-white" title="Cerrar"><X size={14} /></button>
    </div>
  ) : null;

  return { ofrecer, aviso };
}
