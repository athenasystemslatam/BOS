"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import clsx from "clsx";
import { Plus, ChevronDown, ChevronUp, MessageSquare, X, GripVertical, Clock } from "lucide-react";
import {
  TIPO_PEDIDO_LABEL,
  TIPOS_PEDIDO,
  ESTADO_PEDIDO_INFO,
  PRIORIDAD_INFO,
  SEMAFORO_SEGUIMIENTO_INFO,
  semaforoSeguimiento,
  estadoRenovacion,
  ESTADO_RENOVACION_INFO,
  diasHasta,
  hoyISO,
  fmtFecha,
} from "@/lib/libros";
import type { EstadoRenovacion } from "@/lib/libros";
import type { AutoridadCliente, EstadoPedido, ItemChecklist, LibroPedido, LibroPedidoSeguimiento, PrioridadLibro, TipoPedido } from "@/types";
import {
  abrirTomoDesdePedido,
  actualizarChecklist,
  actualizarPedido,
  agregarSeguimiento,
  aprobarPedido,
  cerrarRenovacion,
  crearPedido,
  getAutoridades,
  reordenarPedidos,
} from "../actions";
import { Modal, Pie, LABEL, INPUT } from "../ModalBase";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  BOTON_TEXTO,
  CHIP,
  CONTROL,
  ENCABEZADO,
  ERROR,
  FILA,
  MONO,
  NUM,
  PAGINA,
  PANEL,
  RAYA_MODULO,
  SUBTITULO,
  TITULO,
  VACIO,
  VACIO_TEXTO,
} from "../ui";

export type ClienteConLibros = {
  id: string;
  nombre: string;
  libros: { id: string; nombre: string; tomo: number; sinLibro: boolean }[];
};

export type PedidoVista = LibroPedido & {
  responsableNombre: string | null;
  creadorNombre: string | null;
};

type Persona = { id: string; nombre: string };

const ESTADOS_PEDIDO: EstadoPedido[] = [
  "abierto",
  "esperando_cliente",
  "esperando_tercero",
  "aprobado",
  "rechazado",
  "cerrado",
];

const TH = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em] px-3 py-2.5 text-left";
const TD = "px-3 py-2.5 text-[13px] text-ink-cell align-top";
const BOTON_CHICO = clsx(BOTON_SECUNDARIO, "min-h-[30px] px-2.5 text-[12px]");
const COLUMNAS = 9;

function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  const info = ESTADO_PEDIDO_INFO[estado];
  return (
    <span className={clsx(CHIP, info.cls)}>
      {info.label}
    </span>
  );
}

function DotSemaforo({ proximo }: { proximo: string | null }) {
  const s = semaforoSeguimiento(proximo, hoyISO());
  const info = SEMAFORO_SEGUIMIENTO_INFO[s];
  if (s === "sin_fecha") return <span className="text-ink-ghost text-xs">—</span>;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2 py-0.5 rounded-full font-plex tabular-nums whitespace-nowrap", info.cls)}>
      <span className={clsx("w-1.5 h-1.5 rounded-full inline-block", info.dot)} />
      {proximo ? fmtFecha(proximo) : "—"}
    </span>
  );
}

// ── Modal crear/editar pedido ────────────────────────────────────────────────

