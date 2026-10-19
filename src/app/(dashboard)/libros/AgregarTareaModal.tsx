"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { altaLibroRapida, crearTareas } from "./actions";
import { INPUT, LABEL, Modal, Pie } from "./ModalBase";
import type { Persona } from "./NuevaTareaModal";
import type { ClienteAgregar } from "./SeguimientoLibrosClient";
import { MONO } from "./ui";

function coincide(busqueda: string, c: ClienteAgregar): boolean {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, "");
  return c.nombre.toLowerCase().includes(q) || (digitos.length >= 3 && (c.cuit ?? "").replace(/\D/g, "").includes(digitos));
}

/** "+ Agregar": tarea manual para uno o varios libros de un cliente; si el libro no existe, se da de alta acá. */
export function AgregarTareaModal({
  clientes,
  equipo,
  onClose,
}: {
  clientes: ClienteAgregar[];
  equipo: Persona[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [altas, setAltas] = useState<Set<string>>(new Set());
  const [materialListo, setMaterialListo] = useState(false);
  const [fechaLimite, setFechaLimite] = useState("");
  const [responsable, setResponsable] = useState("");
  const [detalle, setDetalle] = useState("");

  const filtrados = useMemo(() => clientes.filter((c) => coincide(busqueda, c)), [clientes, busqueda]);
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;

  function elegirCliente(id: string) {
    setClienteId(id);
    setElegidos(new Set());
    setAltas(new Set());
    setResponsable(clientes.find((c) => c.id === id)?.responsableId ?? "");
  }

  function alternar(set: Set<string>, id: string, guardar: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    guardar(next);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cliente) return setError("Elegí un cliente.");
    if (elegidos.size === 0 && altas.size === 0) return setError("Elegí al menos un libro o da de alta uno.");
    startTransition(async () => {
      const libroIds = Array.from(elegidos);
      for (const catalogoId of Array.from(altas)) {
        const res = await altaLibroRapida(cliente.id, catalogoId);
        if (res.error || !res.id) return setError(res.error ?? "No se pudo dar de alta el libro.");
        libroIds.push(res.id);
      }
      const res = await crearTareas({
        cliente_id: cliente.id,
        libro_ids: libroIds,
        origen: "manual",
        material_listo: materialListo,
        fecha_limite: fechaLimite || null,
        periodo_desde: null,
        periodo_hasta: null,
        responsable_id: responsable || null,
        observaciones: detalle.trim() || null,
      });
      if (res.error) return setError(res.error);
      if (res.creadas === 0) return setError("Esos libros ya tenían una tarea en la cola.");
      onClose();
    });
  }

  return (
    <Modal titulo="Agregar tarea" subtitulo="Libros · Seguimiento" onClose={onClose} ancho="max-w-xl">
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>Cliente</label>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o CUIT…"
                aria-label="Buscar cliente por nombre o CUIT"
                className={`${INPUT} pl-7`}
              />
            </div>
            <select
              value={clienteId}
              onChange={(e) => elegirCliente(e.target.value)}
              className={INPUT}
              size={Math.min(6, Math.max(2, filtrados.length + 1))}
              aria-label="Cliente"
            >
              <option value="">— Elegí un cliente ({filtrados.length}) —</option>
              {filtrados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.cuit ? ` · ${c.cuit}` : ""}
                </option>
              ))}
            </select>
          </div>

          {cliente && (
            <>
              <div>
                <p className={LABEL}>
                  Libros de <span className="text-ink font-semibold">{cliente.nombre}</span>
                  {cliente.cuit && <span className={`${MONO} text-ink-subtle`}> · {cliente.cuit}</span>}
                </p>
                {cliente.libros.length === 0 ? (
                  <p className="text-[12.5px] text-ink-subtle">No tiene libros cargados: dalos de alta abajo.</p>
                ) : (
                  <div className="border border-line-panel rounded-lg divide-y divide-line-row max-h-52 overflow-y-auto">
                    {cliente.libros.map((l) => (
                      <label
                        key={l.id}
                        className={`flex items-center gap-2.5 px-3 py-2 text-[13px] ${l.enCola ? "opacity-50" : "cursor-pointer hover:bg-paper-hover"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={l.enCola}
                          checked={elegidos.has(l.id)}
                          onChange={() => alternar(elegidos, l.id, setElegidos)}
                          className="accent-bordo"
                        />
                        <span className="text-ink">
                          {l.nombre}
                          {l.tomo > 1 && <span className="text-ink-subtle"> · tomo {l.tomo}</span>}
                        </span>
                        {l.sinLibro && (
                          <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                            sin libro
                          </span>
                        )}
                        {l.enCola && <span className="ml-auto text-[11px] text-ink-subtle">ya en la cola</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {cliente.faltantes.length > 0 && (
                <div>
                  <p className={LABEL}>Dar de alta un libro (no está cargado en la ficha)</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {cliente.faltantes.map((k) => (
                      <label key={k.catalogoId} className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={altas.has(k.catalogoId)}
                          onChange={() => alternar(altas, k.catalogoId, setAltas)}
                          className="accent-bordo"
                        />
                        {k.nombre}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    Se crea como tomo 1; después completá rúbrica, folios y último copiado en la ficha.
                  </p>
                </div>
              )}
              {!cliente.tipo && (
                <p className="text-[12px] text-ink-subtle">
                  El cliente no tiene tipo societario cargado: cargalo en la ficha para ver qué libros le corresponden.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Fecha límite (si la pide un tercero)</label>
                  <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Responsable</label>
                  <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={INPUT}>
                    <option value="">— Sin asignar —</option>
                    {equipo.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={materialListo}
                  onChange={(e) => setMaterialListo(e.target.checked)}
                  className="accent-bordo"
                />
                Material listo
              </label>
              <div>
                <label className={LABEL}>Detalle</label>
                <textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} className={INPUT} />
              </div>
            </>
          )}
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Agregar" />
      </form>
    </Modal>
  );
}
