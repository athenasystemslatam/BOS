"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { fmtFecha, hoyISO } from "@/lib/libros";
import type { CopiadoFactura } from "@/types";
import { actualizarFactura, crearFactura, eliminarFactura } from "../actions";
import { Modal, Pie, LABEL, INPUT } from "../ModalBase";
import {
  BOTON_PRIMARIO,
  CONTROL,
  ENCABEZADO,
  FILA,
  NUM,
  PAGINA,
  PANEL,
  RAYA_MODULO,
  SUBTITULO,
  TITULO,
  VACIO,
  VACIO_TEXTO,
} from "../ui";

export type FacturaVista = CopiadoFactura & { clienteNombre: string };

type Cliente = { id: string; nombre: string };

const TH = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em] px-3 py-2.5 text-left";
const TD = "px-3 py-2.5 text-[13px] text-ink-cell align-middle";

type BoolField = "factura_recibida" | "reenviada_cliente" | "pagado" | "comprobante_enviado";

// El circuito de cada factura, en orden: llega, se reenvía, se paga, se manda el comprobante.
const BOOL_COLS: { key: BoolField; label: string; corto: string }[] = [
  { key: "factura_recibida",    label: "Factura recibida",    corto: "Recibida"    },
  { key: "reenviada_cliente",   label: "Reenvío al cliente",  corto: "Reenviada"   },
  { key: "pagado",              label: "Pagado",              corto: "Pagada"      },
  { key: "comprobante_enviado", label: "Comprobante enviado", corto: "Comprobante" },
];

// ── Checkbox inline con optimistic update ───────────────────────────────────

function ToggleCircuito({
  facturaId,
  campo,
  label,
  corto,
  valor,
  puedeEditar,
}: {
  facturaId: string;
  campo: BoolField;
  label: string;
  corto: string;
  valor: boolean;
  puedeEditar: boolean;
}) {
  const [optimistic, setOptimistic] = useState(valor);
  const [, startTransition] = useTransition();

  function toggle() {
    if (!puedeEditar) return;
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      const res = await actualizarFactura(facturaId, { [campo]: next });
      if (res.error) setOptimistic(!next);
    });
  }

  return (
    <label
      title={label}
      className={clsx(
        "inline-flex items-center gap-1 text-[11.5px] whitespace-nowrap",
        puedeEditar ? "cursor-pointer" : "cursor-default",
        optimistic ? "text-green-700 font-semibold" : "text-ink-subtle"
      )}
    >
      <input
        type="checkbox"
        checked={optimistic}
        onChange={toggle}
        disabled={!puedeEditar}
        className="w-3.5 h-3.5 accent-[#7D1C2E] cursor-pointer disabled:cursor-default"
      />
      {corto}
    </label>
  );
}

// ── Modal nueva factura ──────────────────────────────────────────────────────

