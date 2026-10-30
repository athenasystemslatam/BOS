"use client";

import { useState, useTransition, useMemo } from "react";
import clsx from "clsx";
import { Plus, AlertTriangle, Building, Printer, Home, HelpCircle, Info, X } from "lucide-react";
import { DESTINO_LABEL, fmtFecha, hoyISO, UBICACION_LABEL } from "@/lib/libros";
import type {
  DestinoMovimiento,
  LibroIncidencia,
  LibroMovimiento,
  TipoIncidencia,
  TipoMovimiento,
  UbicacionLibro,
} from "@/types";
import { registrarMovimiento, registrarIncidencia, resolverIncidencia } from "../actions";
import { Modal, Pie, LABEL, INPUT } from "../ModalBase";
import {
  AVISO,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  CHIP,
  CONTROL,
  ENCABEZADO,
  ERROR,
  FILA,
  NUM,
  PAGINA,
  PANEL,
  RAYA_MODULO,
  SEMAFORO,
  TITULO,
  VACIO,
  VACIO_TEXTO,
} from "../ui";

export type LibroParaMovimiento = {
  id: string;
  nombre: string;
  tomo: number;
  ubicacion: UbicacionLibro;
  extraviado: boolean;
};

export type ResumenUbicacion = {
  estudio: number;
  copiadora: number;
  cliente: number;
  otro: number;
  extraviados: number;
};

type MovimientoVista = LibroMovimiento & {
  clienteId: string | null;
  libroNombre: string;
  clienteNombre: string;
  registradorNombre: string | null;
};

type IncidenciaVista = LibroIncidencia & {
  clienteId: string | null;
  libroNombre: string;
  clienteNombre: string;
};

type ClienteConLibros = {
  id: string;
  nombre: string;
  libros: LibroParaMovimiento[];
};

const TH = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em] px-3 py-2.5 text-left";
const TD = "px-3 py-2.5 text-[13px] text-ink-cell align-top";
const TD_FECHA = clsx(NUM, "px-3 py-2.5 pl-4 align-top");

const DESTINOS: DestinoMovimiento[] = ["copiadora", "cliente", "estudio", "otro"];
const TIPOS_INCIDENCIA: { value: TipoIncidencia; label: string }[] = [
  { value: "extravio", label: "Extravío" },
  { value: "daño",     label: "Daño"     },
  { value: "otro",     label: "Otro"     },
];

function UbicacionIcon({ ubicacion }: { ubicacion: UbicacionLibro }) {
  const Icono = ubicacion === "copiadora" ? Printer : ubicacion === "cliente" ? Building : ubicacion === "estudio" ? Home : HelpCircle;
  return <Icono size={12} aria-hidden="true" className="inline mr-0.5 text-ink-subtle" />;
}

function MarcaSheet() {
  return (
    <span
      title="Importado del sheet GESTION DE LIBROS"
      className="ml-1.5 align-middle whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide bg-paper-hover text-ink-subtle border border-line-rule"
    >
      del sheet
    </span>
  );
}

// ── Resumen en línea ─────────────────────────────────────────────────────────

function ResumenLinea({ resumen }: { resumen: ResumenUbicacion }) {
  const items: { n: number; label: string; rojo?: boolean }[] = [
    { n: resumen.estudio, label: "en el estudio" },
    { n: resumen.copiadora, label: "en la copiadora" },
    { n: resumen.cliente, label: "en el cliente" },
    ...(resumen.otro > 0 ? [{ n: resumen.otro, label: "en otro lugar" }] : []),
    { n: resumen.extraviados, label: resumen.extraviados === 1 ? "extraviado" : "extraviados", rojo: resumen.extraviados > 0 },
  ];
  return (
    <div className={clsx(PANEL, "flex flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-3 text-[13px] text-ink-muted")}>
      {items.map((i) => (
        <span key={i.label}>
          <b className={clsx("font-archivo text-[20px] font-bold tabular-nums", i.rojo ? "text-red-700" : "text-ink")}>{i.n}</b>{" "}
          {i.label}
        </span>
      ))}
      <span className="sm:ml-auto inline-flex items-center gap-1 text-[12px] text-ink-subtle">
        <Info size={12} aria-hidden="true" />
        Los envíos y retiros de Seguimiento se registran acá solos.
      </span>
    </div>
  );
}

// ── Modal registrar movimiento ───────────────────────────────────────────────

