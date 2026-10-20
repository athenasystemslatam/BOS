"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { fmtFecha } from "@/lib/libros";
import { METRICAS, METRICA_LABEL, type MetricaObjetivo, type Objetivo } from "@/lib/librosObjetivosMetricas";
import { eliminarObjetivo, guardarObjetivo, type DatosObjetivo } from "../actions";
import { INPUT, LABEL, Modal, Pie } from "../ModalBase";
import { BOTON_SECUNDARIO, CHIP, MONO, PANEL, SEMAFORO } from "../ui";

// Machete SMART: cómo escribir un objetivo que se pueda seguir.
const SMART = [
  ["Específico", "Qué se mide, sin ambigüedad.", "“SA y SAS con el mandato cargado”, no “ordenar mandatos”."],
  ["Medible", "Un número que BOS calcula solo.", "% de SA y SAS con designación cargada."],
  ["Alcanzable", "Posible con el equipo y el tiempo que hay.", "50% de la puesta al día en 5 meses, no 100% en 1."],
  ["Relevante", "Mueve algo que importa para el estudio o el cliente.", "Renovar mandatos vencidos evita problemas con IGJ."],
  ["Temporal", "Tiene fecha límite (o es permanente, de mantenimiento).", "100% al 20/11/2026."],
];

function Smart() {
  return (
    <details className="relative inline-block align-middle">
      <summary
        aria-label="Cómo escribir un objetivo (SMART)"
        className="list-none cursor-pointer select-none w-5 h-5 rounded-full border border-line-rule text-[11px] font-semibold text-ink-muted flex items-center justify-center hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <div className="absolute z-20 left-0 mt-2 w-[min(420px,85vw)] rounded-[10px] border border-line-panel bg-paper shadow-lg p-3">
        <p className="text-[12px] font-semibold text-ink mb-2">Objetivos SMART</p>
        <dl className="space-y-1.5">
          {SMART.map(([letra, que, ejemplo]) => (
            <div key={letra} className="text-[12px] leading-snug">
              <dt className="inline font-semibold text-ink">{letra}: </dt>
              <dd className="inline text-ink-cell">{que}</dd>
              <p className="text-ink-subtle">Ej.: {ejemplo}</p>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

const VACIO: DatosObjetivo = { nombre: "", metrica: "mandatos_cargados", meta: 100, fecha_limite: null, estado: "actual", fecha_cumplimiento: null };

function ObjetivoModal({ objetivo, onClose }: { objetivo: Objetivo | null; onClose: () => void }) {
  const [datos, setDatos] = useState<DatosObjetivo>(() =>
    objetivo
      ? {
          nombre: objetivo.nombre,
          metrica: objetivo.metrica,
          meta: objetivo.meta,
          fecha_limite: objetivo.fecha_limite,
          estado: objetivo.estado,
          fecha_cumplimiento: objetivo.fecha_cumplimiento,
        }
      : VACIO
  );
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cambiar = (c: Partial<DatosObjetivo>) => setDatos((d) => ({ ...d, ...c }));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await guardarObjetivo(objetivo?.id ?? null, datos);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={objetivo ? "Editar objetivo" : "Nuevo objetivo"} subtitulo="Libros · Objetivos" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={LABEL}>Nombre</label>
            <input className={INPUT} value={datos.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Ej.: Mandatos cargados (SA y SAS)" />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Métrica (la calcula BOS)</label>
            <select className={INPUT} value={datos.metrica} onChange={(e) => cambiar({ metrica: e.target.value as MetricaObjetivo })}>
              {METRICAS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-ink-subtle mt-1">{METRICAS.find((m) => m.id === datos.metrica)?.detalle}</p>
          </div>
          <div>
            <label className={LABEL}>Meta (%)</label>
            <input type="number" min={1} max={100} step={1} className={clsx(INPUT, MONO)} value={datos.meta}
              onChange={(e) => cambiar({ meta: Number(e.target.value) })} />
          </div>
          <div>
            <label className={LABEL}>Fecha límite (vacía = permanente)</label>
            <input type="date" className={INPUT} value={datos.fecha_limite ?? ""} onChange={(e) => cambiar({ fecha_limite: e.target.value || null })} />
          </div>
          <div>
            <label className={LABEL}>Estado</label>
            <select className={INPUT} value={datos.estado}
              onChange={(e) => cambiar({ estado: e.target.value as DatosObjetivo["estado"] })}>
              <option value="actual">Actual</option>
              <option value="cumplido">Cumplido</option>
            </select>
          </div>
          {datos.estado === "cumplido" && (
            <div>
              <label className={LABEL}>Fecha de cumplimiento</label>
              <input type="date" className={INPUT} value={datos.fecha_cumplimiento ?? ""}
                onChange={(e) => cambiar({ fecha_cumplimiento: e.target.value || null })} />
            </div>
          )}
          <p className="sm:col-span-2 text-[11.5px] text-ink-subtle">
            Los objetivos con fecha pasan solos a Cumplido cuando la métrica llega a la meta. Los permanentes no se cierran.
          </p>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function ObjetivosCard({ objetivos }: { objetivos: Objetivo[] }) {
  const [editando, setEditando] = useState<Objetivo | null | "nuevo">(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function borrar(o: Objetivo) {
    if (!window.confirm(`¿Borrar el objetivo "${o.nombre}"?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarObjetivo(o.id);
      if (res.error) setError(res.error);
    });
  }

  return (
    <section className={clsx(PANEL, "p-6", pendiente && "opacity-60")}>
      <div className="flex items-start gap-2 mb-3">
        <h2 className="font-archivo text-[15px] font-bold text-ink">Objetivos</h2>
        <Smart />
        <div className="flex-1" />
        <button type="button" onClick={() => setEditando("nuevo")} className={BOTON_SECUNDARIO}>
          <Plus size={14} aria-hidden="true" /> Nuevo
        </button>
      </div>
      {objetivos.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Todavía no hay objetivos cargados.</p>
      ) : (
        <ul className="divide-y divide-line-row">
          {objetivos.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">{o.nombre}</p>
                <p className="text-[11.5px] text-ink-subtle">
                  {METRICA_LABEL[o.metrica]} · meta <span className={MONO}>{o.meta}%</span>
                  {o.fecha_limite ? (
                    <>
                      {" "}al <span className={MONO}>{fmtFecha(o.fecha_limite)}</span>
                    </>
                  ) : (
                    " · permanente"
                  )}
                </p>
              </div>
              <span className={clsx(CHIP, o.estado === "cumplido" ? SEMAFORO.verde : SEMAFORO.sinDato)}>
                {o.estado === "cumplido" ? (
                  <>
                    Cumplido <span className={MONO}>{fmtFecha(o.fecha_cumplimiento)}</span>
                  </>
                ) : (
                  "Actual"
                )}
              </span>
              <button type="button" onClick={() => setEditando(o)} aria-label={`Editar ${o.nombre}`} className="text-ink-subtle hover:text-ink p-1">
                <Pencil size={14} />
              </button>
              <button type="button" onClick={() => borrar(o)} aria-label={`Borrar ${o.nombre}`} className="text-ink-subtle hover:text-red-700 p-1">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
      {editando && <ObjetivoModal objetivo={editando === "nuevo" ? null : editando} onClose={() => setEditando(null)} />}
    </section>
  );
}
