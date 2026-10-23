"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { fmtFecha, hoyISO } from "@/lib/libros";
import type { CopiadoFactura } from "@/types";
import {
  actualizarFactura,
  crearFactura,
  desvincularTareaFactura,
  eliminarFactura,
  vincularTareasFactura,
  type PatchFactura,
} from "../actions";
import { Modal, Pie, LABEL, INPUT } from "../ModalBase";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  BOTON_TEXTO,
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

export type FacturaVista = CopiadoFactura & { clienteNombre: string };

/** Un copiado registrado (tarea terminada) que una factura puede cubrir. */
export type CopiadoItem = { tareaId: string; nombre: string; fecha: string | null; hasta: string | null };

type Cliente = { id: string; nombre: string };

const TH = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em] px-3 py-2.5 text-left";
const TD = "px-3 py-2.5 text-[13px] text-ink-cell align-top";

type BoolField = "factura_recibida" | "reenviada_cliente" | "pagado" | "comprobante_enviado";

// El circuito de cada factura, en orden: llega, se reenvía, se paga, se manda el comprobante.
const BOOL_COLS: { key: BoolField; label: string; corto: string }[] = [
  { key: "factura_recibida",    label: "Factura recibida",    corto: "Recibida"    },
  { key: "reenviada_cliente",   label: "Reenvío al cliente",  corto: "Reenviada"   },
  { key: "pagado",              label: "Pagado",              corto: "Pagada"      },
  { key: "comprobante_enviado", label: "Comprobante enviado", corto: "Comprobante" },
];

function fmtMonto(v: number): string {
  return `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMes(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y}`;
}

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

// ── Modal nueva / editar factura ─────────────────────────────────────────────

type Form = {
  proveedor: string;
  clienteId: string;
  nro: string;
  fecha: string;
  mes: string;
  monto: string;
  libros: string;
  observaciones: string;
  estados: Record<BoolField, boolean>;
};

function formDe(f: FacturaVista | null, tieneLibrosTexto: boolean): Form {
  return {
    proveedor: f?.proveedor ?? "Arena Mattioni",
    clienteId: f?.cliente_id ?? "",
    nro: f?.nro_factura ?? "",
    fecha: f?.fecha_factura ?? (f ? "" : hoyISO()),
    mes: f?.mes ? f.mes.slice(0, 7) : "",
    monto: f?.monto != null ? String(f.monto) : "",
    libros: (tieneLibrosTexto ? f?.libros_texto : null) ?? "",
    observaciones: f?.observaciones ?? "",
    estados: {
      factura_recibida: f?.factura_recibida ?? false,
      reenviada_cliente: f?.reenviada_cliente ?? false,
      pagado: f?.pagado ?? false,
      comprobante_enviado: f?.comprobante_enviado ?? false,
    },
  };
}