function PedidoModal({
  pedido,
  clientes,
  equipo,
  onClose,
}: {
  pedido: PedidoVista | null;
  clientes: ClienteConLibros[];
  equipo: Persona[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoPedido>(pedido?.tipo ?? "tramite");
  const [clienteId, setClienteId] = useState(pedido?.cliente_id ?? "");
  const [libroId, setLibroId] = useState(pedido?.libro_id ?? "");
  const [descripcion, setDescripcion] = useState(pedido?.descripcion ?? "");
  const [solicitante, setSolicitante] = useState(pedido?.solicitante ?? "");
  const [responsableId, setResponsableId] = useState(pedido?.responsable_id ?? "");
  const [prioridad, setPrioridad] = useState<PrioridadLibro | "">(pedido?.prioridad ?? "");
  const [fechaPedido, setFechaPedido] = useState(pedido?.fecha_pedido ?? hoyISO());
  const [fechaLimite, setFechaLimite] = useState(pedido?.fecha_limite ?? "");
  const [monto, setMonto] = useState(pedido?.monto != null ? String(pedido.monto) : "");

  const libroCliente = clientes.find((c) => c.id === clienteId)?.libros ?? [];

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clienteId) return setError("Elegí un cliente.");
    startTransition(async () => {
      const datos = {
        cliente_id: clienteId,
        libro_id: libroId || null,
        tipo,
        descripcion: descripcion.trim() || null,
        solicitante: solicitante.trim() || null,
        responsable_id: responsableId || null,
        prioridad: (prioridad || null) as PrioridadLibro | null,
        fecha_pedido: fechaPedido,
        fecha_limite: fechaLimite || null,
        monto: monto || null,
      };
      const res = pedido ? await actualizarPedido(pedido.id, datos) : await crearPedido(datos);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal
      titulo={pedido ? "Editar pedido" : "Nuevo pedido"}
      subtitulo="Libros · Pedidos y trámites"
      onClose={onClose}
      ancho="max-w-xl"
    >
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Tipo</label>
              <select
                className={INPUT}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoPedido)}
              >
                {TIPOS_PEDIDO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Fecha de pedido</label>
              <input type="date" className={INPUT} value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Cliente</label>
            <select
              className={INPUT}
              value={clienteId}
              onChange={(e) => { setClienteId(e.target.value); setLibroId(""); }}
              disabled={!!pedido}
            >
              <option value="">— Elegí un cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {libroCliente.length > 0 && (
            <div>
              <label className={LABEL}>Libro (opcional)</label>
              <select className={INPUT} value={libroId} onChange={(e) => setLibroId(e.target.value)}>
                <option value="">— Ninguno —</option>
                {libroCliente.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                    {l.sinLibro ? " · sin libro" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={LABEL}>Descripción</label>
            <textarea
              className={INPUT}
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detallá el pedido…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Quién lo pidió</label>
              <input
                className={INPUT}
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value)}
                placeholder="Nombre o contacto"
              />
            </div>
            <div>
              <label className={LABEL}>Responsable interno</label>
              <select className={INPUT} value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {equipo.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Prioridad</label>
              <select className={INPUT} value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadLibro | "")}>
                <option value="">— Sin prioridad —</option>
                {(["P1", "P2", "P3"] as PrioridadLibro[]).map((p) => (
                  <option key={p} value={p}>{p} · {PRIORIDAD_INFO[p].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Fecha límite</label>
              <input type="date" className={INPUT} value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Monto (si es presupuesto)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={INPUT}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} />
      </form>
    </Modal>
  );
}

// ── Modal seguimiento ────────────────────────────────────────────────────────

function SeguimientoModal({ pedidoId, onClose }: { pedidoId: string; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [proximo, setProximo] = useState("");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nota.trim()) return setError("Escribí una nota.");
    startTransition(async () => {
      const res = await agregarSeguimiento(pedidoId, nota.trim(), proximo || null);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Registrar seguimiento" subtitulo="Libros · Pedidos" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>Qué se habló / qué pasó</label>
            <textarea
              className={INPUT}
              rows={4}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Describí el seguimiento…"
              autoFocus
            />
          </div>
          <div>
            <label className={LABEL}>Próximo seguimiento</label>
            <input type="date" className={INPUT} value={proximo} onChange={(e) => setProximo(e.target.value)} />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Registrar" />
      </form>
    </Modal>
  );
}

// ── Modal aprobar ────────────────────────────────────────────────────────────

function AprobarModal({
  pedido,
  libros,
  onClose,
}: {
  pedido: PedidoVista;
  libros: { id: string; nombre: string }[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(
    pedido.libro_id ? new Set([pedido.libro_id]) : new Set()
  );
  const esPresupuesto =
    pedido.tipo === "presupuesto_libro_nuevo" || pedido.tipo === "presupuesto_tomo_nuevo";

  function toggle(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function aprobar() {
    setError(null);
    startTransition(async () => {
      const res = await aprobarPedido(pedido.id, Array.from(elegidos));
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Aprobar pedido" subtitulo="Libros · Pedidos" onClose={onClose}>
      <div className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {esPresupuesto ? (
            <p className="text-sm text-ink-muted">
              Se marcará como <strong>Aprobado</strong>. Para presupuestos el nuevo tomo se abre
              desde la ficha del libro.
            </p>
          ) : libros.length === 0 ? (
            <p className="text-sm text-alerta-fg bg-alerta-bg rounded-lg px-3 py-2">
              Este cliente no tiene libros activos cargados. Se aprobará sin crear tareas.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                Elegí los libros para los que se creará una tarea de copiado en la cola:
              </p>
              <div className="border border-line-input rounded-[9px] divide-y divide-line-row max-h-56 overflow-y-auto">
                {libros.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-paper-hover"
                  >
                    <input
                      type="checkbox"
                      checked={elegidos.has(l.id)}
                      onChange={() => toggle(l.id)}
                      className="accent-[#7D1C2E]"
                    />
                    <span className="text-sm text-ink">{l.nombre}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-line-row space-y-3 shrink-0">
          {error && <p className={ERROR}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-muted hover:text-ink rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={aprobar}
              className={BOTON_PRIMARIO}
            >
              {pendiente ? "Aprobando…" : "Aprobar"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Renovación de autoridades ────────────────────────────────────────────────

type FilaAutoridadRenov = { cargo: string; nombre: string };

function CerrarRenovacionModal({ pedido, onClose }: { pedido: PedidoVista; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [designacion, setDesignacion] = useState("");
  const [anios, setAnios] = useState("3");
  const [filas, setFilas] = useState<FilaAutoridadRenov[]>([]);
  const [cargandoAut, setCargandoAut] = useState(true);
  const faltan = pedido.checklist.filter((i) => !i.hecho).length;

  useEffect(() => {
    getAutoridades(pedido.cliente_id).then((data: AutoridadCliente[]) => {
      const vigentes = data.filter((a) => a.vigente);
      setFilas(vigentes.length > 0 ? vigentes.map((a) => ({ cargo: a.cargo, nombre: a.nombre })) : [{ cargo: "", nombre: "" }]);
      setCargandoAut(false);
    });
  }, [pedido.cliente_id]);

  function setFila(i: number, cambios: Partial<FilaAutoridadRenov>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(anios);
    if (!designacion) return setError("Indicá la fecha de designación del mandato nuevo.");
    if (!Number.isInteger(n) || n < 1) return setError("La duración tiene que ser un número entero de años.");
    const autoridadesValidas = filas.filter((f) => f.nombre.trim() && f.cargo.trim());
    startTransition(async () => {
      const res = await cerrarRenovacion(
        pedido.id,
        designacion,
        n,
        null,
        autoridadesValidas.length > 0 ? autoridadesValidas.map((f) => ({ cargo: f.cargo, nombre: f.nombre.trim() })) : null
      );
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Cerrar renovación de autoridades" subtitulo="Libros · Pedidos" onClose={onClose} ancho="max-w-xl">
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {faltan > 0 && (
            <p className="text-xs text-alerta-fg bg-alerta-bg rounded-lg px-3 py-2">
              Quedan {faltan} {faltan === 1 ? "paso" : "pasos"} del checklist sin marcar.
            </p>
          )}
          <p className="text-sm text-ink-muted">
            Cargá el mandato nuevo: se actualiza en los datos societarios del cliente y el anterior queda en el
            historial de este pedido.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Fecha de designación</label>
              <input type="date" className={INPUT} value={designacion} onChange={(e) => setDesignacion(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Duración (años)</label>
              <input type="number" min={1} step={1} className={INPUT} value={anios} onChange={(e) => setAnios(e.target.value)} />
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink-subtle uppercase tracking-[0.08em] mb-2">Autoridades del nuevo mandato</p>
            {cargandoAut ? (
              <p className="text-[12.5px] text-ink-subtle">Cargando…</p>
            ) : (
              <div className="space-y-2">
                {filas.map((f, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      <label className={LABEL}>Cargo</label>
                      <input className={INPUT} value={f.cargo} onChange={(e) => setFila(i, { cargo: e.target.value })} />
                    </div>
                    <div>
                      <label className={LABEL}>Nombre</label>
                      <input className={INPUT} value={f.nombre} onChange={(e) => setFila(i, { nombre: e.target.value })} />
                    </div>
                    <button type="button" onClick={() => setFilas((prev) => prev.filter((_, j) => j !== i))} className="mb-[2px] p-1.5 text-ink-ghost hover:text-red-700" title="Quitar">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setFilas((prev) => [...prev, { cargo: "", nombre: "" }])} className={BOTON_TEXTO}>
                  <Plus size={13} /> Agregar cargo
                </button>
              </div>
            )}
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Cerrar renovación" />
      </form>
    </Modal>
  );
}

function ChecklistEditor({ pedido, puedeEditar }: { pedido: PedidoVista; puedeEditar: boolean }) {
  const [items, setItems] = useState<ItemChecklist[]>(pedido.checklist);
  const [nuevo, setNuevo] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar(siguiente: ItemChecklist[]) {
    const anterior = items;
    setItems(siguiente);
    setError(null);
    startTransition(async () => {
      const res = await actualizarChecklist(pedido.id, siguiente);
      if (res.error) {
        setItems(anterior);
        setError(res.error);
      }
    });
  }

  return (
    <div className={clsx("space-y-1.5", pendiente && "opacity-60")}>
      <p className="text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em]">Checklist</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <input
            type="checkbox"
            checked={item.hecho}
            disabled={!puedeEditar}
            onChange={(e) => guardar(items.map((x, j) => (j === i ? { ...x, hecho: e.target.checked } : x)))}
            className="accent-[#7D1C2E]"
          />
          <input
            defaultValue={item.texto}
            disabled={!puedeEditar}
            onBlur={(e) => {
              const texto = e.target.value.trim();
              if (texto && texto !== item.texto) guardar(items.map((x, j) => (j === i ? { ...x, texto } : x)));
            }}
            className={clsx(
              "flex-1 text-xs bg-transparent border border-transparent hover:border-line-input focus:border-bordo rounded px-1.5 py-0.5 focus:outline-none",
              item.hecho ? "text-ink-subtle line-through" : "text-ink-cell"
            )}
          />
          {puedeEditar && (
            <button
              onClick={() => guardar(items.filter((_, j) => j !== i))}
              title="Quitar paso"
              aria-label="Quitar paso"
              className="text-ink-ghost hover:text-red-700 opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nuevo.trim()) return;
            guardar([...items, { texto: nuevo.trim(), hecho: false }]);
            setNuevo("");
          }}
          className="flex items-center gap-2 pl-5"
        >
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Agregar paso…"
            aria-label="Agregar paso"
            className="flex-1 text-xs border border-line-input rounded px-1.5 py-0.5 bg-paper focus:outline-none focus:border-bordo"
          />
        </form>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

// ── Circuito de los presupuestos ─────────────────────────────────────────────

const PASOS_PRESUPUESTO = ["Pedido", "Enviado", "Respuesta", "Aprobado", "Tomo abierto"] as const;

function esPresupuesto(tipo: TipoPedido): boolean {
  return tipo === "presupuesto_tomo_nuevo" || tipo === "presupuesto_libro_nuevo";
}

/** Índice del último paso cumplido y si el circuito se cortó (rechazado). */
function pasoPresupuesto(p: PedidoVista): { paso: number; rechazado: boolean } {
  switch (p.estado) {
    case "abierto":
      return { paso: 0, rechazado: false };
    case "esperando_cliente":
    case "esperando_tercero":
      return { paso: 1, rechazado: false };
    case "rechazado":
      return { paso: 2, rechazado: true };
    case "aprobado":
      return { paso: 3, rechazado: false };
    case "cerrado":
      return { paso: 4, rechazado: false };
  }
}

function Circuito({ pedido, compacto }: { pedido: PedidoVista; compacto?: boolean }) {
  const { paso, rechazado } = pasoPresupuesto(pedido);
  const detalle = (i: number): string | null => {
    if (i === 1 && pedido.fecha_envio_cliente) return fmtFecha(pedido.fecha_envio_cliente);
    if (i === 2 && pedido.fecha_respuesta) return fmtFecha(pedido.fecha_respuesta);
    return null;
  };
  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1" aria-label={`Paso: ${rechazado ? "Rechazado" : PASOS_PRESUPUESTO[paso]}`}>
        {PASOS_PRESUPUESTO.map((n, i) => (
          <span
            key={n}
            title={n}
            className={clsx(
              "w-2 h-2 rounded-full",
              i < paso || (i === paso && !rechazado)
                ? "bg-green-600"
                : i === paso && rechazado
                  ? "bg-red-600"
                  : "bg-line-rule"
            )}
          />
        ))}
      </span>
    );
  }
  return (
    <ol className="flex flex-wrap items-start gap-x-1 gap-y-2">
      {PASOS_PRESUPUESTO.map((n, i) => {
        const hecho = i < paso || (i === paso && !rechazado);
        const corte = i === paso && rechazado;
        return (
          <li key={n} className="flex items-start gap-1">
            {i > 0 && <span aria-hidden="true" className="mt-[7px] w-5 h-px bg-line-rule" />}
            <span className="flex flex-col items-center min-w-[64px]">
              <span
                className={clsx(
                  CHIP,
                  hecho ? "bg-green-100 text-green-700" : corte ? "bg-red-100 text-red-700" : "bg-paper-hover text-ink-subtle border border-line-rule"
                )}
              >
                {corte ? "Rechazado" : n}
              </span>
              {detalle(i) && <span className={clsx(MONO, "text-[11px] text-ink-subtle mt-0.5")}>{detalle(i)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function fmtMonto(m: number | null): string | null {
  return m == null ? null : `$ ${m.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

function EnviadoModal({ pedido, onClose }: { pedido: PedidoVista; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [monto, setMonto] = useState(pedido.monto != null ? String(pedido.monto) : "");
  const [fecha, setFecha] = useState(pedido.fecha_envio_cliente ?? hoyISO());

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fecha) return setError("Indicá la fecha de envío al cliente.");
    if (monto && (Number.isNaN(Number(monto)) || Number(monto) < 0)) return setError("El monto tiene que ser un número.");
    startTransition(async () => {
      const res = await actualizarPedido(pedido.id, {
        monto: monto || null,
        fecha_envio_cliente: fecha,
        estado: "esperando_cliente",
      });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Presupuesto enviado al cliente" subtitulo="Libros · Pedidos" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Monto</label>
            <input type="number" step="0.01" min="0" className={clsx(INPUT, MONO)} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className={LABEL}>Fecha de envío</label>
            <input type="date" className={INPUT} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Marcar enviado" />
      </form>
    </Modal>
  );
}

function RespuestaModal({ pedido, onClose }: { pedido: PedidoVista; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState(pedido.respuesta ?? "");
  const [fecha, setFecha] = useState(pedido.fecha_respuesta ?? hoyISO());
  const [resultado, setResultado] = useState<"aprobado" | "rechazado">("aprobado");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fecha) return setError("Indicá la fecha de la respuesta.");
    startTransition(async () => {
      const res = await actualizarPedido(pedido.id, {
        respuesta: respuesta.trim() || null,
        fecha_respuesta: fecha,
        estado: resultado,
      });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Respuesta del cliente" subtitulo="Libros · Pedidos" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 space-y-4">
          <div className="flex gap-4">
            {(["aprobado", "rechazado"] as const).map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input type="radio" checked={resultado === r} onChange={() => setResultado(r)} className="accent-[#7D1C2E]" />
                {r === "aprobado" ? "Aprobó el presupuesto" : "Lo rechazó"}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div>
              <label className={LABEL}>Qué respondió (opcional)</label>
              <input className={INPUT} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Ej.: OK por mail de Claudia" />
            </div>
            <div>
              <label className={LABEL}>Fecha</label>
              <input type="date" className={INPUT} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Guardar respuesta" />
      </form>
    </Modal>
  );
}

function AbrirTomoModal({
  pedido,
  libros,
  onClose,
}: {
  pedido: PedidoVista;
  libros: ClienteConLibros["libros"];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Libro nuevo: primero los "sin libro", que es lo que se presupuestó.
  const opciones = [...libros].sort((a, b) => Number(b.sinLibro) - Number(a.sinLibro) || a.nombre.localeCompare(b.nombre, "es"));
  const [libroId, setLibroId] = useState(pedido.libro_id ?? opciones[0]?.id ?? "");
  const [rubricaNro, setRubricaNro] = useState("");
  const [rubricaFecha, setRubricaFecha] = useState("");
  const [folios, setFolios] = useState("");
  const fijo = pedido.libro_id ? libros.find((l) => l.id === pedido.libro_id) : null;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!libroId) return setError("Elegí el libro.");
    const n = folios.trim() === "" ? null : Number(folios);
    if (n != null && (!Number.isInteger(n) || n < 1)) return setError("Los folios tienen que ser un número entero mayor a 0.");
    startTransition(async () => {
      const res = await abrirTomoDesdePedido(pedido.id, libroId, {
        rubrica_nro: rubricaNro.trim() || null,
        rubrica_fecha: rubricaFecha || null,
        folios_totales: n,
      });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Abrir tomo nuevo" subtitulo="Libros · Pedidos" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>Libro</label>
            {pedido.libro_id ? (
              <p className="text-sm text-ink py-2">{fijo?.nombre ?? "El libro del pedido"}</p>
            ) : opciones.length === 0 ? (
              <p className="text-sm text-alerta-fg bg-alerta-bg rounded-lg px-3 py-2">
                El cliente no tiene libros cargados: dalo de alta desde su ficha.
              </p>
            ) : (
              <select className={INPUT} value={libroId} onChange={(e) => setLibroId(e.target.value)}>
                {opciones.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                    {l.sinLibro ? " · sin libro" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={LABEL}>Rúbrica nº</label>
              <input className={clsx(INPUT, MONO)} value={rubricaNro} onChange={(e) => setRubricaNro(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Fecha de rúbrica</label>
              <input type="date" className={INPUT} value={rubricaFecha} onChange={(e) => setRubricaFecha(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Folios</label>
              <input type="number" min={1} step={1} className={clsx(INPUT, MONO)} value={folios} onChange={(e) => setFolios(e.target.value)} />
            </div>
          </div>
          <p className="text-[11.5px] text-ink-subtle">
            Si el libro estaba como &ldquo;sin libro&rdquo; se activa; si no, se cierra el tomo actual y se abre el siguiente.
            El pedido queda cerrado.
          </p>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Abrir tomo" />
      </form>
    </Modal>
  );
}

// ── Fila expandible con seguimientos ────────────────────────────────────────

function FilaPedido({
  pedido,
  seguimientos,
  clientes,
  equipo,
  puedeEditar,
  esSin7d,
  draggable: isDraggable,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  pedido: PedidoVista;
  seguimientos: LibroPedidoSeguimiento[];
  clientes: ClienteConLibros[];
  equipo: Persona[];
  puedeEditar: boolean;
  esSin7d?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragEnd?: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [modal, setModal] = useState<"editar" | "seguimiento" | "aprobar" | "cerrar" | "enviado" | "respuesta" | "tomo" | null>(null);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === pedido.cliente_id);
  const libro = pedido.libro_id ? cliente?.libros.find((l) => l.id === pedido.libro_id) : null;
  const esActivo = !["aprobado", "rechazado", "cerrado"].includes(pedido.estado);
  const esRenovacion = pedido.tipo === "renovacion_autoridades";
  const presupuesto = esPresupuesto(pedido.tipo);
  const renov = esRenovacion ? estadoRenovacion(pedido) : null;
  const hechos = pedido.checklist.filter((i) => i.hecho).length;
  const diasMandato = pedido.mandato_vence ? diasHasta(pedido.mandato_vence) : null;
  const monto = fmtMonto(pedido.monto);

  return (
    <>
      <tr
        className={FILA}
        draggable={isDraggable}
        onDragStart={onDragStart}
        onDragEnter={onDragEnter}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        <td className={clsx(TD, "pl-2")}>
          <div className="flex items-start gap-1">
            {isDraggable && (
              <span className="cursor-grab mt-0.5 text-ink-ghost hover:text-ink-subtle shrink-0" title="Arrastrar para reordenar">
                <GripVertical size={14} />
              </span>
            )}
            <button
              onClick={() => setExpandido((v) => !v)}
              aria-expanded={expandido}
              aria-label={expandido ? "Ocultar detalle" : "Ver detalle"}
              className="mt-0.5 text-ink-subtle hover:text-ink shrink-0"
            >
              {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12.5px] font-semibold text-ink">{TIPO_PEDIDO_LABEL[pedido.tipo]}</span>
                {esSin7d && (
                  <span title="Sin seguimiento en 7+ días" className={clsx(CHIP, "px-1.5 text-[10px] bg-orange-50 text-orange-700 border-orange-200")}>
                    <Clock size={10} className="inline mr-0.5" />7d
                  </span>
                )}
              </p>
              {pedido.automatico && <p className="text-[11px] text-ink-subtle">automático</p>}
            </div>
          </div>
        </td>
        <td className={TD}>
          <button onClick={() => setExpandido((v) => !v)} className="text-left font-archivo font-bold text-ink hover:text-bordo">
            {cliente?.nombre ?? "—"}
          </button>
          <p className="md:hidden text-[11.5px] text-ink-muted">{libro?.nombre}</p>
          {pedido.mandato_vence && diasMandato != null && pedido.estado !== "cerrado" && (
            <p className={clsx("text-[11px] mt-0.5", diasMandato < 0 ? "text-red-700 font-semibold" : "text-alerta-fg")}>
              {diasMandato < 0 ? "Venció" : "Vence"} el <span className={MONO}>{fmtFecha(pedido.mandato_vence)}</span>
              {diasMandato >= 0 && ` (en ${diasMandato} días)`}
            </p>
          )}
          {pedido.descripcion && (
            <p className="text-xs text-ink-muted truncate max-w-[300px]" title={pedido.descripcion}>
              {pedido.descripcion}
            </p>
          )}
          {pedido.checklist.length > 0 && (
            <button onClick={() => setExpandido(true)} className="text-[11px] font-semibold text-bordo hover:underline">
              Checklist <span className={MONO}>{hechos}/{pedido.checklist.length}</span>
            </button>
          )}
        </td>
        <td className={clsx(TD, "hidden md:table-cell")}>
          {libro ? libro.nombre : <span className="text-ink-ghost">—</span>}
        </td>
        <td className={TD}>
          {renov ? (
            <span className={clsx(CHIP, ESTADO_RENOVACION_INFO[renov].cls)}>{ESTADO_RENOVACION_INFO[renov].label}</span>
          ) : presupuesto ? (
            <span className="flex flex-col gap-1">
              <BadgeEstado estado={pedido.estado} />
              <Circuito pedido={pedido} compacto />
            </span>
          ) : puedeEditar && esActivo ? (
            <select
              aria-label="Estado del pedido"
              className={clsx(CHIP, ESTADO_PEDIDO_INFO[pedido.estado].cls, "cursor-pointer focus:outline-none focus:ring-1 focus:ring-bordo")}
              value={pedido.estado}
              onChange={async (e) => {
                setErrorEstado(null);
                const res = await actualizarPedido(pedido.id, { estado: e.target.value as EstadoPedido });
                if (res.error) setErrorEstado(res.error);
              }}
            >
              {ESTADOS_PEDIDO.map((s) => (
                <option key={s} value={s}>{ESTADO_PEDIDO_INFO[s].label}</option>
              ))}
            </select>
          ) : (
            <BadgeEstado estado={pedido.estado} />
          )}
          {errorEstado && <p className="text-[11px] text-red-700 mt-1 whitespace-normal max-w-[180px]">{errorEstado}</p>}
          <div className="md:hidden mt-1">
            <DotSemaforo proximo={pedido.proximo_seguimiento} />
          </div>
        </td>
        <td className={clsx(TD, NUM, "hidden md:table-cell whitespace-nowrap")}>
          {monto ?? <span className="text-ink-ghost">—</span>}
        </td>
        <td className={clsx(TD, NUM, "hidden lg:table-cell whitespace-nowrap")}>
          {pedido.fecha_envio_cliente ? fmtFecha(pedido.fecha_envio_cliente) : <span className="text-ink-ghost">—</span>}
        </td>
        <td className={clsx(TD, "hidden lg:table-cell")}>
          {pedido.fecha_respuesta || pedido.respuesta ? (
            <span className="block max-w-[200px]">
              {pedido.fecha_respuesta && <span className={clsx(MONO, "block text-[12px] text-ink-cell")}>{fmtFecha(pedido.fecha_respuesta)}</span>}
              {pedido.respuesta && (
                <span className="block text-[11.5px] text-ink-muted truncate" title={pedido.respuesta}>
                  {pedido.respuesta}
                </span>
              )}
            </span>
          ) : (
            <span className="text-ink-ghost">—</span>
          )}
        </td>
        <td className={clsx(TD, "hidden md:table-cell text-right")}>
          <DotSemaforo proximo={pedido.proximo_seguimiento} />
        </td>
        <td className="px-3 py-2 align-top">
          {puedeEditar && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {esActivo && (
                <button
                  onClick={() => setModal("seguimiento")}
                  className="p-1.5 text-ink-subtle hover:text-ink rounded"
                  title="Registrar seguimiento"
                  aria-label="Registrar seguimiento"
                >
                  <MessageSquare size={14} />
                </button>
              )}
              {presupuesto && pedido.estado === "abierto" && (
                <button onClick={() => setModal("enviado")} className={BOTON_CHICO}>
                  Marcar enviado
                </button>
              )}
              {presupuesto && (pedido.estado === "esperando_cliente" || pedido.estado === "esperando_tercero") && (
                <button onClick={() => setModal("respuesta")} className={BOTON_CHICO}>
                  Cargar respuesta
                </button>
              )}
              {presupuesto && pedido.estado === "aprobado" && (
                <button onClick={() => setModal("tomo")} className={BOTON_CHICO}>
                  Abrir tomo nuevo
                </button>
              )}
              {!presupuesto && !esRenovacion && esActivo && (
                <button onClick={() => setModal("aprobar")} className={BOTON_CHICO}>
                  Aprobar
                </button>
              )}
              {esRenovacion && pedido.estado !== "cerrado" && (
                <button onClick={() => setModal("cerrar")} className={BOTON_CHICO}>
                  Cerrar renovación
                </button>
              )}
              <button onClick={() => setModal("editar")} className={BOTON_TEXTO}>
                Editar
              </button>
            </div>
          )}
        </td>
      </tr>

      {expandido && (
        <tr className="bg-paper-alt border-t border-line-row">
          <td colSpan={COLUMNAS} className="px-6 py-3 space-y-3">
            {presupuesto && <Circuito pedido={pedido} />}
            {(esRenovacion || pedido.checklist.length > 0) && (
              <div className="max-w-xl">
                <ChecklistEditor pedido={pedido} puedeEditar={puedeEditar && pedido.estado !== "cerrado"} />
              </div>
            )}
            {pedido.descripcion && <p className="text-xs text-ink-cell whitespace-pre-line">{pedido.descripcion}</p>}
            {pedido.respuesta && (
              <p className="text-xs text-ink-cell">
                <b>Respuesta:</b> {pedido.respuesta}
              </p>
            )}
            {(pedido.responsableNombre || pedido.solicitante) && (
              <p className="text-[11.5px] text-ink-muted">
                {pedido.responsableNombre && <>Responsable: {pedido.responsableNombre}</>}
                {pedido.responsableNombre && pedido.solicitante && " · "}
                {pedido.solicitante && <>Pedido por: {pedido.solicitante}</>}
                {" · "}Cargado el <span className={MONO}>{fmtFecha(pedido.fecha_pedido)}</span>
              </p>
            )}
            {seguimientos.length === 0 ? (
              <p className="text-xs text-ink-subtle">Sin seguimientos registrados.</p>
            ) : (
              <div className="space-y-2">
                {seguimientos.map((s) => (
                  <div key={s.id} className="flex gap-3 text-xs">
                    <span className={clsx(MONO, "text-ink-subtle whitespace-nowrap shrink-0")}>{fmtFecha(s.fecha)}</span>
                    <p className="text-ink-cell">{s.nota}</p>
                    {s.proximo_seguimiento && (
                      <span className="ml-auto text-ink-muted whitespace-nowrap shrink-0">
                        Próx. <span className={MONO}>{fmtFecha(s.proximo_seguimiento)}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}

      {modal && (
        <tr>
          <td>
            {modal === "editar" && (
              <PedidoModal pedido={pedido} clientes={clientes} equipo={equipo} onClose={() => setModal(null)} />
            )}
            {modal === "seguimiento" && <SeguimientoModal pedidoId={pedido.id} onClose={() => setModal(null)} />}
            {modal === "cerrar" && <CerrarRenovacionModal pedido={pedido} onClose={() => setModal(null)} />}
            {modal === "enviado" && <EnviadoModal pedido={pedido} onClose={() => setModal(null)} />}
            {modal === "respuesta" && <RespuestaModal pedido={pedido} onClose={() => setModal(null)} />}
            {modal === "tomo" && <AbrirTomoModal pedido={pedido} libros={cliente?.libros ?? []} onClose={() => setModal(null)} />}
            {modal === "aprobar" && cliente && (
              <AprobarModal
                pedido={pedido}
                libros={cliente.libros.filter((l) => !l.sinLibro)}
                onClose={() => setModal(null)}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

const ESTADOS_EN_CURSO: EstadoPedido[] = ["abierto", "esperando_cliente", "esperando_tercero", "aprobado"];

const PRIORIDADES_PEDIDO: (PrioridadLibro | null)[] = ["P1", "P2", "P3", null];
const PRIORIDAD_LABEL_GRUPO: Record<string, string> = {
  P1: "P1 · Urgente",
  P2: "P2 · Planificado",
  P3: "P3 · Bloqueado",
  sin_prio: "Sin prioridad",
};

export function PedidosClient({
  pedidos,
  seguimientosPorPedido,
  clientes,
  equipo,
  puedeEditar,
  filtroInicial,
  pedidosSin7d = [],
}: {
  pedidos: PedidoVista[];
  seguimientosPorPedido: Map<string, LibroPedidoSeguimiento[]>;
  clientes: ClienteConLibros[];
  equipo: Persona[];
  puedeEditar: boolean;
  yoId: string | null;
  pedidosSin7d?: string[];
  /** Desde un link (ej. el aviso de renovaciones de Seguimiento). */
  filtroInicial?: { tipo?: TipoPedido; enCurso?: boolean };
}) {
  const [modalNuevo, setModalNuevo] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"" | "en_curso" | EstadoPedido>(filtroInicial?.enCurso ? "en_curso" : "");
  const [filtroTipo, setFiltroTipo] = useState<"" | "presupuesto" | TipoPedido>(filtroInicial?.tipo ?? "");
  const [filtroRenovacion, setFiltroRenovacion] = useState<"" | EstadoRenovacion>("");
  const [busqueda, setBusqueda] = useState("");
  const [agarrado, setAgarrado] = useState<string | null>(null);
  const [, setSobre] = useState<string | null>(null);
  const [ordenLocal, setOrdenLocal] = useState<Record<string, string[]>>({});

  const sin7dSet = useMemo(() => new Set(pedidosSin7d), [pedidosSin7d]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtroCliente && p.cliente_id !== filtroCliente) return false;
      if (filtroEstado === "en_curso") {
        if (!ESTADOS_EN_CURSO.includes(p.estado)) return false;
      } else if (filtroEstado && p.estado !== filtroEstado) return false;
      if (filtroTipo === "presupuesto") {
        if (!p.tipo.startsWith("presupuesto")) return false;
      } else if (filtroTipo && p.tipo !== filtroTipo) {
        return false;
      }
      if (filtroRenovacion && (p.tipo !== "renovacion_autoridades" || estadoRenovacion(p) !== filtroRenovacion)) return false;
      if (q) {
        const nombre = clientes.find((c) => c.id === p.cliente_id)?.nombre ?? "";
        if (!nombre.toLowerCase().includes(q) && !(p.descripcion ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pedidos, filtroCliente, filtroEstado, filtroTipo, filtroRenovacion, busqueda, clientes]);

  // Agrupar por prioridad respetando el orden local (drag-to-sort).
  const grupos = useMemo(() => {
    const map = new Map<string, PedidoVista[]>();
    for (const k of ["P1", "P2", "P3", "sin_prio"]) map.set(k, []);
    for (const p of filtrados) {
      const k = p.prioridad ?? "sin_prio";
      map.get(k)!.push(p);
    }
    // Apply local ordering
    for (const [k, ids] of Object.entries(ordenLocal)) {
      if (!ids.length) continue;
      const actuales = map.get(k);
      if (!actuales) continue;
      const byId = new Map(actuales.map((p) => [p.id, p]));
      const ordered = ids.map((id) => byId.get(id)).filter((p): p is PedidoVista => !!p);
      const resto = actuales.filter((p) => !ids.includes(p.id));
      map.set(k, [...ordered, ...resto]);
    }
    return map;
  }, [filtrados, ordenLocal]);

  const puedeOrdenar = puedeEditar && !busqueda.trim();

  function dragStart(id: string) {
    setAgarrado(id);
    setSobre(id);
  }
  function dragEnter(id: string, grupo: string) {
    if (!agarrado || agarrado === id) return;
    setSobre(id);
    const lista = (grupos.get(grupo) ?? []).map((p) => p.id);
    const de = lista.indexOf(agarrado);
    const a = lista.indexOf(id);
    if (de === -1 || a === -1) return;
    const nueva = [...lista];
    nueva.splice(de, 1);
    nueva.splice(a, 0, agarrado);
    setOrdenLocal((prev) => ({ ...prev, [grupo]: nueva }));
  }
  async function dragEnd() {
    const id = agarrado;
    setAgarrado(null);
    setSobre(null);
    if (!id) return;
    // Persist: all IDs across all groups in current order
    const allIds = PRIORIDADES_PEDIDO.flatMap((prio) => {
      const k = prio ?? "sin_prio";
      return (grupos.get(k) ?? []).map((p) => p.id);
    });
    await reordenarPedidos(allIds);
  }

  const abiertos = pedidos.filter((p) => !["aprobado", "rechazado", "cerrado"].includes(p.estado)).length;

  const hayFiltros = !!(filtroCliente || filtroEstado || filtroTipo || filtroRenovacion || busqueda.trim());
  const renovaciones = pedidos.filter((p) => p.tipo === "renovacion_autoridades");
  const cuentaRenov = (e: EstadoRenovacion) => renovaciones.filter((p) => estadoRenovacion(p) === e).length;

  return (
    <div className={PAGINA}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <div>
          <h1 className={TITULO}>Pedidos y trámites</h1>
          <p className={SUBTITULO}>
            <span className={MONO}>{abiertos}</span> abierto{abiertos !== 1 ? "s" : ""} ·{" "}
            <span className={MONO}>{pedidos.length}</span> en total
          </p>
        </div>
        <div className="flex-1" />
        {puedeEditar && (
          <button onClick={() => setModalNuevo(true)} className={BOTON_PRIMARIO}>
            <Plus size={15} aria-hidden="true" />
            Nuevo pedido
          </button>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar cliente o descripción…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={clsx(CONTROL, "w-full sm:w-auto sm:min-w-[220px]")}
        />
        <select aria-label="Cliente" className={clsx(CONTROL, "w-full sm:w-auto sm:min-w-[200px]")} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <select
          aria-label="Tipo"
          className={CONTROL}
          value={filtroTipo}
          onChange={(e) => {
            setFiltroTipo(e.target.value as typeof filtroTipo);
            if (e.target.value !== "renovacion_autoridades") setFiltroRenovacion("");
          }}
        >
          <option value="">Todos los tipos</option>
          <option value="presupuesto">Presupuestos</option>
          {TIPOS_PEDIDO.filter((t) => !t.value.startsWith("presupuesto")).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select aria-label="Estado" className={CONTROL} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}>
          <option value="">Todos los estados</option>
          <option value="en_curso">En curso</option>
          {ESTADOS_PEDIDO.map((s) => (
            <option key={s} value={s}>{ESTADO_PEDIDO_INFO[s].label}</option>
          ))}
        </select>
        {filtroTipo === "renovacion_autoridades" && (
          <div className="inline-flex rounded-full border border-line-input bg-paper p-0.5" role="tablist" aria-label="Estado de la renovación">
            {(
              [
                ["", "Todas", renovaciones.length],
                ["pendiente", "Pendientes", cuentaRenov("pendiente")],
                ["en_curso", "En curso", cuentaRenov("en_curso")],
                ["cerrada", "Cerradas", cuentaRenov("cerrada")],
              ] as const
            ).map(([v, label, n]) => (
              <button
                key={v}
                role="tab"
                aria-selected={filtroRenovacion === v}
                onClick={() => setFiltroRenovacion(v)}
                className={clsx(
                  "px-3 py-1 text-[12.5px] font-semibold rounded-full",
                  filtroRenovacion === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink"
                )}
              >
                {label} <span className="font-plex tabular-nums">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className={clsx(PANEL, "overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper-group z-10 border-b border-line-group">
              <tr>
                <th className={clsx(TH, "pl-2")}>Tipo</th>
                <th className={TH}>Cliente</th>
                <th className={clsx(TH, "hidden md:table-cell")}>Libro</th>
                <th className={TH}>Estado</th>
                <th className={clsx(TH, "hidden md:table-cell text-right")}>Monto</th>
                <th className={clsx(TH, "hidden lg:table-cell text-right")}>Enviado</th>
                <th className={clsx(TH, "hidden lg:table-cell")}>Respuesta</th>
                <th className={clsx(TH, "hidden md:table-cell text-right")}>Próx. seguimiento</th>
                <th className={TH}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS}>
                    <div className={VACIO}>
                      <p className={VACIO_TEXTO}>
                        {hayFiltros
                          ? "No hay pedidos con esos filtros."
                          : "Todavía no hay pedidos. Los de tomo nuevo y renovación de autoridades se crean solos; los demás se cargan acá."}
                      </p>
                      {hayFiltros ? (
                        <button
                          onClick={() => { setBusqueda(""); setFiltroCliente(""); setFiltroEstado(""); setFiltroTipo(""); setFiltroRenovacion(""); }}
                          className={BOTON_SECUNDARIO}
                        >
                          Quitar filtros
                        </button>
                      ) : (
                        puedeEditar && (
                          <button onClick={() => setModalNuevo(true)} className={BOTON_PRIMARIO}>
                            <Plus size={15} aria-hidden="true" /> Nuevo pedido
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                PRIORIDADES_PEDIDO.flatMap((prio) => {
                  const k = prio ?? "sin_prio";
                  const grupo = grupos.get(k) ?? [];
                  if (grupo.length === 0) return [];
                  return [
                    <tr key={`h-${k}`} className="bg-paper-alt border-y border-line-rule">
                      <td colSpan={COLUMNAS} className="px-4 py-1">
                        <span className={clsx("text-[11.5px] font-semibold", prio ? "" : "text-ink-subtle")}>
                          {PRIORIDAD_LABEL_GRUPO[k]}
                          <span className="font-plex font-normal text-ink-subtle ml-2">{grupo.length}</span>
                        </span>
                      </td>
                    </tr>,
                    ...grupo.map((p) => (
                      <FilaPedido
                        key={p.id}
                        pedido={p}
                        seguimientos={seguimientosPorPedido.get(p.id) ?? []}
                        clientes={clientes}
                        equipo={equipo}
                        puedeEditar={puedeEditar}
                        esSin7d={sin7dSet.has(p.id)}
                        draggable={puedeOrdenar}
                        onDragStart={() => dragStart(p.id)}
                        onDragEnter={() => dragEnter(p.id, k)}
                        onDragEnd={dragEnd}
                      />
                    )),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalNuevo && (
        <PedidoModal
          pedido={null}
          clientes={clientes}
          equipo={equipo}
          onClose={() => setModalNuevo(false)}
        />
      )}
    </div>
  );
}
