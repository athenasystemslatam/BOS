"use client";

import { useState, useTransition, useMemo } from "react";
import clsx from "clsx";
import { Plus, AlertTriangle, Building, Printer, Home, HelpCircle } from "lucide-react";
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
  libroNombre: string;
  clienteNombre: string;
  registradorNombre: string | null;
};

type IncidenciaVista = LibroIncidencia & {
  libroNombre: string;
  clienteNombre: string;
};

type ClienteConLibros = {
  id: string;
  nombre: string;
  libros: LibroParaMovimiento[];
};

const TH = "text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 text-left";
const TD = "px-3 py-2 text-sm text-gray-700 align-top";

const DESTINOS: DestinoMovimiento[] = ["copiadora", "cliente", "estudio", "otro"];
const TIPOS_INCIDENCIA: { value: TipoIncidencia; label: string }[] = [
  { value: "extravio", label: "Extravío" },
  { value: "daño",     label: "Daño"     },
  { value: "otro",     label: "Otro"     },
];

function UbicacionIcon({ ubicacion }: { ubicacion: UbicacionLibro }) {
  if (ubicacion === "copiadora") return <Printer size={12} className="inline mr-0.5 text-violet-400" />;
  if (ubicacion === "cliente") return <Building size={12} className="inline mr-0.5 text-blue-400" />;
  if (ubicacion === "estudio") return <Home size={12} className="inline mr-0.5 text-green-400" />;
  return <HelpCircle size={12} className="inline mr-0.5 text-gray-400" />;
}

// ── Tarjeta de resumen ───────────────────────────────────────────────────────

