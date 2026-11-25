"use client";

import { useState, useTransition } from "react";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { hoyAR } from "@/lib/estadoVigente";
import { darDeBajaServicio } from "@/app/(dashboard)/panel-general/actions";

// Modal compartido para dar de baja un servicio puntual desde adentro de
// cada módulo (Sueldos, Impuestos, Contable, Monotributo) — misma acción de
// servidor que ya usa Panel General desde la Fase 1, así que no hace falta
// nada nuevo del lado del servidor. Libros queda afuera a propósito: tiene
// su propia ficha de cliente, no esta pantalla en línea.
export function DarDeBajaServicioModal({
  clienteId,
  clienteNombre,
  servicio,
  subtipo,
  servicioLabel,
  onClose,
  onConfirmado,
}: {
  clienteId: string;
  clienteNombre: string;
  servicio: string;
  subtipo: string;
  /** Nombre a mostrar del servicio (ej. "Impuestos — IVA", "Monotributo"). */
  servicioLabel: string;
  onClose: () => void;
  /** Se llama después de que la baja se guardó bien — típicamente router.refresh(). */
  onConfirmado: () => void;
}) {
  const backdrop = useBackdropClose(onClose);
  const [fecha, setFecha] = useState(hoyAR);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function confirmar() {
    setError("");
    startTransition(async () => {
      const res = await darDeBajaServicio(clienteId, servicio, subtipo, fecha);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onConfirmado();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">¿Dar de baja el servicio?</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {clienteNombre} — {servicioLabel}
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-gray-600">
            El cliente sigue activo con sus otros servicios. Elegí desde cuándo deja de verse en Seguimiento.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-gray-500 block mb-1">
              Fecha de baja — a partir de ese día deja de aparecer en Seguimiento
            </span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          </label>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold text-white bg-danger rounded-lg hover:brightness-95 disabled:opacity-50"
            >
              {isPending ? "Dando de baja…" : "Sí, dar de baja el servicio"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
