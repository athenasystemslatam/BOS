"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { PRIORIDADES, PRIORIDAD_INFO, UMBRAL_FOLIOS, fmtFecha, hoyISO } from "@/lib/libros";
import type { PrioridadLibro } from "@/types";
import { cambiarPrioridad, registrarCopiado, type ItemCopiado } from "./actions";
import { INPUT, LABEL, Modal, Pie, aEntero } from "./ModalBase";
import type { TareaVista } from "./SeguimientoLibrosClient";

export function PrioridadModal({ tarea, onClose }: { tarea: TareaVista; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [eleccion, setEleccion] = useState<PrioridadLibro | "auto">(tarea.prioridad_manual ?? "auto");
  const [motivo, setMotivo] = useState(tarea.prioridad_motivo ?? "");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (eleccion !== "auto" && !motivo.trim()) return setError("Contá por qué cambiás la prioridad.");
    startTransition(async () => {
      const res = await cambiarPrioridad(tarea.id, eleccion === "auto" ? null : eleccion, motivo);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={`${tarea.libroNombre} · ${tarea.clienteNombre}`} subtitulo="Prioridad" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 space-y-3">
          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
            <input
              type="radio"
              checked={eleccion === "auto"}
              onChange={() => setEleccion("auto")}
              className="accent-violet-600 mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-800">La que propone el sistema: {tarea.sugerida}</span>
              <span className="block text-[11px] text-gray-400">{tarea.motivoSugerido}</span>
            </span>
          </label>
          {PRIORIDADES.map((p) => (
            <label key={p} className="flex items-center gap-2.5 text-[13px] cursor-pointer">
              <input
                type="radio"
                checked={eleccion === p}
                onChange={() => setEleccion(p)}
                className="accent-violet-600"
              />
              <span className={clsx("text-[11px] font-medium rounded-full px-2 py-0.5", PRIORIDAD_INFO[p].cls)}>
                {PRIORIDAD_INFO[p].label}
              </span>
              <span className="text-gray-400 text-[11px]">a mano</span>
            </label>
          ))}
          {eleccion !== "auto" && (
            <div>
              <label className={LABEL}>Motivo</label>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej.: el cliente lo necesita para el banco la semana que viene"
                className={INPUT}
              />
            </div>
          )}
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} />
      </form>
    </Modal>
  );
}

type FilaCopiado = { incluir: boolean; folios: string; hasta: string };

export function RegistrarCopiadoModal({
  clienteNombre,
  tareas,
  onClose,
}: {
  clienteNombre: string;
  tareas: TareaVista[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<string[] | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [filas, setFilas] = useState<Record<string, FilaCopiado>>(() =>
    Object.fromEntries(
      tareas.map((t) => [t.id, { incluir: true, folios: "", hasta: t.periodo_hasta ?? t.exigible ?? "" }])
    )
  );

  function cambiar(id: string, cambio: Partial<FilaCopiado>) {
    setFilas((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }));
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const elegidas = tareas.filter((t) => filas[t.id].incluir);
    if (elegidas.length === 0) return setError("Elegí al menos un libro.");
    const items: ItemCopiado[] = [];
    for (const t of elegidas) {
      const f = filas[t.id];
      const folios = aEntero(f.folios);
      if (folios == null || Number.isNaN(folios) || folios < 0) {
        return setError(`Cargá los folios usados de ${t.libroNombre} (0 si no se usó ninguno).`);
      }
      if (t.libres != null && folios > t.libres) {
        return setError(`${t.libroNombre} tiene ${t.libres} folios libres: abrí un tomo nuevo desde la ficha.`);
      }
      if (!f.hasta) return setError(`Indicá hasta qué período se copió ${t.libroNombre}.`);
      items.push({ tarea_id: t.id, folios_usados: folios, periodo_hasta: f.hasta });
    }
    startTransition(async () => {
      const res = await registrarCopiado(items, fecha);
      if (res.error) return setError(res.error);
      if (res.alertas?.length) setAlertas(res.alertas);
      else onClose();
    });
  }

  if (alertas) {
    return (
      <Modal titulo={clienteNombre} subtitulo="Copiado registrado" onClose={onClose}>
        <div className="px-6 py-5 space-y-3">
          <p className="text-[13px] text-gray-700">
            Listo, las tareas pasaron al historial. Ojo con estos libros ({UMBRAL_FOLIOS} folios libres o menos):
          </p>
          <ul className="space-y-2">
            {alertas.map((a) => (
              <li key={a} className="flex gap-2 text-[12px] text-red-700 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {a}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg"
          >
            Entendido
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={clienteNombre} subtitulo="Registrar copiado" onClose={onClose} ancho="max-w-3xl">
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="w-48">
            <label className={LABEL}>Fecha del copiado</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 w-8" />
                <th className="py-2 text-left">Libro</th>
                <th className="py-2 text-center">Libres</th>
                <th className="py-2 text-center">Último copiado</th>
                <th className="py-2 text-left px-2">Folios usados</th>
                <th className="py-2 text-left px-2">Copiado hasta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tareas.map((t) => {
                const f = filas[t.id];
                return (
                  <tr key={t.id} className={f.incluir ? "" : "opacity-40"}>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={f.incluir}
                        onChange={(e) => cambiar(t.id, { incluir: e.target.checked })}
                        className="accent-violet-600"
                      />
                    </td>
                    <td className="py-2 text-[13px] text-gray-800">
                      {t.libroNombre} <span className="text-gray-400 text-[11px]">T{t.tomo}</span>
                    </td>
                    <td className={clsx("py-2 text-center text-[12px]", t.libres != null && t.libres <= UMBRAL_FOLIOS ? "text-red-600 font-medium" : "text-gray-600")}>
                      {t.libres ?? "—"}
                    </td>
                    <td className="py-2 text-center text-[12px] text-gray-500">{fmtFecha(t.ultimoCopiado)}</td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={0}
                        value={f.folios}
                        disabled={!f.incluir}
                        onChange={(e) => cambiar(t.id, { folios: e.target.value })}
                        className={clsx(INPUT, "w-24")}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="date"
                        value={f.hasta}
                        disabled={!f.incluir}
                        onChange={(e) => cambiar(t.id, { hasta: e.target.value })}
                        className={clsx(INPUT, "w-40")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400">
            Suma los folios al libro, actualiza su último período copiado y pasa la tarea al historial. Si un libro
            queda con {UMBRAL_FOLIOS} folios libres o menos, se crea el pedido de presupuesto de tomo nuevo.
          </p>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Registrar copiado" />
      </form>
    </Modal>
  );
}
