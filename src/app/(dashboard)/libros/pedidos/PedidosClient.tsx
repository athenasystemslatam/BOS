"use client";

import { useState, useTransition, useMemo } from "react";
import clsx from "clsx";
import { Plus, ChevronDown, ChevronUp, MessageSquare, X } from "lucide-react";
import {
  TIPO_PEDIDO_LABEL,
  TIPOS_PEDIDO,
  ESTADO_PEDIDO_INFO,
  PRIORIDAD_INFO,
  SEMAFORO_SEGUIMIENTO_INFO,
  semaforoSeguimiento,
  diasHasta,
  hoyISO,
  fmtFecha,
} from "@/lib/libros";
import type { EstadoPedido, ItemChecklist, LibroPedido, LibroPedidoSeguimiento, TipoPedido } from "@/types";
import {
  actualizarChecklist,
  actualizarPedido,
  agregarSeguimiento,
  aprobarPedido,
  cerrarRenovacion,
  crearPedido,
} from "../actions";
import { Modal, Pie, LABEL, INPUT } from "../ModalBase";

export type ClienteConLibros = {
  id: string;
  nombre: string;
  libros: { id: string; nombre: string; tomo: number }[];
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

const TH = "text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 text-left";
const TD = "px-3 py-2 text-sm text-gray-700 align-top";

function BadgeEstado({ estado }: { estado: EstadoPedido }) {
  const info = ESTADO_PEDIDO_INFO[estado];
  return (
    <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap", info.cls)}>
      {info.label}
    </span>
  );
}

function DotSemaforo({ proximo }: { proximo: string | null }) {
  const s = semaforoSeguimiento(proximo, hoyISO());
  const info = SEMAFORO_SEGUIMIENTO_INFO[s];
  if (s === "sin_fecha") return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full", info.cls)}>
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
                  <option key={l.id} value={l.id}>{l.nombre}</option>
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
              <label className={LABEL}>Fecha límite</label>
              <input type="date" className={INPUT} value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
            </div>
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
            <p className="text-sm text-gray-600">
              Se marcará como <strong>Aprobado</strong>. Para presupuestos el nuevo tomo se abre
              desde la ficha del libro.
            </p>
          ) : libros.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Este cliente no tiene libros activos cargados. Se aprobará sin crear tareas.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Elegí los libros para los que se creará una tarea de copiado en la cola:
              </p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {libros.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={elegidos.has(l.id)}
                      onChange={() => toggle(l.id)}
                      className="accent-violet-600"
                    />
                    <span className="text-sm text-gray-800">{l.nombre}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 space-y-3 shrink-0">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={aprobar}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
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

function CerrarRenovacionModal({ pedido, onClose }: { pedido: PedidoVista; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [designacion, setDesignacion] = useState("");
  const [anios, setAnios] = useState("3");
  const faltan = pedido.checklist.filter((i) => !i.hecho).length;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(anios);
    if (!designacion) return setError("Indicá la fecha de designación del mandato nuevo.");
    if (!Number.isInteger(n) || n < 1) return setError("La duración tiene que ser un número entero de años.");
    startTransition(async () => {
      const res = await cerrarRenovacion(pedido.id, designacion, n);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Cerrar renovación de autoridades" subtitulo="Libros · Pedidos" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {faltan > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Quedan {faltan} {faltan === 1 ? "paso" : "pasos"} del checklist sin marcar.
            </p>
          )}
          <p className="text-sm text-gray-600">
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
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Checklist</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <input
            type="checkbox"
            checked={item.hecho}
            disabled={!puedeEditar}
            onChange={(e) => guardar(items.map((x, j) => (j === i ? { ...x, hecho: e.target.checked } : x)))}
            className="accent-violet-600"
          />
          <input
            defaultValue={item.texto}
            disabled={!puedeEditar}
            onBlur={(e) => {
              const texto = e.target.value.trim();
              if (texto && texto !== item.texto) guardar(items.map((x, j) => (j === i ? { ...x, texto } : x)));
            }}
            className={clsx(
              "flex-1 text-xs bg-transparent border border-transparent hover:border-gray-200 focus:border-violet-400 rounded px-1.5 py-0.5 focus:outline-none",
              item.hecho ? "text-gray-400 line-through" : "text-gray-700"
            )}
          />
          {puedeEditar && (
            <button
              onClick={() => guardar(items.filter((_, j) => j !== i))}
              title="Quitar paso"
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
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
            className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-violet-400"
          />
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Fila expandible con seguimientos ────────────────────────────────────────

function FilaPedido({
  pedido,
  seguimientos,
  clientes,
  equipo,
  puedeEditar,
}: {
  pedido: PedidoVista;
  seguimientos: LibroPedidoSeguimiento[];
  clientes: ClienteConLibros[];
  equipo: Persona[];
  puedeEditar: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalSeguimiento, setModalSeguimiento] = useState(false);
  const [modalAprobar, setModalAprobar] = useState(false);
  const [modalCerrar, setModalCerrar] = useState(false);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === pedido.cliente_id);
  const esActivo = !["aprobado", "rechazado", "cerrado"].includes(pedido.estado);
  const esRenovacion = pedido.tipo === "renovacion_autoridades";
  const hechos = pedido.checklist.filter((i) => i.hecho).length;
  const diasMandato = pedido.mandato_vence ? diasHasta(pedido.mandato_vence) : null;

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50">
        <td className={TD}>
          <button
            onClick={() => setExpandido((v) => !v)}
            className="flex items-center gap-1 text-gray-700 font-medium hover:text-violet-700"
          >
            {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {cliente?.nombre ?? "—"}
          </button>
          {pedido.solicitante && (
            <p className="text-[11px] text-gray-400 mt-0.5 ml-4">Pedido por: {pedido.solicitante}</p>
          )}
        </td>
        <td className={TD}>
          {pedido.prioridad && (
            <span className={clsx("mr-1.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5", PRIORIDAD_INFO[pedido.prioridad].cls)}>
              {pedido.prioridad}
            </span>
          )}
          <span className="text-xs font-medium text-gray-600">
            {TIPO_PEDIDO_LABEL[pedido.tipo]}
          </span>
          {pedido.automatico && (
            <span className="ml-1.5 text-[10px] text-violet-500 font-medium">(auto)</span>
          )}
          {pedido.mandato_vence && diasMandato != null && pedido.estado !== "cerrado" && (
            <p className={clsx("text-[11px] mt-0.5", diasMandato < 0 ? "text-red-600 font-medium" : "text-amber-700")}>
              {diasMandato < 0 ? "Venció" : "Vence"} el {fmtFecha(pedido.mandato_vence)}
              {diasMandato >= 0 && ` (en ${diasMandato} días)`}
            </p>
          )}
        </td>
        <td className={clsx(TD, "max-w-[200px]")}>
          <p className="truncate text-xs text-gray-600">{pedido.descripcion ?? "—"}</p>
          {pedido.checklist.length > 0 && (
            <button onClick={() => setExpandido(true)} className="text-[11px] text-violet-600 hover:underline">
              Checklist {hechos}/{pedido.checklist.length}
            </button>
          )}
        </td>
        <td className={TD}>{pedido.responsableNombre ?? <span className="text-gray-300">—</span>}</td>
        <td className={TD}>
          {puedeEditar && esActivo ? (
            <select
              className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:border-violet-400 cursor-pointer"
              value={pedido.estado}
              onChange={async (e) => {
                setErrorEstado(null);
                const res = await actualizarPedido(pedido.id, { estado: e.target.value as EstadoPedido });
                if (res.error) setErrorEstado(res.error);
              }}
            >
              {ESTADOS_PEDIDO.filter((s) => !esRenovacion || s !== "cerrado").map((s) => (
                <option key={s} value={s}>{ESTADO_PEDIDO_INFO[s].label}</option>
              ))}
            </select>
          ) : (
            <BadgeEstado estado={pedido.estado} />
          )}
          {errorEstado && <p className="text-[11px] text-red-600 mt-1 whitespace-normal max-w-[180px]">{errorEstado}</p>}
        </td>
        <td className={TD}>
          <DotSemaforo proximo={pedido.proximo_seguimiento} />
        </td>
        <td className={TD}>{fmtFecha(pedido.fecha_pedido)}</td>
        <td className={TD}>
          {pedido.monto != null
            ? `$ ${pedido.monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
            : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-2 align-top">
          {puedeEditar && (
            <div className="flex items-center gap-1">
              {esActivo && (
                <>
                  <button
                    onClick={() => setModalSeguimiento(true)}
                    className="p-1 text-gray-400 hover:text-violet-600 rounded"
                    title="Registrar seguimiento"
                  >
                    <MessageSquare size={14} />
                  </button>
                  {pedido.estado !== "aprobado" && !esRenovacion && (
                    <button
                      onClick={() => setModalAprobar(true)}
                      className="px-2 py-0.5 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded"
                    >
                      Aprobar
                    </button>
                  )}
                </>
              )}
              {esRenovacion && pedido.estado !== "cerrado" && (
                <button
                  onClick={() => setModalCerrar(true)}
                  className="px-2 py-0.5 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded"
                >
                  Cerrar renovación
                </button>
              )}
              <button
                onClick={() => setModalEditar(true)}
                className="px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-900 rounded hover:bg-gray-100"
              >
                Editar
              </button>
            </div>
          )}
        </td>
      </tr>

      {expandido && (
        <tr className="bg-violet-50/40">
          <td colSpan={9} className="px-6 py-3 space-y-3">
            {(esRenovacion || pedido.checklist.length > 0) && (
              <div className="max-w-xl">
                <ChecklistEditor pedido={pedido} puedeEditar={puedeEditar && pedido.estado !== "cerrado"} />
              </div>
            )}
            {seguimientos.length === 0 ? (
              <p className="text-xs text-gray-400">Sin seguimientos registrados.</p>
            ) : (
              <div className="space-y-2">
                {seguimientos.map((s) => (
                  <div key={s.id} className="flex gap-3 text-xs">
                    <span className="text-gray-400 whitespace-nowrap shrink-0">{fmtFecha(s.fecha)}</span>
                    <p className="text-gray-700">{s.nota}</p>
                    {s.proximo_seguimiento && (
                      <span className="ml-auto text-violet-600 whitespace-nowrap shrink-0">
                        Próx. {fmtFecha(s.proximo_seguimiento)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}

      {modalEditar && (
        <tr>
          <td>
            <PedidoModal
              pedido={pedido}
              clientes={clientes}
              equipo={equipo}
              onClose={() => setModalEditar(false)}
            />
          </td>
        </tr>
      )}
      {modalSeguimiento && (
        <tr>
          <td>
            <SeguimientoModal pedidoId={pedido.id} onClose={() => setModalSeguimiento(false)} />
          </td>
        </tr>
      )}
      {modalCerrar && (
        <tr>
          <td>
            <CerrarRenovacionModal pedido={pedido} onClose={() => setModalCerrar(false)} />
          </td>
        </tr>
      )}
      {modalAprobar && cliente && (
        <tr>
          <td>
            <AprobarModal
              pedido={pedido}
              libros={cliente.libros}
              onClose={() => setModalAprobar(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function PedidosClient({
  pedidos,
  seguimientosPorPedido,
  clientes,
  equipo,
  puedeEditar,
}: {
  pedidos: PedidoVista[];
  seguimientosPorPedido: Map<string, LibroPedidoSeguimiento[]>;
  clientes: ClienteConLibros[];
  equipo: Persona[];
  puedeEditar: boolean;
  yoId: string | null; // reservado para filtros futuros por responsable
}) {
  const [modalNuevo, setModalNuevo] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"" | EstadoPedido>("");
  const [filtroTipo, setFiltroTipo] = useState<"" | "presupuesto" | TipoPedido>("");

  // P1 primero (renovaciones con el mandato vencido), después el orden de carga.
  const filtrados = useMemo(() => {
    return pedidos.filter((p) => {
      if (filtroCliente && p.cliente_id !== filtroCliente) return false;
      if (filtroEstado && p.estado !== filtroEstado) return false;
      if (filtroTipo === "presupuesto") {
        if (!p.tipo.startsWith("presupuesto")) return false;
      } else if (filtroTipo && p.tipo !== filtroTipo) {
        return false;
      }
      return true;
    }).sort((a, b) => Number(b.prioridad === "P1") - Number(a.prioridad === "P1"));
  }, [pedidos, filtroCliente, filtroEstado, filtroTipo]);

  const abiertos = pedidos.filter((p) => !["aprobado", "rechazado", "cerrado"].includes(p.estado)).length;

  const SELECT = "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-violet-400";

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Pedidos y trámites</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {abiertos} abierto{abiertos !== 1 ? "s" : ""} · {pedidos.length} total
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select className={SELECT} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select className={SELECT} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}>
            <option value="">Todos los tipos</option>
            <option value="presupuesto">Presupuestos</option>
            {TIPOS_PEDIDO.filter((t) => !t.value.startsWith("presupuesto")).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select className={SELECT} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}>
            <option value="">Todos los estados</option>
            {ESTADOS_PEDIDO.map((s) => (
              <option key={s} value={s}>{ESTADO_PEDIDO_INFO[s].label}</option>
            ))}
          </select>
          {puedeEditar && (
            <button
              onClick={() => setModalNuevo(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg"
            >
              <Plus size={15} />
              Nuevo pedido
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="overflow-x-auto pb-2" style={{ minWidth: 900 }}>
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
              <tr>
                <th className={TH}>Cliente / Solicitante</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Descripción</th>
                <th className={TH}>Responsable</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Próx. seguimiento</th>
                <th className={TH}>Fecha</th>
                <th className={TH}>Monto</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="bg-white">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-400">
                    No hay pedidos con esos filtros.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <FilaPedido
                    key={p.id}
                    pedido={p}
                    seguimientos={seguimientosPorPedido.get(p.id) ?? []}
                    clientes={clientes}
                    equipo={equipo}
                    puedeEditar={puedeEditar}
                  />
                ))
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