function NuevaFacturaModal({
  clientes,
  onClose,
}: {
  clientes: Cliente[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState("Arena Mattioni");
  const [clienteId, setClienteId] = useState("");
  const [nroFactura, setNroFactura] = useState("");
  const [fechaFactura, setFechaFactura] = useState(hoyISO());
  const [mes, setMes] = useState("");
  const [monto, setMonto] = useState("");
  const [librosCopiados, setLibrosCopiados] = useState("");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clienteId) return setError("Elegí un cliente.");
    startTransition(async () => {
      const res = await crearFactura({
        proveedor: proveedor.trim() || "Arena Mattioni",
        cliente_id: clienteId,
        nro_factura: nroFactura.trim() || null,
        fecha_factura: fechaFactura || null,
        mes: mes ? `${mes}-01` : null,
        monto: monto ? parseFloat(monto) : null,
        factura_recibida: false,
        reenviada_cliente: false,
        pagado: false,
        comprobante_enviado: false,
        observaciones: librosCopiados.trim() || null,
      });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Nueva factura" subtitulo="Libros · Copiadora" onClose={onClose} ancho="max-w-xl">
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Proveedor</label>
              <input className={INPUT} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Cliente</label>
              <select className={INPUT} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">— Elegí un cliente —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL}>Nro. factura</label>
              <input className={INPUT} value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} placeholder="A-0001-00000001" />
            </div>
            <div>
              <label className={LABEL}>Fecha factura</label>
              <input type="date" className={INPUT} value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Período (mes)</label>
              <input type="month" className={INPUT} value={mes} onChange={(e) => setMes(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Monto</label>
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

          <div>
            <label className={LABEL}>Libros copiados / Detalle</label>
            <textarea
              className={INPUT}
              rows={2}
              value={librosCopiados}
              onChange={(e) => setLibrosCopiados(e.target.value)}
              placeholder="Describí qué libros cubre esta factura…"
            />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Crear" />
      </form>
    </Modal>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

function fmtMonto(v: number): string {
  return `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

function fmtMes(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y}`;
}

export function FacturasClient({
  facturas,
  clientes,
  puedeEditar,
}: {
  facturas: FacturaVista[];
  clientes: Cliente[];
  puedeEditar: boolean;
}) {
  const [modalNueva, setModalNueva] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroPendiente, setFiltroPendiente] = useState(false);
  const [, startTransition] = useTransition();

  const filtradas = facturas.filter((f) => {
    if (filtroCliente && f.cliente_id !== filtroCliente) return false;
    if (filtroPendiente && f.pagado) return false;
    return true;
  });

  const pendientes = facturas.filter((f) => !f.pagado).length;
  const sinRecibir = facturas.filter((f) => !f.factura_recibida).length;

  function borrar(id: string) {
    if (!confirm("¿Borrar esta factura?")) return;
    startTransition(async () => { await eliminarFactura(id); });
  }

  return (
    <div className={PAGINA}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <div>
          <h1 className={TITULO}>Copiadora</h1>
          <p className={SUBTITULO}>
            <span className="font-plex tabular-nums">{pendientes}</span> sin pagar ·{" "}
            <span className="font-plex tabular-nums">{sinRecibir}</span> sin recibir ·{" "}
            <span className="font-plex tabular-nums">{facturas.length}</span> en total
          </p>
        </div>
        <div className="flex-1" />
        {puedeEditar && (
          <button onClick={() => setModalNueva(true)} className={BOTON_PRIMARIO}>
            <Plus size={15} aria-hidden="true" />
            Nueva factura
          </button>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-3">
        <label htmlFor="filtro-cliente-fc" className="sr-only">Cliente</label>
        <select
          id="filtro-cliente-fc"
          className={clsx(CONTROL, "w-full sm:w-auto sm:min-w-[240px]")}
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[13px] text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={filtroPendiente}
            onChange={(e) => setFiltroPendiente(e.target.checked)}
            className="accent-[#7D1C2E]"
          />
          Solo sin pagar
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className={clsx(PANEL, "overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper-group z-10 border-b border-line-group">
              <tr>
                <th className={clsx(TH, "pl-4")}>Cliente</th>
                <th className={clsx(TH, "text-right hidden md:table-cell")}>Factura</th>
                <th className={clsx(TH, "text-right hidden md:table-cell")}>Fecha</th>
                <th className={clsx(TH, "text-right hidden lg:table-cell")}>Período</th>
                <th className={clsx(TH, "text-right")}>Monto</th>
                <th className={TH}>Circuito</th>
                <th className={clsx(TH, "hidden xl:table-cell")}>Detalle</th>
                {puedeEditar && <th className={TH}><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className={VACIO}>
                      <p className={VACIO_TEXTO}>
                        {facturas.length === 0
                          ? "Todavía no hay facturas. Se crean solas, pendientes, al registrar un copiado que pasó por la copiadora desde Seguimiento."
                          : "No hay facturas con ese filtro."}
                      </p>
                      {puedeEditar && facturas.length === 0 && (
                        <button onClick={() => setModalNueva(true)} className={BOTON_PRIMARIO}>
                          <Plus size={15} aria-hidden="true" /> Cargar una a mano
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtradas.map((f) => (
                  <tr key={f.id} className={clsx(FILA, "align-middle")}>
                    <td className={clsx(TD, "pl-4")}>
                      <p className="font-archivo font-bold text-ink">{f.clienteNombre}</p>
                      <p className="md:hidden font-plex tabular-nums text-[11px] text-ink-subtle">
                        {f.nro_factura ? `Fc ${f.nro_factura}` : "Sin número"}
                        {f.fecha_factura && ` · ${fmtFecha(f.fecha_factura)}`}
                      </p>
                      <p className="xl:hidden text-[11px] text-ink-subtle truncate max-w-[260px]" title={f.observaciones ?? ""}>
                        {f.observaciones ?? ""}
                      </p>
                    </td>
                    <td className={clsx(TD, NUM, "hidden md:table-cell")}>
                      {f.nro_factura ?? <span className="text-ink-ghost">—</span>}
                    </td>
                    <td className={clsx(TD, NUM, "hidden md:table-cell")}>
                      {f.fecha_factura ? fmtFecha(f.fecha_factura) : <span className="text-ink-ghost">—</span>}
                    </td>
                    <td className={clsx(TD, NUM, "hidden lg:table-cell")}>
                      {f.mes ? fmtMes(f.mes) : <span className="text-ink-ghost">—</span>}
                    </td>
                    <td className={clsx(TD, NUM, "whitespace-nowrap")}>
                      {f.monto != null ? fmtMonto(f.monto) : <span className="text-ink-ghost">—</span>}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {BOOL_COLS.map((c) => (
                          <ToggleCircuito
                            key={c.key}
                            facturaId={f.id}
                            campo={c.key}
                            label={c.label}
                            corto={c.corto}
                            valor={f[c.key]}
                            puedeEditar={puedeEditar}
                          />
                        ))}
                      </div>
                    </td>
                    <td className={clsx(TD, "hidden xl:table-cell max-w-[220px]")}>
                      <p className="truncate text-xs text-ink-muted" title={f.observaciones ?? ""}>
                        {f.observaciones ?? "—"}
                      </p>
                    </td>
                    {puedeEditar && (
                      <td className="px-3 py-2 align-middle text-right">
                        <button
                          onClick={() => borrar(f.id)}
                          className="p-1 text-ink-ghost hover:text-red-700 rounded"
                          title="Eliminar factura"
                          aria-label="Eliminar factura"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalNueva && (
        <NuevaFacturaModal clientes={clientes} onClose={() => setModalNueva(false)} />
      )}
    </div>
  );
}
