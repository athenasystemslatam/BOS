"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Search, Send } from "lucide-react";
import {
  ORIGEN_TAREA_LABEL,
  PRIORIDADES,
  PRIORIDAD_INFO,
  UMBRAL_FOLIOS,
  fmtFecha,
} from "@/lib/libros";
import type { LibroEstado, LibroTarea, PrioridadLibro } from "@/types";
import { actualizarTarea, reordenarBloques } from "./actions";
import { NuevaTareaModal, type Persona } from "./NuevaTareaModal";
import { EnviarACopiarModal, PrioridadModal, RegistrarCopiadoModal } from "./SeguimientoModales";

export type TareaVista = LibroTarea & {
  clienteNombre: string;
  libroNombre: string;
  tomo: number;
  libres: number | null;
  ultimoCopiado: string | null;
  exigible: string | null;
  esFinal: boolean;
  prioridad: PrioridadLibro;
  sugerida: PrioridadLibro;
  motivoSugerido: string;
  responsableNombre: string | null;
};

export type ClienteCola = {
  id: string;
  nombre: string;
  responsableId: string | null;
  responsableNombre: string | null;
  mandatoVencido: boolean;
};

type LibroPuesta = {
  libroId: string;
  nombre: string;
  tomo: number;
  ultimo: string | null;
  exigible: string | null;
  sinLibro: boolean;
  enCola: boolean;
};

export type PuestaAlDiaCliente = {
  clienteId: string;
  nombre: string;
  responsableId: string | null;
  alDia: number;
  total: number;
  sinCargar: number;
  /** Tienen último copiado (o no tienen libro) y no llegan a lo exigible. */
  atrasados: LibroPuesta[];
  /** Sin último copiado cargado: hay que relevar, no copiar. */
  sinDato: LibroPuesta[];
};

export type AvisoBalance = {
  clienteId: string;
  nombre: string;
  anio: number;
  legalizado: boolean;
  libros: number;
};

export type AvisoRenovacion = {
  clienteId: string;
  nombre: string;
  vence: string | null;
  dias: number | null;
  hechos: number;
  pasos: number;
};

type Bloque = { cliente: ClienteCola; nivel: PrioridadLibro; orden: number; tareas: TareaVista[] };

const TH = "text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2";
const SELECT_CHICO =
  "text-[12px] text-gray-700 bg-transparent border border-transparent hover:border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:border-violet-400 cursor-pointer disabled:cursor-default disabled:hover:border-transparent";

function armarBloques(tareas: TareaVista[], clientes: Map<string, ClienteCola>): Record<PrioridadLibro, Bloque[]> {
  const porCliente = new Map<string, TareaVista[]>();
  for (const t of tareas) {
    if (t.esFinal) continue;
    porCliente.set(t.cliente_id, [...(porCliente.get(t.cliente_id) ?? []), t]);
  }
  const niveles: Record<PrioridadLibro, Bloque[]> = { P1: [], P2: [], P3: [] };
  for (const [clienteId, lista] of Array.from(porCliente.entries())) {
    const cliente = clientes.get(clienteId) ?? {
      id: clienteId,
      nombre: lista[0].clienteNombre,
      responsableId: null,
      responsableNombre: null,
      mandatoVencido: false,
    };
    const ordenadas = [...lista].sort(
      (a, b) => a.prioridad.localeCompare(b.prioridad) || a.libroNombre.localeCompare(b.libroNombre, "es")
    );
    const nivel = ordenadas[0].prioridad;
    niveles[nivel].push({
      cliente,
      nivel,
      orden: Math.min(...lista.map((t) => t.orden_manual)),
      tareas: ordenadas,
    });
  }
  for (const p of PRIORIDADES) {
    niveles[p].sort((a, b) => a.orden - b.orden || a.cliente.nombre.localeCompare(b.cliente.nombre, "es"));
  }
  return niveles;
}

function Pestaña({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-4 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap",
        activa ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"
      )}
    >
      {children}
    </button>
  );
}

