"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import {
  ORIGEN_TAREA_LABEL,
  PRIORIDADES,
  PRIORIDAD_INFO,
  UMBRAL_FOLIOS,
  fmtFecha,
} from "@/lib/libros";
import type { LibroEstado, LibroTarea, PrioridadLibro } from "@/types";
import { actualizarTarea, reordenarBloques, sumarInsistencia } from "./actions";
import { NuevaTareaModal, type Persona } from "./NuevaTareaModal";
import { PrioridadModal, RegistrarCopiadoModal } from "./SeguimientoModales";

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

export type PuestaAlDiaCliente = {
  clienteId: string;
  nombre: string;
  responsableId: string | null;
  alDia: number;
  total: number;
  sinCargar: number;
  atrasados: {
    libroId: string;
    nombre: string;
    tomo: number;
    ultimo: string | null;
    exigible: string | null;
    sinLibro: boolean;
    enCola: boolean;
  }[];
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

function FilaTarea({
  t,
  estados,
  equipo,
  puedeEditar,
  onPrioridad,
  onError,
}: {
  t: TareaVista;
  estados: LibroEstado[];
  equipo: Persona[];
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
    <tr className={clsx("hover:bg-violet-50/30", pendiente && "opacity-60")}>
      <td className="px-3 py-2 pl-5">
        <p className="text-[13px] text-gray-800">
          {t.libroNombre} <span className="text-[11px] text-gray-400">T{t.tomo}</span>
        </p>
        <p className="text-[11px] text-gray-400">{ORIGEN_TAREA_LABEL[t.origen]}</p>
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
      <td className="px-3 py-2">
        <select
          value={t.responsable_id ?? ""}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ responsable_id: e.target.value || null })}
          className={SELECT_CHICO}
        >
          <option value="">—</option>
          {equipo.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
          {t.responsable_id && !equipo.some((p) => p.id === t.responsable_id) && (
            <option value={t.responsable_id}>{t.responsableNombre ?? "Otra persona"}</option>
          )}
        </select>
      </td>
      <td className="px-3 py-2 text-[12px] text-gray-600">
        {t.periodo_desde || t.periodo_hasta ? `${fmtFecha(t.periodo_desde)} → ${fmtFecha(t.periodo_hasta)}` : "—"}
        <p className="text-[11px] text-gray-400">Último: {fmtFecha(t.ultimoCopiado)}</p>
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
      <td className={clsx("px-3 py-2 text-[12px]", t.fecha_limite ? "text-red-600 font-medium" : "text-gray-300")}>
        {fmtFecha(t.fecha_limite)}
      </td>
      <td className="px-3 py-2 text-center">
        <div className="inline-flex items-center gap-1">
          <span className="text-[12px] text-gray-600">{t.insistencias}</span>
          {puedeEditar && (
            <button
              title="Sumar una insistencia al cliente"
              onClick={() =>
                startTransition(async () => {
                  const res = await sumarInsistencia(t.id);
                  if (res.error) onError(res.error);
                })
              }
              className="text-gray-300 hover:text-violet-700"
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </td>
      <td
        className={clsx(
          "px-3 py-2 text-center text-[12px]",
          t.libres != null && t.libres <= UMBRAL_FOLIOS ? "text-red-600 font-medium" : "text-gray-600"
        )}
      >
        {t.libres ?? "—"}
      </td>
      <td className="px-3 py-2 text-[12px] text-gray-500 max-w-[200px] truncate" title={t.observaciones ?? ""}>
        {t.observaciones ?? ""}
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
  const [copiadoDe, setCopiadoDe] = useState<Bloque | null>(null);

  const mapaClientes = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const niveles = useMemo(() => armarBloques(tareas, mapaClientes), [tareas, mapaClientes]);

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
                        {b.cliente.mandatoVencido && <span className="text-red-600 font-medium"> · Mandato vencido</span>}
                      </p>
                    </div>
                    <div className="flex-1" />
                    {puedeEditar && (
                      <button
                        onClick={() => setCopiadoDe(b)}
                        className="px-3 py-1.5 text-[12px] font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg"
                      >
                        Registrar copiado
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-gray-50/70">
                          <th className={clsx(TH, "text-left pl-5")}>Libro</th>
                          <th className={clsx(TH, "text-left")}>Prioridad</th>
                          <th className={clsx(TH, "text-left")}>Estado</th>
                          <th className={clsx(TH, "text-left")}>Responsable</th>
                          <th className={clsx(TH, "text-left")}>Período</th>
                          <th className={clsx(TH, "text-center")}>Material</th>
                          <th className={clsx(TH, "text-left")}>Límite</th>
                          <th className={clsx(TH, "text-center")}>Insist.</th>
                          <th className={clsx(TH, "text-center")}>Libres</th>
                          <th className={clsx(TH, "text-left")}>Obs.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {b.tareas.map((t) => (
                          <FilaTarea
                            key={t.id}
                            t={t}
                            estados={estados}
                            equipo={equipo}
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
      {copiadoDe && (
        <RegistrarCopiadoModal
          clienteNombre={copiadoDe.cliente.nombre}
          tareas={copiadoDe.tareas}
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
  const [busqueda, setBusqueda] = useState("");
  const [soloAtrasados, setSoloAtrasados] = useState(true);
  const [creandoPara, setCreandoPara] = useState<{ fila: PuestaAlDiaCliente; libroIds: string[] } | null>(null);

  const visibles = filas.filter(
    (f) =>
      (!soloAtrasados || f.atrasados.length > 0) &&
      (!busqueda.trim() || f.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
  );
  const totalAlDia = filas.reduce((n, f) => n + f.alDia, 0);
  const total = filas.reduce((n, f) => n + f.total, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <p className="text-[12px] text-gray-500">
          <span className="font-semibold text-gray-800">{totalAlDia}</span> de {total} libros al día en{" "}
          {filas.length} clientes
        </p>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={soloAtrasados}
            onChange={(e) => setSoloAtrasados(e.target.checked)}
            className="accent-violet-600"
          />
          Solo clientes con libros atrasados
        </label>
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
        Anuales: tienen que llegar al último cierre de ejercicio con el balance ya vencido (cierre + 135 días).
        Trimestrales: al último trimestre cerrado hace más de 30 días. Los libros por evento no cuentan.
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
                {puedeEditar && creables.length > 0 && (
                  <button
                    onClick={() => setCreandoPara({ fila: f, libroIds: creables.map((a) => a.libroId) })}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-700 hover:text-violet-900"
                  >
                    <Plus size={13} /> Crear tareas ({creables.length})
                  </button>
                )}
              </div>
              {f.atrasados.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {f.atrasados.map((a) => (
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
                      {a.sinLibro ? " · sin libro" : ` · ${a.ultimo ? fmtFecha(a.ultimo) : "nunca"}`}
                      {a.enCola && " · en cola"}
                    </button>
                  ))}
                </div>
              )}
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
              <th className={clsx(TH, "text-center")}>Folios</th>
              <th className={clsx(TH, "text-left")}>Responsable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {terminadas.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 text-sm py-12">
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
                <td className="px-3 py-2 text-center text-[12px] text-gray-600">{t.folios_usados ?? "—"}</td>
                <td className="px-3 py-2 text-[12px] text-gray-500">{t.responsableNombre ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SeguimientoLibrosClient({
  tareas,
  clientes,
  puestaAlDia,
  estados,
  equipo,
  puedeEditar,
}: {
  tareas: TareaVista[];
  clientes: ClienteCola[];
  puestaAlDia: PuestaAlDiaCliente[];
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
              Cola de trabajo por cliente: subí o bajá cada cliente dentro de su nivel de prioridad
            </p>
          </div>
        </div>
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
