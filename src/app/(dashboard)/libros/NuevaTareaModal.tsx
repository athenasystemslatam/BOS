"use client";

import { useState, useTransition } from "react";
import { ORIGEN_TAREA_LABEL } from "@/lib/libros";
import type { OrigenTareaLibro } from "@/types";
import { crearTareas } from "./actions";
import { INPUT, LABEL, Modal, Pie } from "./ModalBase";

export type OpcionLibro = { id: string; nombre: string; detalle?: string; enCola?: boolean };
export type Persona = { id: string; nombre: string };

export function NuevaTareaModal({
  clienteId,
  clienteNombre,
  opciones,
  preseleccionados,
  origenDefault,
  responsableDefault,
  equipo,
  onClose,
}: {
  clienteId: string;
  clienteNombre: string;
  opciones: OpcionLibro[];
  preseleccionados: string[];
  origenDefault: OrigenTareaLibro;
  responsableDefault: string | null;
  equipo: Persona[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(preseleccionados));
  const [origen, setOrigen] = useState<OrigenTareaLibro>(origenDefault);
  const [materialListo, setMaterialListo] = useState(false);
  const [fechaLimite, setFechaLimite] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [responsable, setResponsable] = useState(responsableDefault ?? "");
  const [observaciones, setObservaciones] = useState("");

  function toggle(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (elegidos.size === 0) return setError("Elegí al menos un libro.");
    startTransition(async () => {
      const res = await crearTareas({
        cliente_id: clienteId,
        libro_ids: Array.from(elegidos),
        origen,
        material_listo: materialListo,
        fecha_limite: fechaLimite || null,
        periodo_desde: desde || null,
        periodo_hasta: hasta || null,
        responsable_id: responsable || null,
        observaciones: observaciones.trim() || null,
      });
      if (res.error) return setError(res.error);
      if (res.creadas === 0) return setError("Esos libros ya tienen una tarea abierta en la cola.");
      onClose();
    });
  }

  return (
    <Modal titulo={clienteNombre} subtitulo="Nueva tarea" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>Libros</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {opciones.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer hover:bg-violet-50/40"
                >
                  <input
                    type="checkbox"
                    disabled={o.enCola}
                    checked={!o.enCola && elegidos.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="accent-violet-600"
                  />
                  <span className={o.enCola ? "text-gray-400" : "text-gray-800"}>{o.nombre}</span>
                  {o.enCola ? (
                    <span className="ml-auto text-[11px] text-gray-400">Ya está en la cola</span>
                  ) : (
                    o.detalle && <span className="ml-auto text-[11px] text-gray-400">{o.detalle}</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Origen</label>
              <select value={origen} onChange={(e) => setOrigen(e.target.value as OrigenTareaLibro)} className={INPUT}>
                {Object.entries(ORIGEN_TAREA_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Responsable</label>
              <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={INPUT}>
                <option value="">Sin asignar</option>
                {equipo.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={materialListo}
              onChange={(e) => setMaterialListo(e.target.checked)}
              className="accent-violet-600"
            />
            Material listo (el cliente ya mandó lo necesario)
          </label>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Período desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Período hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Fecha límite</label>
              <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className={INPUT} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            Fecha límite solo si la pide el cliente o un tercero (banco, IGJ, trámite): pasa la tarea a P1.
          </p>

          <div>
            <label className={LABEL}>Observaciones</label>
            <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={INPUT} />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Agregar a la cola" />
      </form>
    </Modal>
  );
}