function CardResumen({ icon: Icon, label, count, cls }: { icon: typeof Home; label: string; count: number; cls: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
      <div className={clsx("p-2.5 rounded-lg", cls)}>
        <Icon size={18} className="text-current" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{count}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
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
                  className="text-[11px] text-violet-600 hover:underline"
                >
                  Todos
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {librosCliente.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-400">No hay libros cargados.</p>
                ) : (
                  librosCliente.map((l) => (
                    <label
                      key={l.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={elegidos.has(l.id)}
                          onChange={() => toggle(l.id)}
                          className="accent-violet-600"
                        />
                        <span className="text-sm text-gray-800">{l.nombre}</span>
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        <UbicacionIcon ubicacion={l.ubicacion} />
                        {UBICACION_LABEL[l.ubicacion]}
                        {l.extraviado && (
                          <span className="ml-1 text-red-500">· Extraviado</span>
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
                  className="accent-violet-600"
                />
                <span className="text-sm text-gray-600">Es mensajería</span>
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
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700">
            <p className="font-medium text-xs text-gray-400 mb-1">Situación</p>
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
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={resolver}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
            >
              {pendiente ? "Guardando…" : "Marcar como resuelto"}
            </button>
          </div>
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
  const [alertas, setAlertas] = useState<string[]>([]);
  const [tab, setTab] = useState<"movimientos" | "incidencias">("movimientos");
  const [filtroCliente, setFiltroCliente] = useState("");

  const movsFiltrados = useMemo(() =>
    filtroCliente
      ? movimientos.filter((m) => {
          const libro = clientes.flatMap((c) => c.libros).find((l) => l.id === m.libro_id);
          return libro && clientes.find((c) => c.id === filtroCliente)?.libros.some((l) => l.id === libro.id);
        })
      : movimientos,
    [movimientos, clientes, filtroCliente]
  );

  const incFiltradas = useMemo(() =>
    filtroCliente
      ? incidencias.filter((i) =>
          clientes.find((c) => c.id === filtroCliente)?.libros.some((l) => l.id === i.libro_id)
        )
      : incidencias,
    [incidencias, clientes, filtroCliente]
  );

  const incAbiertas = incidencias.filter((i) => !i.resuelto).length;

  const SELECT = "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-violet-400";

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Alertas post-movimiento */}
      {alertas.length > 0 && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {alertas.map((a, i) => (
              <p key={i} className="text-sm text-amber-800">{a}</p>
            ))}
          </div>
          <button onClick={() => setAlertas([])} className="ml-auto text-amber-400 hover:text-amber-600 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Resumen */}
      <div className="shrink-0 px-6 py-4 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">
        <CardResumen icon={Home}      label="En el estudio"   count={resumen.estudio}    cls="bg-green-50 text-green-600" />
        <CardResumen icon={Printer}   label="En la copiadora" count={resumen.copiadora}  cls="bg-violet-50 text-violet-600" />
        <CardResumen icon={Building}  label="En el cliente"   count={resumen.cliente}    cls="bg-blue-50 text-blue-600" />
        <CardResumen icon={HelpCircle} label="Otro"           count={resumen.otro}       cls="bg-gray-100 text-gray-500" />
        <CardResumen icon={AlertTriangle} label="Extraviados" count={resumen.extraviados} cls="bg-red-50 text-red-500" />
      </div>

      {/* Header con tabs y filtros */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex gap-1">
          {(["movimientos", "incidencias"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "px-4 py-1.5 text-sm font-medium rounded-lg",
                tab === t
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              {t === "movimientos" ? "Movimientos" : (
                <span className="flex items-center gap-1.5">
                  Incidencias
                  {incAbiertas > 0 && (
                    <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                      {incAbiertas}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select className={SELECT} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {puedeEditar && (
            <>
              <button
                onClick={() => setModalMovimiento(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg"
              >
                <Plus size={15} />
                Registrar
              </button>
              <button
                onClick={() => setModalIncidencia(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
              >
                <AlertTriangle size={15} />
                Incidencia
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "movimientos" ? (
          <div className="overflow-x-auto pb-2" style={{ minWidth: 700 }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Cliente</th>
                  <th className={TH}>Libro</th>
                  <th className={TH}>Destino / Origen</th>
                  <th className={TH}>Persona / Mensajería</th>
                  <th className={TH}>Comentario</th>
                  <th className={TH}>Registró</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {movsFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
                      No hay movimientos registrados.
                    </td>
                  </tr>
                ) : (
                  movsFiltrados.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className={TD}>{fmtFecha(m.fecha)}</td>
                      <td className={TD}>
                        <span
                          className={clsx(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            m.tipo === "salida"
                              ? "bg-orange-50 text-orange-700"
                              : "bg-green-50 text-green-700"
                          )}
                        >
                          {m.tipo === "salida" ? "↑ Salida" : "↓ Entrada"}
                        </span>
                      </td>
                      <td className={TD}>{m.clienteNombre}</td>
                      <td className={TD}>{m.libroNombre}</td>
                      <td className={TD}>{DESTINO_LABEL[m.destino]}</td>
                      <td className={TD}>
                        {m.persona ? (
                          <span>
                            {m.persona}
                            {m.es_mensajeria && (
                              <span className="ml-1 text-[10px] text-gray-400">(mensajería)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className={clsx(TD, "max-w-[180px]")}>
                        <p className="truncate text-xs text-gray-500">{m.comentario ?? "—"}</p>
                      </td>
                      <td className={TD}>{m.registradorNombre ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto pb-2" style={{ minWidth: 700 }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Cliente</th>
                  <th className={TH}>Libro</th>
                  <th className={TH}>Situación</th>
                  <th className={TH}>Resolución</th>
                  <th className={TH}>Estado</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="bg-white">
                {incFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
                      No hay incidencias registradas.
                    </td>
                  </tr>
                ) : (
                  incFiltradas.map((inc) => (
                    <tr key={inc.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className={TD}>{fmtFecha(inc.fecha)}</td>
                      <td className={TD}>
                        <span className="text-xs font-medium text-gray-700 capitalize">{inc.tipo}</span>
                      </td>
                      <td className={TD}>{inc.clienteNombre}</td>
                      <td className={TD}>{inc.libroNombre}</td>
                      <td className={clsx(TD, "max-w-[200px]")}>
                        <p className="truncate text-xs">{inc.situacion}</p>
                      </td>
                      <td className={clsx(TD, "max-w-[160px]")}>
                        <p className="truncate text-xs text-gray-500">{inc.resolucion ?? "—"}</p>
                      </td>
                      <td className={TD}>
                        <span
                          className={clsx(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            inc.resuelto ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                          )}
                        >
                          {inc.resuelto ? "Resuelto" : "Abierto"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {puedeEditar && !inc.resuelto && (
                          <button
                            onClick={() => setIncidenciaActiva(inc)}
                            className="px-2 py-0.5 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded"
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
          </div>
        )}
      </div>

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