function CopiadosVinculados({
  factura,
  vinculados,
  disponibles,
}: {
  factura: FacturaVista;
  vinculados: CopiadoItem[];
  disponibles: CopiadoItem[];
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  function quitar(tareaId: string) {
    setError(null);
    startTransition(async () => {
      const res = await desvincularTareaFactura(factura.id, tareaId);
      if (res.error) setError(res.error);
    });
  }

  function agregar() {
    if (elegidos.size === 0) return setError("Elegí al menos un copiado.");
    setError(null);
    startTransition(async () => {
      const res = await vincularTareasFactura(factura.id, Array.from(elegidos));
      if (res.error) return setError(res.error);
      setElegidos(new Set());
      setAgregando(false);
    });
  }

  return (
    <div className={clsx("space-y-2", pendiente && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Copiados que cubre ({vinculados.length})</span>
        {!agregando && disponibles.length > 0 && (
          <button type="button" onClick={() => setAgregando(true)} className={BOTON_TEXTO}>
            <Plus size={13} aria-hidden="true" /> Agregar libros
          </button>
        )}
      </div>
      {vinculados.length === 0 ? (
        <p className="text-[12px] text-ink-subtle">
          Ningún copiado vinculado.
          {disponibles.length === 0 && " Este cliente no tiene copiados registrados sin factura."}
        </p>
      ) : (
        <ul className="border border-line-row rounded-[9px] divide-y divide-line-row">
          {vinculados.map((v) => (
            <li key={v.tareaId} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
              <span className="text-ink-cell min-w-0">{v.nombre}</span>
              <span className="flex items-center gap-3 shrink-0">
                <span className={clsx(MONO, "text-[12px] text-ink-muted")}>{fmtFecha(v.fecha)}</span>
                <button
                  type="button"
                  onClick={() => quitar(v.tareaId)}
                  aria-label={`Quitar ${v.nombre}`}
                  className="text-ink-ghost hover:text-red-700"
                >
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {agregando && (
        <div className="border border-line-input rounded-[9px] p-3 space-y-2 bg-paper-alt">
          <p className="text-[12px] text-ink-muted">Copiados de este cliente sin factura:</p>
          <div className="max-h-44 overflow-y-auto divide-y divide-line-row">
            {disponibles.map((d) => (
              <label key={d.tareaId} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px] cursor-pointer">
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={elegidos.has(d.tareaId)}
                    onChange={() =>
                      setElegidos((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.tareaId)) next.delete(d.tareaId);
                        else next.add(d.tareaId);
                        return next;
                      })
                    }
                    className="accent-[#7D1C2E]"
                  />
                  <span className="text-ink-cell">{d.nombre}</span>
                </span>
                <span className={clsx(MONO, "text-[12px] text-ink-muted shrink-0")}>{fmtFecha(d.fecha)}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAgregando(false)} className={BOTON_TEXTO}>
              Cancelar
            </button>
            <button type="button" onClick={agregar} disabled={pendiente} className={BOTON_SECUNDARIO}>
              Agregar ({elegidos.size})
            </button>
          </div>
        </div>
      )}
      {error && <p className={ERROR}>{error}</p>}
    </div>
  );
}

function FacturaModal({
  factura,
  clientes,
  vinculados,
  disponibles,
  tieneLibrosTexto,
  onClose,
}: {
  factura: FacturaVista | null;
  clientes: Cliente[];
  vinculados: CopiadoItem[];
  disponibles: CopiadoItem[];
  tieneLibrosTexto: boolean;
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Form>(() => formDe(factura, tieneLibrosTexto));
  const cambiar = (c: Partial<Form>) => setF((prev) => ({ ...prev, ...c }));

  // Una factura de un cliente que hoy no tiene Libros (o está inactivo) se sigue mostrando.
  const opciones =
    factura && !clientes.some((c) => c.id === factura.cliente_id)
      ? [{ id: factura.cliente_id, nombre: factura.clienteNombre }, ...clientes]
      : clientes;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.clienteId) return setError("Elegí un cliente.");
    const monto = f.monto.trim() === "" ? null : Number(f.monto.replace(",", "."));
    if (monto != null && (!Number.isFinite(monto) || monto < 0)) return setError("El monto tiene que ser un número.");
    const datos: PatchFactura = {
      proveedor: f.proveedor.trim() || "Arena Mattioni",
      cliente_id: f.clienteId,
      nro_factura: f.nro.trim() || null,
      fecha_factura: f.fecha || null,
      mes: f.mes ? `${f.mes}-01` : null,
      monto,
      ...f.estados,
      observaciones: f.observaciones.trim() || null,
      ...(tieneLibrosTexto ? { libros_texto: f.libros.trim() || null } : {}),
    };
    startTransition(async () => {
      const res = factura
        ? await actualizarFactura(factura.id, datos)
        : await crearFactura({
            ...datos,
            proveedor: datos.proveedor!,
            cliente_id: f.clienteId,
            nro_factura: datos.nro_factura ?? null,
            fecha_factura: datos.fecha_factura ?? null,
            mes: datos.mes ?? null,
            monto,
            factura_recibida: f.estados.factura_recibida,
            reenviada_cliente: f.estados.reenviada_cliente,
            pagado: f.estados.pagado,
            comprobante_enviado: f.estados.comprobante_enviado,
            // Sin la columna libros_texto, el texto de libros va a observaciones como antes.
            observaciones: tieneLibrosTexto
              ? datos.observaciones ?? null
              : [f.libros.trim(), f.observaciones.trim()].filter(Boolean).join("\n") || null,
          });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal
      titulo={factura ? factura.clienteNombre : "Nueva factura"}
      subtitulo={factura ? "Copiadora · Editar factura" : "Libros · Copiadora"}
      onClose={onClose}
      ancho="max-w-2xl"
    >
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Cliente</label>
              <select className={INPUT} value={f.clienteId} onChange={(e) => cambiar({ clienteId: e.target.value })}>
                <option value="">— Elegí un cliente —</option>
                {opciones.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Proveedor</label>
              <input className={INPUT} value={f.proveedor} onChange={(e) => cambiar({ proveedor: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={LABEL}>Nro. factura</label>
              <input className={clsx(INPUT, MONO)} value={f.nro} onChange={(e) => cambiar({ nro: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Fecha factura</label>
              <input type="date" className={clsx(INPUT, MONO)} value={f.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Monto</label>
              <input
                inputMode="decimal"
                className={clsx(INPUT, MONO, "text-right")}
                value={f.monto}
                onChange={(e) => cambiar({ monto: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={LABEL}>Período (mes)</label>
              <input type="month" className={clsx(INPUT, MONO)} value={f.mes} onChange={(e) => cambiar({ mes: e.target.value })} />
            </div>
          </div>

          <fieldset>
            <legend className={LABEL}>Circuito</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {BOOL_COLS.map((c) => (
                <label key={c.key} className="inline-flex items-center gap-2 text-[13px] text-ink-cell cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.estados[c.key]}
                    onChange={(e) => cambiar({ estados: { ...f.estados, [c.key]: e.target.checked } })}
                    className="accent-[#7D1C2E]"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className={LABEL}>Libros</label>
            <textarea
              className={INPUT}
              rows={2}
              value={f.libros}
              onChange={(e) => cambiar({ libros: e.target.value })}
              placeholder="Qué libros cubre la factura (ej. Inventario y Balance / Diario)"
            />
          </div>

          {factura && <CopiadosVinculados factura={factura} vinculados={vinculados} disponibles={disponibles} />}

          <div>
            <label className={LABEL}>Observaciones</label>
            <textarea
              className={INPUT}
              rows={2}
              value={f.observaciones}
              onChange={(e) => cambiar({ observaciones: e.target.value })}
            />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar={factura ? "Guardar" : "Crear"} />
      </form>
    </Modal>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function FacturasClient({
  facturas,
  clientes,
  vinculadosPorFactura,
  disponiblesPorCliente,
  tieneLibrosTexto,
  puedeEditar,
}: {
  facturas: FacturaVista[];
  clientes: Cliente[];
  vinculadosPorFactura: Record<string, CopiadoItem[]>;
  disponiblesPorCliente: Record<string, CopiadoItem[]>;
  tieneLibrosTexto: boolean;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<FacturaVista | "nueva" | null>(null);
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

  // El filtro incluye los clientes de facturas viejas (sin Libros activo o inactivos).
  const opcionesFiltro = [...clientes];
  for (const f of facturas) {
    if (!opcionesFiltro.some((c) => c.id === f.cliente_id)) opcionesFiltro.push({ id: f.cliente_id, nombre: f.clienteNombre });
  }
  opcionesFiltro.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  function borrar(id: string) {
    if (!confirm("¿Borrar esta factura?")) return;
    startTransition(async () => {
      await eliminarFactura(id);
    });
  }

  const librosDe = (f: FacturaVista) => (tieneLibrosTexto ? f.libros_texto : f.observaciones) ?? null;

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
          <button onClick={() => setEditando("nueva")} className={BOTON_PRIMARIO}>
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
          {opcionesFiltro.map((c) => (
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
                <th className={clsx(TH, "pl-4")}>Cliente y libros</th>
                <th className={clsx(TH, "text-right")}>Factura</th>
                <th className={clsx(TH, "text-right")}>Fecha</th>
                <th className={clsx(TH, "text-right")}>Monto</th>
                <th className={TH}>Circuito</th>
                <th className={TH}>Observación</th>
                <th className={clsx(TH, "text-right hidden lg:table-cell")}>Período</th>
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
                        <button onClick={() => setEditando("nueva")} className={BOTON_PRIMARIO}>
                          <Plus size={15} aria-hidden="true" /> Cargar una a mano
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtradas.map((f) => {
                  const vinculados = vinculadosPorFactura[f.id] ?? [];
                  const libros = librosDe(f);
                  return (
                    <tr key={f.id} className={FILA}>
                      <td className={clsx(TD, "pl-4 min-w-[200px]")}>
                        <p className="font-archivo font-bold text-ink">{f.clienteNombre}</p>
                        {libros && <p className="text-[12px] text-ink-muted whitespace-pre-line">{libros}</p>}
                        {vinculados.length > 0 && (
                          <p className="text-[11.5px] text-ink-subtle">
                            {vinculados.length} {vinculados.length === 1 ? "copiado vinculado" : "copiados vinculados"}
                          </p>
                        )}
                      </td>
                      <td className={clsx(TD, NUM, "whitespace-nowrap")}>
                        {f.nro_factura ?? <span className="text-ink-ghost">—</span>}
                      </td>
                      <td className={clsx(TD, NUM, "whitespace-nowrap")}>
                        {f.fecha_factura ? fmtFecha(f.fecha_factura) : <span className="text-ink-ghost">—</span>}
                      </td>
                      <td className={clsx(TD, NUM, "whitespace-nowrap")}>
                        {f.monto != null ? fmtMonto(f.monto) : <span className="text-ink-ghost">—</span>}
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[230px]">
                          {BOOL_COLS.map((c) => (
                            <ToggleCircuito
                              key={`${c.key}-${f[c.key]}`}
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
                      <td className={clsx(TD, "max-w-[180px]")}>
                        {tieneLibrosTexto && f.observaciones
                          ? <span className="line-clamp-1 block" title={f.observaciones}>{f.observaciones}</span>
                          : <span className="text-ink-ghost">—</span>}
                      </td>
                      <td className={clsx(TD, NUM, "hidden lg:table-cell whitespace-nowrap")}>
                        {f.mes ? fmtMes(f.mes) : <span className="text-ink-ghost">—</span>}
                      </td>
                      {puedeEditar && (
                        <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditando(f)}
                            className="p-1 text-ink-subtle hover:text-ink rounded"
                            title="Editar factura"
                            aria-label="Editar factura"
                          >
                            <Pencil size={14} />
                          </button>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <FacturaModal
          key={editando === "nueva" ? "nueva" : editando.id}
          factura={editando === "nueva" ? null : editando}
          clientes={clientes}
          vinculados={editando === "nueva" ? [] : vinculadosPorFactura[editando.id] ?? []}
          disponibles={editando === "nueva" ? [] : disponiblesPorCliente[editando.cliente_id] ?? []}
          tieneLibrosTexto={tieneLibrosTexto}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
