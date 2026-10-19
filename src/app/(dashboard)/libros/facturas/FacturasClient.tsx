"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { fmtFecha, hoyISO } from "@/lib/libros";
import type { CopiadoFactura } from "@/types";
import { actualizarFactura, crearFactura, eliminarFactura } from "../actions";
import { Modal, Pie, LABEL, INPUT } from "../ModalBase";

export type FacturaVista = CopiadoFactura & { clienteNombre: string };

type Cliente = { id: string; nombre: string };

const TH = "text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 text-left";
const TD = "px-3 py-2 text-sm text-gray-700 align-middle";

type BoolField = "factura_recibida" | "reenviada_cliente" | "pagado" | "comprobante_enviado";

const BOOL_COLS: { key: BoolField; label: string }[] = [
  { key: "factura_recibida",   label: "Factura recibida"    },
  { key: "reenviada_cliente",  label: "Reenvío al cliente"  },
  { key: "pagado",             label: "Pagado"              },
  { key: "comprobante_enviado", label: "Comprobante enviado" },
];

// ── Checkbox inline con optimistic update ───────────────────────────────────

function ToggleCell({
  facturaId,
  campo,
  valor,
  puedeEditar,
}: {
  facturaId: string;
  campo: BoolField;
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
    <td className={clsx(TD, "text-center")}>
      <input
        type="checkbox"
        checked={optimistic}
        onChange={toggle}
        disabled={!puedeEditar}
        className="w-4 h-4 accent-violet-600 cursor-pointer disabled:cursor-default"
      />
    </td>
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
          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-3 gap-4">
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

  function borrar(id: string) {
    if (!confirm("¿Borrar esta factura?")) return;
    startTransition(async () => { await eliminarFactura(id); });
  }

  const SELECT = "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-violet-400";

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Copiadora</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {pendientes} sin pagar · {facturas.length} total · al registrar un copiado desde Seguimiento queda
            pendiente la factura del cliente
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select className={SELECT} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filtroPendiente}
              onChange={(e) => setFiltroPendiente(e.target.checked)}
              className="accent-violet-600"
            />
            Solo pendientes
          </label>
          {puedeEditar && (
            <button
              onClick={() => setModalNueva(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg"
            >
              <Plus size={15} />
              Nueva factura
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
                <th className={TH}>Cliente</th>
                <th className={TH}>Nro. factura</th>
                <th className={TH}>Fecha</th>
                <th className={TH}>Período</th>
                <th className={TH}>Monto</th>
                <th className={TH}>Detalle</th>
                {BOOL_COLS.map((c) => (
                  <th key={c.key} className={clsx(TH, "text-center")}>{c.label}</th>
                ))}
                {puedeEditar && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="bg-white">
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-400">
                    No hay facturas registradas.
                  </td>
                </tr>
              ) : (
                filtradas.map((f) => (
                  <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className={TD}>{f.clienteNombre}</td>
                    <td className={TD}>{f.nro_factura ?? <span className="text-gray-300">—</span>}</td>
                    <td className={TD}>{f.fecha_factura ? fmtFecha(f.fecha_factura) : <span className="text-gray-300">—</span>}</td>
                    <td className={TD}>
                      {f.mes
                        ? new Date(f.mes + "T00:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={TD}>
                      {f.monto != null
                        ? `$ ${f.monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={clsx(TD, "max-w-[160px]")}>
                      <p className="truncate text-xs text-gray-500" title={f.observaciones ?? ""}>
                        {f.observaciones ?? "—"}
                      </p>
                    </td>
                    {BOOL_COLS.map((c) => (
                      <ToggleCell
                        key={c.key}
                        facturaId={f.id}
                        campo={c.key}
                        valor={f[c.key]}
                        puedeEditar={puedeEditar}
                      />
                    ))}
                    {puedeEditar && (
                      <td className="px-3 py-2 align-middle">
                        <button
                          onClick={() => borrar(f.id)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded"
                          title="Eliminar factura"
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
