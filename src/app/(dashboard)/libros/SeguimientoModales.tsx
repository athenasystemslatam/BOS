"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, Receipt } from "lucide-react";
import { DEFINICION_PRIORIDAD, PRIORIDADES, PRIORIDAD_INFO, UMBRAL_FOLIOS, fmtFecha, hoyISO } from "@/lib/libros";
import type { PrioridadLibro } from "@/types";
import { cambiarPrioridad, enviarACopiar, registrarCopiado, type ItemCopiado } from "./actions";
import { INPUT, LABEL, Modal, Pie, aEntero } from "./ModalBase";
import type { TareaVista } from "./SeguimientoLibrosClient";
import { NUM } from "./ui";

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
              className="accent-bordo mt-0.5"
            />
            <span>
              <span className="font-medium text-ink">La que propone el sistema: {tarea.sugerida}</span>
              <span className="block text-[11px] text-ink-subtle">{tarea.motivoSugerido}</span>
            </span>
          </label>
          {PRIORIDADES.map((p) => (
            <label key={p} className="flex items-start gap-2.5 text-[13px] cursor-pointer">
              <input
                type="radio"
                checked={eleccion === p}
                onChange={() => setEleccion(p)}
                className="accent-bordo mt-1"
              />
              <span>
                <span className="flex items-center gap-2">
                  <span className={clsx("text-[11px] font-medium rounded-full px-2 py-0.5", PRIORIDAD_INFO[p].cls)}>
                    {PRIORIDAD_INFO[p].label}
                  </span>
                  <span className="text-ink-subtle text-[11px]">a mano</span>
                </span>
                <span className="block mt-0.5 text-[11px] text-ink-subtle leading-snug">{DEFINICION_PRIORIDAD[p]}</span>
              </span>
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

export function EnviarACopiarModal({
  clienteNombre,
  tareas,
  copiandoseId,
  onClose,
}: {
  clienteNombre: string;
  tareas: TareaVista[];
  copiandoseId: string | null;
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [persona, setPersona] = useState("");
  const [mensajeria, setMensajeria] = useState(false);
  const disponibles = tareas.filter((t) => t.estado_id !== copiandoseId);
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(disponibles.map((t) => t.id)));

  function toggle(id: string) {
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (elegidas.size === 0) return setError("Elegí al menos un libro.");
    startTransition(async () => {
      const res = await enviarACopiar(Array.from(elegidas), { fecha, persona: persona || null, es_mensajeria: mensajeria });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={clienteNombre} subtitulo="Enviar a copiar" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            {disponibles.map((t) => (
              <label key={t.id} className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={elegidas.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="accent-bordo"
                />
                {t.libroNombre} {t.tomo > 1 && <span className="text-[11px] text-ink-subtle">Tomo {t.tomo}</span>}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Fecha de envío</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Quién lo lleva (opcional)</label>
              <input value={persona} onChange={(e) => setPersona(e.target.value)} className={INPUT} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={mensajeria}
              onChange={(e) => setMensajeria(e.target.checked)}
              className="accent-bordo"
            />
            Por mensajería
          </label>
          <p className="text-[11px] text-ink-subtle">
            Registra la salida a la copiadora y pasa las tareas a Copiándose. Cuando vuelvan, usá &ldquo;Retirado /
            Registrar copiado&rdquo;.
          </p>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Enviar a copiar" />
      </form>
    </Modal>
  );
}

type FilaCopiado = { incluir: boolean; folios: string; hasta: string };

// "Copiado hasta" propuesto: el último cierre exigible del libro. En el envío
// anual, si el balance que lo originó cierra después, ese cierre. Sin exigible
// (libros por evento) queda el período de la tarea, o vacío.
function hastaPropuesto(t: TareaVista): string {
  if (t.origen === "balance" && t.periodo_hasta && (!t.exigible || t.periodo_hasta > t.exigible)) return t.periodo_hasta;
  return t.exigible ?? t.periodo_hasta ?? "";
}

export function RegistrarCopiadoModal({
  clienteNombre,
  tareas,
  copiandoseId,
  onClose,
}: {
  clienteNombre: string;
  tareas: TareaVista[];
  copiandoseId: string | null;
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ alertas: string[]; facturaPendiente: boolean } | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  // Si algo está en la copiadora, se propone eso: es lo que se acaba de retirar.
  const hayEnCopiadora = tareas.some((t) => t.estado_id === copiandoseId);
  const [filas, setFilas] = useState<Record<string, FilaCopiado>>(() =>
    Object.fromEntries(
      tareas.map((t) => [
        t.id,
        {
          incluir: !hayEnCopiadora || t.estado_id === copiandoseId,
          folios: "",
          hasta: hastaPropuesto(t),
        },
      ])
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
      if (res.alertas?.length || res.facturaPendiente) {
        setResultado({ alertas: res.alertas ?? [], facturaPendiente: !!res.facturaPendiente });
      } else onClose();
    });
  }

  if (resultado) {
    return (
      <Modal titulo={clienteNombre} subtitulo="Copiado registrado" onClose={onClose}>
        <div className="px-6 py-5 space-y-3">
          <p className="text-[13px] text-ink-cell">Listo, las tareas pasaron al historial.</p>
          {resultado.facturaPendiente && (
            <p className="flex gap-2 text-[12px] text-ink-cell bg-paper-alt border border-line-panel rounded-lg px-3 py-2">
              <Receipt size={14} className="shrink-0 mt-0.5" />
              <span>
                Quedó pendiente la factura de la copiadora para este cliente. Cuando llegue, cargala en{" "}
                <Link href="/libros/facturas" className="font-medium underline">
                  Copiadora
                </Link>
                .
              </span>
            </p>
          )}
          <ul className="space-y-2">
            {resultado.alertas.map((a) => (
              <li key={a} className="flex gap-2 text-[12px] text-red-700 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {a}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-4 border-t border-line-row flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white bg-bordo hover:bg-bordo-dark rounded-[9px]"
          >
            Entendido
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={clienteNombre} subtitulo="Retirado / Registrar copiado" onClose={onClose} ancho="max-w-3xl">
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="w-48">
            <label className={LABEL}>Fecha de retiro / copiado</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em] border-b border-line-row">
                <th className="py-2 w-8"><span className="sr-only">Incluir</span></th>
                <th className="py-2 text-left">Libro</th>
                <th className="py-2 text-right px-2">Libres</th>
                <th className="py-2 text-right px-2">Último copiado</th>
                <th className="py-2 text-left px-2">Folios usados</th>
                <th className="py-2 text-left px-2">Copiado hasta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-row">
              {tareas.map((t) => {
                const f = filas[t.id];
                return (
                  <tr key={t.id} className={f.incluir ? "" : "opacity-40"}>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={f.incluir}
                        onChange={(e) => cambiar(t.id, { incluir: e.target.checked })}
                        className="accent-bordo"
                      />
                    </td>
                    <td className="py-2 text-[13px] text-ink">
                      {t.libroNombre} {t.tomo > 1 && <span className="text-ink-subtle text-[11px]">Tomo {t.tomo}</span>}
                    </td>
                    <td className={clsx("py-2 px-2", NUM, t.libres != null && t.libres <= UMBRAL_FOLIOS && "!text-orange-700 font-semibold")}>
                      {t.libres ?? "—"}
                    </td>
                    <td className={clsx("py-2 px-2", NUM)}>{fmtFecha(t.ultimoCopiado)}</td>
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
          </div>
          <p className="text-[11px] text-ink-subtle">
            Suma los folios al libro, actualiza su último período copiado y pasa la tarea al historial. Lo que estaba
            en la copiadora registra la entrada y deja pendiente la factura de la copiadora. Si un libro queda con{" "}
            {UMBRAL_FOLIOS} folios libres o menos, se crea el pedido de presupuesto de tomo nuevo.
          </p>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Registrar copiado" />
      </form>
    </Modal>
  );
}