function MovimientoModal({
  clientes,
  onClose,
}: {
  clientes: ClienteConLibros[];
  onClose: (alertas?: string[]) => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<TipoMovimiento>("salida");
  const [destino, setDestino] = useState<DestinoMovimiento>("copiadora");
  const [fecha, setFecha] = useState(hoyISO());
  const [persona, setPersona] = useState("");
  const [esMensajeria, setEsMensajeria] = useState(false);
  const [comentario, setComentario] = useState("");

  const librosCliente = clientes.find((c) => c.id === clienteId)?.libros ?? [];

  function toggle(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selAll() {
    setElegidos(new Set(librosCliente.map((l) => l.id)));
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clienteId) return setError("Elegí un cliente.");
    if (elegidos.size === 0) return setError("Seleccioná al menos un libro.");
    startTransition(async () => {
      const res = await registrarMovimiento(Array.from(elegidos), {
        fecha,
        tipo,
        destino,
        persona: persona.trim() || null,
        es_mensajeria: esMensajeria,
        comentario: comentario.trim() || null,
      });
      if (res.error) return setError(res.error);
      onClose(res.alertas);
    });
  }

  return (
    <Modal titulo="Registrar movimiento" subtitulo="Libros · Entrada y salida" onClose={() => onClose()} ancho="max-w-xl">
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {/* Tipo + Destino + Fecha */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Tipo</label>
              <select className={INPUT} value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
                <option value="salida">Salida</option>
                <option value="entrada">Entrada</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>{tipo === "salida" ? "Destino" : "Viene de"}</label>
              <select className={INPUT} value={destino} onChange={(e) => setDestino(e.target.value as DestinoMovimiento)}>
                {DESTINOS.map((d) => (
                  <option key={d} value={d}>{DESTINO_LABEL[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Fecha</label>
              <input type="date" className={INPUT} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className={LABEL}>Cliente</label>
            <select
              className={INPUT}
              value={clienteId}
              onChange={(e) => { setClienteId(e.target.value); setElegidos(new Set()); }}
            >
              <option value="">— Elegí un cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Libros */}
          {clienteId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={LABEL}>Libros</label>
                <button
                  type="button"
                  onClick={selAll}
                  className="text-[11px] font-semibold text-bordo hover:underline"
                >
                  Todos
                </button>
              </div>
              <div className="border border-line-input rounded-[9px] divide-y divide-line-row max-h-48 overflow-y-auto">
                {librosCliente.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-ink-subtle">No hay libros cargados.</p>
                ) : (
                  librosCliente.map((l) => (
                    <label
                      key={l.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-paper-hover"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={elegidos.has(l.id)}
                          onChange={() => toggle(l.id)}
                          className="accent-[#7D1C2E]"
                        />
                        <span className="text-sm text-ink">{l.nombre}</span>
                      </div>
                      <span className="text-[11px] text-ink-subtle shrink-0">
                        <UbicacionIcon ubicacion={l.ubicacion} />
                        {UBICACION_LABEL[l.ubicacion]}
                        {l.extraviado && (
                          <span className="ml-1 text-red-700">· Extraviado</span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Persona / Mensajería */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Persona o mensajería</label>
              <input
                className={INPUT}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Nombre o empresa"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={esMensajeria}
                  onChange={(e) => setEsMensajeria(e.target.checked)}
                  className="accent-[#7D1C2E]"
                />
                <span className="text-sm text-ink-muted">Es mensajería</span>
              </label>
            </div>
          </div>

          {/* Comentario */}
          <div>
            <label className={LABEL}>Comentario (opcional)</label>
            <textarea
              className={INPUT}
              rows={2}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={() => onClose()} textoGuardar="Registrar" />
      </form>
    </Modal>
  );
}

// ── Modal incidencia ─────────────────────────────────────────────────────────

function IncidenciaModal({
  clientes,
  onClose,
}: {
  clientes: ClienteConLibros[];
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [libroId, setLibroId] = useState("");
  const [tipo, setTipo] = useState<TipoIncidencia>("extravio");
  const [situacion, setSituacion] = useState("");

  const librosCliente = clientes.find((c) => c.id === clienteId)?.libros ?? [];

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!libroId) return setError("Elegí un libro.");
    startTransition(async () => {
      const res = await registrarIncidencia({ libro_id: libroId, tipo, situacion });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Registrar incidencia" subtitulo="Libros · Entrada y salida" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tipo</label>
              <select className={INPUT} value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidencia)}>
                {TIPOS_INCIDENCIA.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Cliente</label>
            <select
              className={INPUT}
              value={clienteId}
              onChange={(e) => { setClienteId(e.target.value); setLibroId(""); }}
            >
              <option value="">— Elegí un cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          {clienteId && (
            <div>
              <label className={LABEL}>Libro</label>
              <select className={INPUT} value={libroId} onChange={(e) => setLibroId(e.target.value)}>
                <option value="">— Elegí un libro —</option>
                {librosCliente.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={LABEL}>Situación</label>
            <textarea
              className={INPUT}
              rows={3}
              value={situacion}
              onChange={(e) => setSituacion(e.target.value)}
              placeholder="Describí la situación…"
              autoFocus
            />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Registrar" />
      </form>
    </Modal>
  );
}

// ── Modal resolver incidencia ────────────────────────────────────────────────

function ResolverModal({ incidencia, onClose }: { incidencia: IncidenciaVista; onClose: () => void }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolucion, setResolucion] = useState("");

  function resolver() {
    startTransition(async () => {
      const res = await resolverIncidencia(incidencia.id, resolucion);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo="Resolver incidencia" subtitulo={`${incidencia.clienteNombre} · ${incidencia.libroNombre}`} onClose={onClose}>
      <div className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="bg-paper-alt border border-line-row rounded-lg px-4 py-3 text-sm text-ink-cell">
            <p className="font-medium text-xs text-ink-subtle mb-1">Situación</p>
            <p>{incidencia.situacion}</p>
          </div>
          <div>
            <label className={LABEL}>Resolución (opcional)</label>
            <textarea
              className={INPUT}
              rows={3}
              value={resolucion}
              onChange={(e) => setResolucion(e.target.value)}
              placeholder="Cómo se resolvió…"
              autoFocus
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line-row shrink-0 space-y-3">
          {error && <p className={ERROR}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted hover:text-ink rounded-lg">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={resolver}
              className={BOTON_PRIMARIO}
            >
              {pendiente ? "Guardando…" : "Marcar como resuelto"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal de detalle de movimiento ──────────────────────────────────────────

function DetalleMovimientoModal({ m, onClose }: { m: MovimientoVista; onClose: () => void }) {
  return (
    <Modal titulo={m.clienteNombre} subtitulo="Detalle del movimiento" onClose={onClose}>
      <div className="px-6 py-5 space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <dt className={clsx(LABEL, "mb-0")}>Libro</dt>
            <dd className="text-ink font-medium">{m.libroNombre}</dd>
          </div>
          <div>
            <dt className={clsx(LABEL, "mb-0")}>Fecha</dt>
            <dd className="text-ink">{fmtFecha(m.fecha)}</dd>
          </div>
          <div>
            <dt className={clsx(LABEL, "mb-0")}>Movimiento</dt>
            <dd>
              <span className={clsx(CHIP, m.tipo === "salida" ? SEMAFORO.amarillo : SEMAFORO.verdeClaro)}>
                {m.tipo === "salida"
                  ? `Salida → ${DESTINO_LABEL[m.destino].toLowerCase()}`
                  : `Entrada desde ${DESTINO_LABEL[m.destino].toLowerCase()}`}
              </span>
            </dd>
          </div>
          {m.acta_numero && (
            <div>
              <dt className={clsx(LABEL, "mb-0")}>Nro. de acta</dt>
              <dd className="text-ink font-medium">{m.acta_numero}</dd>
            </div>
          )}
          {m.persona && (
            <div>
              <dt className={clsx(LABEL, "mb-0")}>Quién</dt>
              <dd className="text-ink">{m.persona}{m.es_mensajeria && <span className="ml-1 text-ink-subtle text-[11px]">(mensajería)</span>}</dd>
            </div>
          )}
          {m.registradorNombre && (
            <div>
              <dt className={clsx(LABEL, "mb-0")}>Registró</dt>
              <dd className="text-ink-muted">{m.registradorNombre}</dd>
            </div>
          )}
          {m.comentario && (
            <div className="col-span-2">
              <dt className={clsx(LABEL, "mb-0")}>Comentario</dt>
              <dd className="text-ink-muted whitespace-pre-wrap">{m.comentario}</dd>
            </div>
          )}
          {m.importado && (
            <div className="col-span-2">
              <dd><MarcaSheet /></dd>
            </div>
          )}
        </dl>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className={BOTON_SECUNDARIO}>
            <X size={13} /> Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function MovimientosClient({
  clientes,
  movimientos,
  incidencias,
  resumen,
  puedeEditar,
}: {
  clientes: ClienteConLibros[];
  movimientos: MovimientoVista[];
  incidencias: IncidenciaVista[];
  resumen: ResumenUbicacion;
  equipo: { id: string; nombre: string }[];
  puedeEditar: boolean;
}) {
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalIncidencia, setModalIncidencia] = useState(false);
  const [incidenciaActiva, setIncidenciaActiva] = useState<IncidenciaVista | null>(null);
  const [detalleMov, setDetalleMov] = useState<MovimientoVista | null>(null);
  const [alertas, setAlertas] = useState<string[]>([]);
  const [tab, setTab] = useState<"movimientos" | "incidencias">("movimientos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const movsFiltrados = useMemo(() => {
    let lista = filtroCliente ? movimientos.filter((m) => m.clienteId === filtroCliente) : movimientos;
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter((m) => m.clienteNombre.toLowerCase().includes(q) || m.libroNombre.toLowerCase().includes(q));
    return lista;
  }, [movimientos, filtroCliente, busqueda]);

  const incFiltradas = useMemo(
    () => (filtroCliente ? incidencias.filter((i) => i.clienteId === filtroCliente) : incidencias),
    [incidencias, filtroCliente]
  );

  // El filtro también ofrece los clientes que solo aparecen en lo importado del sheet.
  const opcionesCliente = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.nombre]));
    for (const x of [...movimientos, ...incidencias]) if (x.clienteId && !m.has(x.clienteId)) m.set(x.clienteId, x.clienteNombre);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [clientes, movimientos, incidencias]);

  const incAbiertas = incidencias.filter((i) => !i.resuelto).length;

  const thead = "sticky top-0 bg-paper-group z-10 border-b border-line-group";

  return (
    <div className={PAGINA}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <h1 className={TITULO}>Entrada y salida</h1>
        <div className="flex-1" />
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModalIncidencia(true)} className={BOTON_SECUNDARIO}>
              <AlertTriangle size={14} aria-hidden="true" />
              Reportar incidencia
            </button>
            <button onClick={() => setModalMovimiento(true)} className={BOTON_PRIMARIO}>
              <Plus size={15} aria-hidden="true" />
              Registrar movimiento
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-6 space-y-3 pb-3">
        {alertas.length > 0 && (
          <div className={AVISO}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1 flex-1">
              {alertas.map((a, i) => (
                <p key={i}>{a}</p>
              ))}
            </div>
            <button onClick={() => setAlertas([])} aria-label="Cerrar aviso" className="text-alerta-label hover:text-alerta-fg text-xs">
              ✕
            </button>
          </div>
        )}
        <ResumenLinea resumen={resumen} />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="filtro-cliente-mov" className="text-[13px] text-ink-muted">Cliente</label>
          <select
            id="filtro-cliente-mov"
            className={clsx(CONTROL, "min-w-0 w-full sm:w-auto sm:min-w-[240px]")}
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
          >
            <option value="">Todos</option>
            {opcionesCliente.map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Buscar cliente o libro…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={clsx(CONTROL, "min-w-0 w-full sm:w-auto sm:min-w-[200px]")}
          />
          {(["movimientos", "incidencias"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={clsx(
                "px-3 py-1.5 text-[12.5px] font-semibold rounded-full border",
                tab === t ? "bg-ink text-white border-ink" : "bg-paper text-ink-muted border-line-input hover:text-ink"
              )}
            >
              {t === "movimientos"
                ? "Movimientos"
                : `Incidencias${incAbiertas > 0 ? ` · ${incAbiertas} ${incAbiertas === 1 ? "abierta" : "abiertas"}` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className={clsx(PANEL, "overflow-x-auto")}>
          {tab === "movimientos" ? (
            <table className="w-full text-sm">
              <thead className={thead}>
                <tr>
                  <th className={clsx(TH, "text-right pl-4")}>Fecha</th>
                  <th className={TH}>Cliente</th>
                  <th className={TH}>Libro</th>
                  <th className={TH}>Movimiento</th>
                  <th className={clsx(TH, "hidden md:table-cell")}>Quién</th>
                  <th className={clsx(TH, "hidden lg:table-cell")}>Comentario</th>
                  <th className={clsx(TH, "hidden lg:table-cell")}>Registró</th>
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className={VACIO}>
                        <p className={VACIO_TEXTO}>
                          {filtroCliente
                            ? "Este cliente no tiene movimientos."
                            : "Todavía no hay movimientos. Los envíos a la copiadora y los retiros se cargan solos desde Seguimiento; acá se registran los demás (al cliente, entre oficinas)."}
                        </p>
                        {puedeEditar && !filtroCliente && (
                          <button onClick={() => setModalMovimiento(true)} className={BOTON_PRIMARIO}>
                            <Plus size={15} aria-hidden="true" /> Registrar movimiento
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  movsFiltrados.map((m) => (
                    <tr key={m.id} className={clsx(FILA, "cursor-pointer")} onClick={() => setDetalleMov(m)}>
                      <td className={TD_FECHA}>{fmtFecha(m.fecha)}</td>
                      <td className={clsx(TD, "font-archivo font-bold text-ink")}>{m.clienteNombre}</td>
                      <td className={clsx(TD, "whitespace-normal max-w-[280px]")}>
                        <span className={m.libro_id ? undefined : "text-ink-muted"}>{m.libroNombre}</span>
                        {m.importado && <MarcaSheet />}
                      </td>
                      <td className={TD}>
                        <span className={clsx(CHIP, m.tipo === "salida" ? SEMAFORO.amarillo : SEMAFORO.verdeClaro)}>
                          {m.tipo === "salida"
                            ? `Salida → ${DESTINO_LABEL[m.destino].toLowerCase()}`
                            : `Entrada desde ${DESTINO_LABEL[m.destino].toLowerCase()}`}
                        </span>
                      </td>
                      <td className={clsx(TD, "hidden md:table-cell text-ink-muted")}>
                        {m.persona ? (
                          <span>
                            {m.persona}
                            {m.es_mensajeria && <span className="ml-1 text-[11px] text-ink-subtle">(mensajería)</span>}
                          </span>
                        ) : (
                          <span className="text-ink-ghost">—</span>
                        )}
                      </td>
                      <td className={clsx(TD, "hidden lg:table-cell max-w-[220px]")}>
                        <p className="truncate text-xs text-ink-muted" title={m.comentario ?? ""}>{m.comentario ?? "—"}</p>
                      </td>
                      <td className={clsx(TD, "hidden lg:table-cell text-ink-muted")}>{m.registradorNombre ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className={thead}>
                <tr>
                  <th className={clsx(TH, "text-right pl-4")}>Fecha</th>
                  <th className={TH}>Cliente</th>
                  <th className={TH}>Libro</th>
                  <th className={TH}>Estado</th>
                  <th className={clsx(TH, "hidden md:table-cell")}>Situación</th>
                  <th className={clsx(TH, "hidden lg:table-cell")}>Tipo</th>
                  <th className={clsx(TH, "hidden lg:table-cell")}>Resolución</th>
                  <th className={TH}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {incFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className={VACIO}>
                        <p className={VACIO_TEXTO}>No hay incidencias registradas.</p>
                        {puedeEditar && (
                          <button onClick={() => setModalIncidencia(true)} className={BOTON_SECUNDARIO}>
                            <AlertTriangle size={14} aria-hidden="true" /> Reportar incidencia
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  incFiltradas.map((inc) => (
                    <tr key={inc.id} className={FILA}>
                      <td className={TD_FECHA}>{fmtFecha(inc.fecha)}</td>
                      <td className={clsx(TD, "font-archivo font-bold text-ink")}>{inc.clienteNombre}</td>
                      <td className={clsx(TD, "whitespace-normal max-w-[240px]")}>
                        <span className={inc.libro_id ? undefined : "text-ink-muted"}>{inc.libroNombre}</span>
                        {inc.importado && <MarcaSheet />}
                      </td>
                      <td className={TD}>
                        <span className={clsx(CHIP, inc.resuelto ? SEMAFORO.verdeClaro : SEMAFORO.rojo)}>
                          {inc.resuelto ? "Resuelto" : "Abierto"}
                        </span>
                      </td>
                      <td className={clsx(TD, "hidden md:table-cell max-w-[240px]")}>
                        <p className="truncate text-xs" title={inc.situacion}>{inc.situacion}</p>
                      </td>
                      <td className={clsx(TD, "hidden lg:table-cell capitalize text-ink-muted")}>{inc.tipo}</td>
                      <td className={clsx(TD, "hidden lg:table-cell max-w-[180px]")}>
                        <p className="truncate text-xs text-ink-muted">{inc.resolucion ?? "—"}</p>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {puedeEditar && !inc.resuelto && (
                          <button
                            onClick={() => setIncidenciaActiva(inc)}
                            className={clsx(BOTON_SECUNDARIO, "min-h-[30px] px-2.5 text-[12px]")}
                          >
                            Resolver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detalleMov && <DetalleMovimientoModal m={detalleMov} onClose={() => setDetalleMov(null)} />}
      {modalMovimiento && (
        <MovimientoModal
          clientes={clientes}
          onClose={(als) => { setModalMovimiento(false); if (als?.length) setAlertas(als); }}
        />
      )}
      {modalIncidencia && (
        <IncidenciaModal clientes={clientes} onClose={() => setModalIncidencia(false)} />
      )}
      {incidenciaActiva && (
        <ResolverModal
          incidencia={incidenciaActiva}
          onClose={() => setIncidenciaActiva(null)}
        />
      )}
    </div>
  );
}