function DetalleEditable({
  valor,
  puedeEditar,
  onGuardar,
}: {
  valor: string | null;
  puedeEditar: boolean;
  onGuardar: (v: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");

  if (editando) {
    return (
      <textarea
        autoFocus
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          if (texto.trim() !== (valor ?? "").trim()) onGuardar(texto.trim() || null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTexto(valor ?? "");
            setEditando(false);
          }
        }}
        className="w-80 text-[12px] text-gray-700 border border-violet-300 rounded-md px-2 py-1 focus:outline-none"
      />
    );
  }
  return (
    <button
      disabled={!puedeEditar}
      onClick={() => {
        setTexto(valor ?? "");
        setEditando(true);
      }}
      title={valor ?? ""}
      className="w-80 text-left text-[12px] text-gray-600 whitespace-pre-line line-clamp-2 rounded-md px-1.5 py-1 hover:bg-violet-50 disabled:hover:bg-transparent disabled:cursor-default"
    >
      {valor || (puedeEditar ? <span className="text-gray-300">Agregar detalle…</span> : "—")}
    </button>
  );
}

function FilaTarea({
  t,
  estados,
  puedeEditar,
  onPrioridad,
  onError,
}: {
  t: TareaVista;
  estados: LibroEstado[];
  puedeEditar: boolean;
  onPrioridad: () => void;
  onError: (e: string) => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const abiertos = estados.filter((e) => !e.es_final);

  function guardar(cambios: Parameters<typeof actualizarTarea>[1]) {
    startTransition(async () => {
      const res = await actualizarTarea(t.id, cambios);
      if (res.error) onError(res.error);
    });
  }

  return (
    <tr className={clsx("hover:bg-violet-50/30 align-top", pendiente && "opacity-60")}>
      <td className="px-3 py-2 pl-5">
        <p className="text-[13px] text-gray-800">
          {t.libroNombre} <span className="text-[11px] text-gray-400">T{t.tomo}</span>
        </p>
        <p className="text-[11px] text-gray-400">
          {ORIGEN_TAREA_LABEL[t.origen]}
          {t.fecha_limite && <span className="text-red-600 font-medium"> · Límite {fmtFecha(t.fecha_limite)}</span>}
        </p>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={onPrioridad}
          disabled={!puedeEditar}
          title={t.prioridad_manual ? `A mano: ${t.prioridad_motivo}` : `Sistema: ${t.motivoSugerido}`}
          className={clsx("text-[11px] font-medium rounded-full px-2 py-0.5", PRIORIDAD_INFO[t.prioridad].cls)}
        >
          {t.prioridad}
          {t.prioridad_manual && " ✎"}
        </button>
      </td>
      <td className="px-3 py-2">
        <select
          value={t.estado_id}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ estado_id: e.target.value })}
          className={SELECT_CHICO}
        >
          {abiertos.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-[12px] text-gray-600">
        {t.periodo_desde || t.periodo_hasta ? `${fmtFecha(t.periodo_desde)} → ${fmtFecha(t.periodo_hasta)}` : "—"}
        <p className="text-[11px] text-gray-400">Último: {fmtFecha(t.ultimoCopiado)}</p>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={t.fecha_envio_copiar ?? ""}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ fecha_envio_copiar: e.target.value || null })}
          className={clsx(SELECT_CHICO, "w-[120px]", !t.fecha_envio_copiar && "text-gray-300")}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={t.fecha_retiro ?? ""}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ fecha_retiro: e.target.value || null })}
          className={clsx(SELECT_CHICO, "w-[120px]", !t.fecha_retiro && "text-gray-300")}
        />
      </td>
      <td
        className={clsx(
          "px-3 py-2 text-center text-[12px]",
          t.libres != null && t.libres <= UMBRAL_FOLIOS ? "text-red-600 font-medium" : "text-gray-600"
        )}
      >
        {t.libres ?? "—"}
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={t.material_listo}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ material_listo: e.target.checked })}
          className="accent-violet-600"
          title="Material listo"
        />
      </td>
      <td className="px-2 py-1 whitespace-normal">
        <DetalleEditable
          key={t.observaciones ?? ""}
          valor={t.observaciones}
          puedeEditar={puedeEditar}
          onGuardar={(v) => guardar({ observaciones: v })}
        />
      </td>
    </tr>
  );
}

function Cola({
  tareas,
  clientes,
  estados,
  equipo,
  puedeEditar,
}: {
  tareas: TareaVista[];
  clientes: ClienteCola[];
  estados: LibroEstado[];
  equipo: Persona[];
  puedeEditar: boolean;
}) {
  const [moviendo, startMover] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filtroResp, setFiltroResp] = useState("");
  const [prioridadDe, setPrioridadDe] = useState<TareaVista | null>(null);
  const [envioDe, setEnvioDe] = useState<Bloque | null>(null);
  const [copiadoDe, setCopiadoDe] = useState<Bloque | null>(null);

  const mapaClientes = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const niveles = useMemo(() => armarBloques(tareas, mapaClientes), [tareas, mapaClientes]);
  const copiandose = estados.find((e) => e.codigo === "copiandose")?.id;

  function mover(nivel: PrioridadLibro, indice: number, delta: -1 | 1) {
    const ids = niveles[nivel].map((b) => b.cliente.id);
    const destino = indice + delta;
    if (destino < 0 || destino >= ids.length) return;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    startMover(async () => {
      const res = await reordenarBloques(ids);
      if (res.error) setError(res.error);
    });
  }

  const total = PRIORIDADES.reduce((n, p) => n + niveles[p].length, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[12px] text-gray-500">
          {PRIORIDADES.map((p, i) => (
            <span key={p}>
              {i > 0 && <span className="text-gray-300"> · </span>}
              <span className="font-semibold text-gray-800">{niveles[p].length}</span> en {p}
            </span>
          ))}
        </p>
        <div className="flex-1" />
        <select
          value={filtroResp}
          onChange={(e) => setFiltroResp(e.target.value)}
          className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400"
        >
          <option value="">Todos los responsables</option>
          {equipo.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>
      {filtroResp && (
        <p className="text-[11px] text-gray-400 -mt-4">
          Con un filtro aplicado no se puede reordenar: quitalo para subir o bajar clientes.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">Cerrar</button>
        </p>
      )}

      {total === 0 && (
        <p className="text-sm text-gray-400 text-center py-16">
          La cola está vacía. Las tareas se crean desde la pestaña &ldquo;Puesta al día&rdquo; o desde la ficha de
          cada cliente.
        </p>
      )}

      {PRIORIDADES.map((nivel) => {
        const bloques = niveles[nivel].filter(
          (b) => !filtroResp || b.cliente.responsableId === filtroResp || b.tareas.some((t) => t.responsable_id === filtroResp)
        );
        if (bloques.length === 0) return null;
        return (
          <section key={nivel} className="space-y-3">
            <h2 className="flex items-center gap-2">
              <span className={clsx("text-[11px] font-semibold rounded-full px-2.5 py-1", PRIORIDAD_INFO[nivel].cls)}>
                {PRIORIDAD_INFO[nivel].label}
              </span>
              <span className="text-[12px] text-gray-400">{bloques.length} clientes</span>
            </h2>
            {bloques.map((b) => {
              const indice = niveles[nivel].indexOf(b);
              const porEnviar = b.tareas.filter((t) => t.estado_id !== copiandose).length;
              return (
                <div key={b.cliente.id} className={clsx("bg-white border rounded-xl overflow-hidden", PRIORIDAD_INFO[nivel].borde)}>
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
                    {puedeEditar && !filtroResp && (
                      <div className="flex flex-col">
                        <button
                          disabled={moviendo || indice === 0}
                          onClick={() => mover(nivel, indice, -1)}
                          title="Subir"
                          className="text-gray-400 hover:text-violet-700 disabled:opacity-20"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          disabled={moviendo || indice === niveles[nivel].length - 1}
                          onClick={() => mover(nivel, indice, 1)}
                          title="Bajar"
                          className="text-gray-400 hover:text-violet-700 disabled:opacity-20"
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    )}
                    <span className="text-[12px] text-gray-400 w-5 text-right">{indice + 1}</span>
                    <div className="min-w-0">
                      <Link
                        href={`/libros/clientes/${b.cliente.id}`}
                        className="text-[13px] font-semibold text-gray-900 hover:text-violet-700"
                      >
                        {b.cliente.nombre}
                      </Link>
                      <p className="text-[11px] text-gray-400">
                        {b.tareas.length} {b.tareas.length === 1 ? "libro" : "libros"} · Responsable:{" "}
                        {b.cliente.responsableNombre ?? "sin asignar"}
                        {b.cliente.mandatoVencido && (
                          <Link href="/libros/pedidos" className="text-red-600 font-medium hover:underline">
                            {" "}· Mandato vencido (ver renovación en Pedidos)
                          </Link>
                        )}
                      </p>
                    </div>
                    <div className="flex-1" />
                    {puedeEditar && (
                      <>
                        {porEnviar > 0 && (
                          <button
                            onClick={() => setEnvioDe(b)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg"
                          >
                            <Send size={12} /> Enviar a copiar
                          </button>
                        )}
                        <button
                          onClick={() => setCopiadoDe(b)}
                          className="px-3 py-1.5 text-[12px] font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg"
                        >
                          Retirado / Registrar copiado
                        </button>
                      </>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-gray-50/70">
                          <th className={clsx(TH, "text-left pl-5")}>Libro</th>
                          <th className={clsx(TH, "text-left")}>Prioridad</th>
                          <th className={clsx(TH, "text-left")}>Estado</th>
                          <th className={clsx(TH, "text-left")}>Período</th>
                          <th className={clsx(TH, "text-left")}>Envío</th>
                          <th className={clsx(TH, "text-left")}>Retiro</th>
                          <th className={clsx(TH, "text-center")}>Libres</th>
                          <th className={clsx(TH, "text-center")}>Material</th>
                          <th className={clsx(TH, "text-left")}>Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {b.tareas.map((t) => (
                          <FilaTarea
                            key={t.id}
                            t={t}
                            estados={estados}
                            puedeEditar={puedeEditar}
                            onPrioridad={() => setPrioridadDe(t)}
                            onError={setError}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {prioridadDe && <PrioridadModal tarea={prioridadDe} onClose={() => setPrioridadDe(null)} />}
      {envioDe && (
        <EnviarACopiarModal
          clienteNombre={envioDe.cliente.nombre}
          tareas={envioDe.tareas}
          copiandoseId={copiandose ?? null}
          onClose={() => setEnvioDe(null)}
        />
      )}
      {copiadoDe && (
        <RegistrarCopiadoModal
          clienteNombre={copiadoDe.cliente.nombre}
          tareas={copiadoDe.tareas}
          copiandoseId={copiandose ?? null}
          onClose={() => setCopiadoDe(null)}
        />
      )}
    </div>
  );
}

function PuestaAlDia({
  filas,
  equipo,
  puedeEditar,
}: {
  filas: PuestaAlDiaCliente[];
  equipo: Persona[];
  puedeEditar: boolean;
}) {
  const [vista, setVista] = useState<"atrasados" | "sinDato">("atrasados");
  const [busqueda, setBusqueda] = useState("");
  const [creandoPara, setCreandoPara] = useState<{ fila: PuestaAlDiaCliente; libroIds: string[] } | null>(null);

  const visibles = filas.filter(
    (f) => f[vista].length > 0 && (!busqueda.trim() || f.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
  );
  const totalAlDia = filas.reduce((n, f) => n + f.alDia, 0);
  const total = filas.reduce((n, f) => n + f.total, 0);
  const nAtrasados = filas.reduce((n, f) => n + f.atrasados.length, 0);
  const nSinDato = filas.reduce((n, f) => n + f.sinDato.length, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <p className="text-[12px] text-gray-500">
          <span className="font-semibold text-gray-800">{totalAlDia}</span> de {total} libros al día en{" "}
          {filas.length} clientes
        </p>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(
            [
              ["atrasados", `Atrasados (${nAtrasados})`],
              ["sinDato", `Sin dato (${nSinDato})`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                "px-3 py-1 text-[12px] font-medium rounded-md",
                vista === v ? "bg-violet-600 text-white" : "text-gray-600 hover:text-gray-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente…"
            className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg pl-7 pr-2.5 py-1.5 w-48 focus:outline-none focus:border-violet-400"
          />
        </div>
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">
        {vista === "atrasados"
          ? "Tienen último copiado cargado y no llegan a lo exigible. Anuales: último cierre con el balance ya vencido (cierre + 135 días). Trimestrales: último trimestre cerrado hace más de 30 días. Los libros por evento no cuentan."
          : "No tienen último copiado cargado: no se sabe si están atrasados. Hay que relevar el libro y cargar el dato en la ficha, no mandarlo a copiar."}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {visibles.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">Sin clientes para mostrar.</p>
        )}
        {visibles.map((f) => {
          const pct = f.total ? Math.round((f.alDia / f.total) * 100) : 100;
          const creables = f.atrasados.filter((a) => !a.enCola);
          return (
            <div key={f.clienteId} className="px-5 py-3">
              <div className="flex items-center gap-4">
                <Link
                  href={`/libros/clientes/${f.clienteId}`}
                  className="text-[13px] font-semibold text-gray-900 hover:text-violet-700 w-72 truncate"
                >
                  {f.nombre}
                </Link>
                <div className="flex items-center gap-2 w-56">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx("h-full rounded-full", pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-gray-600 w-12 text-right">
                    {f.alDia}/{f.total}
                  </span>
                </div>
                {f.sinCargar > 0 && (
                  <span className="text-[11px] text-gray-400">{f.sinCargar} libros sin cargar en la ficha</span>
                )}
                <div className="flex-1" />
                {vista === "atrasados" && puedeEditar && creables.length > 0 && (
                  <button
                    onClick={() => setCreandoPara({ fila: f, libroIds: creables.map((a) => a.libroId) })}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-700 hover:text-violet-900"
                  >
                    <Plus size={13} /> Crear tareas ({creables.length})
                  </button>
                )}
                {vista === "sinDato" && (
                  <Link
                    href={`/libros/clientes/${f.clienteId}`}
                    className="text-[12px] font-medium text-violet-700 hover:text-violet-900"
                  >
                    Relevar en la ficha
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {vista === "atrasados"
                  ? f.atrasados.map((a) => (
                      <button
                        key={a.libroId}
                        disabled={!puedeEditar || a.enCola}
                        onClick={() => setCreandoPara({ fila: f, libroIds: [a.libroId] })}
                        title={
                          a.enCola
                            ? "Ya está en la cola"
                            : `Exigible: ${fmtFecha(a.exigible)} · Último copiado: ${fmtFecha(a.ultimo)}`
                        }
                        className={clsx(
                          "text-[11px] rounded-full px-2 py-0.5 border",
                          a.enCola
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : a.sinLibro
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-violet-300"
                        )}
                      >
                        {a.nombre}
                        {a.sinLibro ? " · sin libro" : ` · ${fmtFecha(a.ultimo)}`}
                        {a.enCola && " · en cola"}
                      </button>
                    ))
                  : f.sinDato.map((a) => (
                      <span
                        key={a.libroId}
                        title={`Exigible: ${fmtFecha(a.exigible)} · sin último copiado cargado`}
                        className="text-[11px] rounded-full px-2 py-0.5 border border-dashed border-gray-300 bg-white text-gray-500"
                      >
                        {a.nombre} T{a.tomo}
                        {a.enCola && " · en cola"}
                      </span>
                    ))}
              </div>
            </div>
          );
        })}
      </div>

      {creandoPara && (
        <NuevaTareaModal
          clienteId={creandoPara.fila.clienteId}
          clienteNombre={creandoPara.fila.nombre}
          opciones={creandoPara.fila.atrasados.map((a) => ({
            id: a.libroId,
            nombre: `${a.nombre} (T${a.tomo})`,
            detalle: a.sinLibro ? "Sin libro" : `Último: ${fmtFecha(a.ultimo)}`,
            enCola: a.enCola,
          }))}
          preseleccionados={creandoPara.libroIds}
          origenDefault="puesta_al_dia"
          responsableDefault={creandoPara.fila.responsableId}
          equipo={equipo}
          onClose={() => setCreandoPara(null)}
        />
      )}
    </div>
  );
}

function Historial({ tareas }: { tareas: TareaVista[] }) {
  const [busqueda, setBusqueda] = useState("");
  const terminadas = tareas
    .filter((t) => t.esFinal)
    .filter((t) => !busqueda.trim() || t.clienteNombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    .sort((a, b) => (b.fecha_fin ?? "").localeCompare(a.fecha_fin ?? ""));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <p className="text-[12px] text-gray-500">
          <span className="font-semibold text-gray-800">{terminadas.length}</span> copiados registrados
        </p>
        <div className="flex-1" />
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente…"
            className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg pl-7 pr-2.5 py-1.5 w-48 focus:outline-none focus:border-violet-400"
          />
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={clsx(TH, "text-left pl-5")}>Fecha</th>
              <th className={clsx(TH, "text-left")}>Cliente</th>
              <th className={clsx(TH, "text-left")}>Libro</th>
              <th className={clsx(TH, "text-left")}>Origen</th>
              <th className={clsx(TH, "text-left")}>Copiado hasta</th>
              <th className={clsx(TH, "text-left")}>Envío</th>
              <th className={clsx(TH, "text-left")}>Retiro</th>
              <th className={clsx(TH, "text-center")}>Folios</th>
              <th className={clsx(TH, "text-left")}>Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {terminadas.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 text-sm py-12">
                  Todavía no hay copiados registrados.
                </td>
              </tr>
            )}
            {terminadas.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 pl-5 text-[12px] text-gray-600">{fmtFecha(t.fecha_fin)}</td>
                <td className="px-3 py-2">
                  <Link href={`/libros/clientes/${t.cliente_id}`} className="text-[13px] text-gray-800 hover:text-violet-700">
                    {t.clienteNombre}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[12px] text-gray-700">
                  {t.libroNombre} <span className="text-gray-400">T{t.tomo}</span>
                </td>
                <td className="px-3 py-2 text-[12px] text-gray-500">{ORIGEN_TAREA_LABEL[t.origen]}</td>
                <td className="px-3 py-2 text-[12px] text-gray-600">{fmtFecha(t.periodo_hasta)}</td>
                <td className="px-3 py-2 text-[12px] text-gray-500">{fmtFecha(t.fecha_envio_copiar)}</td>
                <td className="px-3 py-2 text-[12px] text-gray-500">{fmtFecha(t.fecha_retiro)}</td>
                <td className="px-3 py-2 text-center text-[12px] text-gray-600">{t.folios_usados ?? "—"}</td>
                <td className="px-3 py-2 text-[12px] text-gray-500 max-w-[320px] truncate" title={t.observaciones ?? ""}>
                  {t.observaciones ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AvisosBalance({ avisos }: { avisos: AvisoBalance[] }) {
  if (avisos.length === 0) return null;
  const legalizados = avisos.filter((a) => a.legalizado);
  const finalizados = avisos.filter((a) => !a.legalizado);
  const lista = (xs: AvisoBalance[]) =>
    xs.map((a, i) => (
      <span key={a.clienteId}>
        {i > 0 && ", "}
        <Link href={`/libros/clientes/${a.clienteId}`} className="font-medium hover:underline">
          {a.nombre}
        </Link>{" "}
        (B{a.anio} · {a.libros} {a.libros === 1 ? "libro" : "libros"})
      </span>
    ));
  return (
    <div className="mt-3 space-y-1.5">
      {legalizados.length > 0 && (
        <p className="flex gap-2 text-[12px] text-red-800 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>Balance legalizado, acta por hacer:</strong> {lista(legalizados)}. Se crearon solas las tareas del
            envío anual (P1).
          </span>
        </p>
      )}
      {finalizados.length > 0 && (
        <p className="flex gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>Balance finalizado, envío anual pendiente:</strong> {lista(finalizados)}.
          </span>
        </p>
      )}
    </div>
  );
}

function AvisosRenovacion({ avisos }: { avisos: AvisoRenovacion[] }) {
  if (avisos.length === 0) return null;
  const vencidos = avisos.filter((a) => a.dias != null && a.dias < 0).length;
  return (
    <p
      className={clsx(
        "mt-1.5 flex gap-2 text-[12px] rounded-lg px-3 py-2 border",
        vencidos ? "text-red-800 bg-red-50 border-red-100" : "text-amber-800 bg-amber-50 border-amber-100"
      )}
    >
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>
        <strong>Renovación de autoridades{vencidos ? ` (${vencidos} con el mandato vencido, P1)` : ""}:</strong>{" "}
        {avisos.slice(0, 8).map((a, i) => (
          <span key={a.clienteId}>
            {i > 0 && ", "}
            <span className="font-medium">{a.nombre}</span>
            {a.vence && (
              <>
                {" "}
                ({a.dias! < 0 ? "venció" : "vence"} {fmtFecha(a.vence)}
                {a.pasos > 0 && ` · ${a.hechos}/${a.pasos}`})
              </>
            )}
          </span>
        ))}
        {avisos.length > 8 && ` y ${avisos.length - 8} más`}.{" "}
        <Link href="/libros/pedidos" className="font-medium underline">
          Ver en Pedidos
        </Link>
      </span>
    </p>
  );
}

export function SeguimientoLibrosClient({
  tareas,
  clientes,
  puestaAlDia,
  avisosBalance,
  avisosRenovacion,
  estados,
  equipo,
  puedeEditar,
}: {
  tareas: TareaVista[];
  clientes: ClienteCola[];
  puestaAlDia: PuestaAlDiaCliente[];
  avisosBalance: AvisoBalance[];
  avisosRenovacion: AvisoRenovacion[];
  estados: LibroEstado[];
  equipo: Persona[];
  puedeEditar: boolean;
}) {
  const [pestaña, setPestaña] = useState<"cola" | "puesta" | "historial">("cola");
  const abiertas = tareas.filter((t) => !t.esFinal).length;
  const atrasados = puestaAlDia.reduce((n, f) => n + f.atrasados.filter((a) => !a.enCola).length, 0);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 pt-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 rounded-full bg-violet-500" />
          <div>
            <h1 className="text-[17px] font-semibold text-gray-900">Libros — Seguimiento</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Un bloque por cliente: enviá a copiar, registrá el retiro y el copiado sin salir de acá
            </p>
          </div>
        </div>
        <AvisosBalance avisos={avisosBalance} />
        <AvisosRenovacion avisos={avisosRenovacion} />
        <div className="flex gap-0 mt-3 -mb-px">
          <Pestaña activa={pestaña === "cola"} onClick={() => setPestaña("cola")}>
            Cola ({abiertas})
          </Pestaña>
          <Pestaña activa={pestaña === "puesta"} onClick={() => setPestaña("puesta")}>
            Puesta al día ({atrasados})
          </Pestaña>
          <Pestaña activa={pestaña === "historial"} onClick={() => setPestaña("historial")}>
            Historial
          </Pestaña>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pestaña === "cola" && (
          <Cola tareas={tareas} clientes={clientes} estados={estados} equipo={equipo} puedeEditar={puedeEditar} />
        )}
        {pestaña === "puesta" && <PuestaAlDia filas={puestaAlDia} equipo={equipo} puedeEditar={puedeEditar} />}
        {pestaña === "historial" && <Historial tareas={tareas} />}
      </div>
    </div>
  );
}
