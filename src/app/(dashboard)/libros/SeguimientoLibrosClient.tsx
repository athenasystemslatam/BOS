"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GripVertical, Plus, Search, Send } from "lucide-react";
import {
  ORIGEN_TAREA_LABEL,
  PRIORIDADES,
  PRIORIDAD_INFO,
  DEFINICION_PRIORIDAD,
  UMBRAL_FOLIOS,
  fmtFecha,
} from "@/lib/libros";
import type { LibroEstado, LibroTarea, PrioridadLibro, TipoSocietario } from "@/types";
import { actualizarTarea, reordenarBloques } from "./actions";
import { NuevaTareaModal, type Persona } from "./NuevaTareaModal";
import { AgregarTareaModal } from "./AgregarTareaModal";
import { DescargarExcelButton } from "@/components/DescargarExcelButton";
import { EnviarACopiarModal, PrioridadModal, RegistrarCopiadoModal } from "./SeguimientoModales";
import {
  AVISO,
  AVISO_URGENTE,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  CHIP,
  CONTROL,
  CONTROL_CELDA,
  ERROR,
  MONO,
  NUM,
  PAGINA,
  PANEL,
  PANEL_CABECERA,
  RAYA_MODULO,
  SEMAFORO,
  TH,
  TITULO,
  VACIO,
  VACIO_TEXTO,
  claseEstadoTarea,
} from "./ui";

export type TareaVista = LibroTarea & {
  clienteNombre: string;
  clienteCuit: string | null;
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
  ultimaCopiadaActa: { acta: string; fecha: string } | null;
};

export type ClienteCola = {
  id: string;
  nombre: string;
  cuit: string | null;
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
  cuit: string | null;
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

/** Mandatos de los clientes de Libros: vencidos y que vencen dentro del primer aviso. */
export type AvisoMandatos = { vencidos: number; proximos: number; dias: number };

/** Lo que necesita "+ Agregar": libros cargados del cliente y los del catálogo que faltan. */
export type ClienteAgregar = {
  id: string;
  nombre: string;
  cuit: string | null;
  responsableId: string | null;
  tipo: TipoSocietario | null;
  libros: { id: string; nombre: string; tomo: number; sinLibro: boolean; enCola: boolean }[];
  faltantes: { catalogoId: string; nombre: string }[];
};

type Bloque = { cliente: ClienteCola; nivel: PrioridadLibro; orden: number; tareas: TareaVista[] };

const BUSCADOR =
  "text-[13px] text-ink bg-paper border border-line-input rounded-[9px] pl-7 pr-2.5 min-h-[36px] w-full sm:w-52 focus:outline-none focus:border-bordo";
const FOLIOS_BAJOS = "!text-orange-700 font-semibold";

/** Por nombre o por CUIT (con o sin guiones). */
function coincide(busqueda: string, nombre: string, cuit: string | null): boolean {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, "");
  return nombre.toLowerCase().includes(q) || (digitos.length >= 3 && (cuit ?? "").replace(/\D/g, "").includes(digitos));
}

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
      cuit: lista[0].clienteCuit,
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

/** La ayuda va en un "?" y no en el título. */
function Ayuda({ children }: { children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary
        aria-label="Ayuda"
        className="list-none [&::-webkit-details-marker]:hidden w-6 h-6 rounded-full border border-line-input bg-paper text-[12px] font-semibold text-ink-muted hover:text-ink flex items-center justify-center cursor-pointer"
      >
        ?
      </summary>
      <div className="absolute z-20 left-0 mt-2 w-[min(340px,80vw)] rounded-[10px] border border-line-panel bg-paper shadow-lg p-3 text-[12px] text-ink-cell leading-relaxed">
        {children}
      </div>
    </details>
  );
}

function Pestaña({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={clsx(
        "py-2.5 -mb-px text-[13.5px] border-b-2 whitespace-nowrap",
        activa ? "border-bordo text-ink font-bold" : "border-transparent text-ink-muted font-medium hover:text-ink"
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
        className="w-full min-w-[220px] max-w-[340px] text-[12px] text-ink-cell bg-paper border border-bordo rounded-md px-2 py-1 focus:outline-none"
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
      className="w-full min-w-[220px] max-w-[340px] text-left text-[12px] text-ink-muted whitespace-pre-line line-clamp-2 rounded-md px-1.5 py-1 hover:bg-paper-hover disabled:hover:bg-transparent disabled:cursor-default"
    >
      {valor || (puedeEditar ? <span className="text-ink-ghost">Agregar detalle…</span> : "—")}
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
  const codigo = estados.find((e) => e.id === t.estado_id)?.codigo ?? null;
  const bajos = t.libres != null && t.libres <= UMBRAL_FOLIOS;

  function guardar(cambios: Parameters<typeof actualizarTarea>[1]) {
    startTransition(async () => {
      const res = await actualizarTarea(t.id, cambios);
      if (res.error) onError(res.error);
    });
  }

  return (
    <tr className={clsx("border-t border-line-row hover:bg-paper-hover align-top", pendiente && "opacity-60")}>
      <td className="px-3 py-2.5 pl-4">
        <div className="flex items-start gap-2">
          <button
            onClick={onPrioridad}
            disabled={!puedeEditar}
            title={t.prioridad_manual ? `A mano: ${t.prioridad_motivo}` : `Sistema: ${t.motivoSugerido}`}
            aria-label={`Prioridad ${t.prioridad}`}
            className={clsx(CHIP, "!px-2 shrink-0", PRIORIDAD_INFO[t.prioridad].cls)}
          >
            {t.prioridad}
            {t.prioridad_manual && " ✎"}
          </button>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">
              {t.libroNombre}
              {t.tomo > 1 && (
                <span className="ml-1.5 align-middle text-[11px] font-semibold rounded-md px-1.5 py-px bg-bordo-tint2 text-bordo">
                  Tomo {t.tomo}
                </span>
              )}
            </p>
            <p className="text-[11px] text-ink-subtle">
              {ORIGEN_TAREA_LABEL[t.origen]}
              {t.fecha_limite && (
                <span className="text-red-700 font-semibold">
                  {" "}· Límite <span className={MONO}>{fmtFecha(t.fecha_limite)}</span>
                </span>
              )}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <select
          value={t.estado_id}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ estado_id: e.target.value })}
          aria-label="Estado"
          className={clsx(CHIP, "cursor-pointer disabled:cursor-default focus:outline-none", claseEstadoTarea(codigo))}
        >
          {abiertos.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        {(t.fecha_envio_copiar || bajos) && (
          <p className="md:hidden mt-1 text-[11px] text-ink-subtle">
            {t.fecha_envio_copiar && (
              <>
                Envío <span className={MONO}>{fmtFecha(t.fecha_envio_copiar)}</span>
              </>
            )}
            {bajos && <span className="text-orange-700 font-semibold"> · {t.libres} folios libres</span>}
          </p>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <p className={NUM}>
          {t.periodo_desde || t.periodo_hasta ? `${fmtFecha(t.periodo_desde)} → ${fmtFecha(t.periodo_hasta)}` : "—"}
        </p>
        <p className="text-[11px] text-ink-subtle">
          {t.ultimaCopiadaActa
            ? <><span className={MONO}>Acta {t.ultimaCopiadaActa.acta}</span> · {fmtFecha(t.ultimaCopiadaActa.fecha)}</>
            : <>Último <span className={MONO}>{fmtFecha(t.ultimoCopiado)}</span></>}
        </p>
      </td>
      <td className="px-2 py-1.5 whitespace-normal">
        <DetalleEditable
          key={t.observaciones ?? ""}
          valor={t.observaciones}
          puedeEditar={puedeEditar}
          onGuardar={(v) => guardar({ observaciones: v })}
        />
      </td>
      <td className="hidden md:table-cell px-2 py-1.5">
        <input
          type="date"
          aria-label="Fecha de envío"
          value={t.fecha_envio_copiar ?? ""}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ fecha_envio_copiar: e.target.value || null })}
          className={clsx(CONTROL_CELDA, MONO, "w-[124px]", !t.fecha_envio_copiar && "text-ink-ghost")}
        />
      </td>
      <td className="hidden md:table-cell px-2 py-1.5">
        <input
          type="date"
          aria-label="Fecha de retiro"
          value={t.fecha_retiro ?? ""}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ fecha_retiro: e.target.value || null })}
          className={clsx(CONTROL_CELDA, MONO, "w-[124px]", !t.fecha_retiro && "text-ink-ghost")}
        />
      </td>
      <td className={clsx("hidden md:table-cell px-3 py-2.5", NUM, bajos && FOLIOS_BAJOS)}>{t.libres ?? "—"}</td>
      <td className="hidden lg:table-cell px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={t.material_listo}
          disabled={!puedeEditar}
          onChange={(e) => guardar({ material_listo: e.target.checked })}
          className="accent-bordo"
          aria-label="Material listo"
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
  busqueda,
  onIrPuesta,
}: {
  tareas: TareaVista[];
  clientes: ClienteCola[];
  estados: LibroEstado[];
  equipo: Persona[];
  puedeEditar: boolean;
  busqueda: string;
  onIrPuesta: () => void;
}) {
  const [, startMover] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filtroResp, setFiltroResp] = useState("");
  const [prioridadDe, setPrioridadDe] = useState<TareaVista | null>(null);
  const [envioDe, setEnvioDe] = useState<Bloque | null>(null);
  const [copiadoDe, setCopiadoDe] = useState<Bloque | null>(null);

  // Orden por arrastrar y soltar (como Sueldos), guardado en orden_manual:
  // lo ve igual todo el equipo. ordenLocal evita el salto hasta que vuelve el
  // server con el orden nuevo.
  const [agarrado, setAgarrado] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<{ id: string; nivel: PrioridadLibro } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [ordenLocal, setOrdenLocal] = useState<Partial<Record<PrioridadLibro, string[]>>>({});
  useEffect(() => setOrdenLocal({}), [tareas]);

  const mapaClientes = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const niveles = useMemo(() => {
    const base = armarBloques(tareas, mapaClientes);
    for (const p of PRIORIDADES) {
      const orden = ordenLocal[p];
      if (orden) base[p].sort((a, b) => orden.indexOf(a.cliente.id) - orden.indexOf(b.cliente.id));
    }
    return base;
  }, [tareas, mapaClientes, ordenLocal]);
  const copiandose = estados.find((e) => e.codigo === "copiandose")?.id;
  const puedeOrdenar = puedeEditar && !filtroResp && !busqueda.trim();

  function soltar(nivel: PrioridadLibro, destinoId: string) {
    if (!arrastrando || arrastrando.nivel !== nivel || arrastrando.id === destinoId) return;
    const ids = niveles[nivel].map((b) => b.cliente.id).filter((id) => id !== arrastrando.id);
    ids.splice(ids.indexOf(destinoId), 0, arrastrando.id);
    setOrdenLocal((prev) => ({ ...prev, [nivel]: ids }));
    startMover(async () => {
      const res = await reordenarBloques(ids);
      if (res.error) {
        setError(res.error);
        setOrdenLocal({});
      }
    });
  }

  const total = PRIORIDADES.reduce((n, p) => n + niveles[p].length, 0);

  if (total === 0) {
    return (
      <div className="p-4 sm:p-6">
        <div className={clsx(PANEL, VACIO)}>
          <p className="font-archivo text-[15px] font-bold text-ink">La cola está vacía</p>
          <p className={VACIO_TEXTO}>
            Las tareas se crean desde Atrasos sin asignar, desde la ficha de cada cliente o solas, cuando un balance
            queda legalizado.
          </p>
          {puedeEditar && (
            <button onClick={onIrPuesta} className={BOTON_PRIMARIO}>
              <Plus size={14} /> Crear tareas desde Atrasos sin asignar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
        <p className="flex flex-wrap items-baseline gap-x-4 text-[13px] text-ink-muted">
          {PRIORIDADES.map((p) => (
            <span key={p}>
              <b className="font-archivo text-[17px] text-ink tabular-nums">{niveles[p].length}</b> en {p}
            </span>
          ))}
        </p>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          Responsable
          <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} className={CONTROL}>
            <option value="">Todos</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
      </div>
      {puedeEditar && !puedeOrdenar && (
        <p className="text-[11.5px] text-ink-subtle -mt-3">
          Con un filtro o una búsqueda no se puede reordenar: quitalos para arrastrar clientes.
        </p>
      )}

      {error && (
        <p className={clsx(ERROR, "flex justify-between gap-3")}>
          {error}
          <button onClick={() => setError(null)} className="font-semibold text-red-700 hover:text-red-900">
            Cerrar
          </button>
        </p>
      )}

      {PRIORIDADES.map((nivel) => {
        const bloques = niveles[nivel].filter(
          (b) =>
            (!filtroResp || b.cliente.responsableId === filtroResp || b.tareas.some((t) => t.responsable_id === filtroResp)) &&
            coincide(busqueda, b.cliente.nombre, b.cliente.cuit)
        );
        if (bloques.length === 0) return null;
        return (
          <section key={nivel} className="space-y-3">
            <h2 className="flex items-center gap-2">
              <span className={clsx(CHIP, PRIORIDAD_INFO[nivel].cls)}>{PRIORIDAD_INFO[nivel].label}</span>
              <Ayuda>{DEFINICION_PRIORIDAD[nivel]}</Ayuda>
              <span className="text-[12px] text-ink-subtle">
                <span className={MONO}>{bloques.length}</span> clientes
              </span>
            </h2>
            {bloques.map((b) => {
              const indice = niveles[nivel].indexOf(b);
              const porEnviar = b.tareas.filter((t) => t.estado_id !== copiandose).length;
              return (
                <div
                  key={b.cliente.id}
                  draggable={puedeOrdenar && agarrado === b.cliente.id}
                  onDragStart={() => setArrastrando({ id: b.cliente.id, nivel })}
                  onDragOver={(e) => {
                    if (!arrastrando || arrastrando.nivel !== nivel) return;
                    e.preventDefault();
                    setSobre(b.cliente.id);
                  }}
                  onDragLeave={() => setSobre((s) => (s === b.cliente.id ? null : s))}
                  onDrop={() => soltar(nivel, b.cliente.id)}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setSobre(null);
                    setAgarrado(null);
                  }}
                  className={clsx(
                    PANEL,
                    "overflow-hidden",
                    PRIORIDAD_INFO[nivel].borde,
                    arrastrando?.id === b.cliente.id && "opacity-40",
                    sobre === b.cliente.id && arrastrando && arrastrando.id !== b.cliente.id && "ring-2 ring-bordo"
                  )}
                >
                  <div className={clsx(PANEL_CABECERA, "flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5")}>
                    {puedeOrdenar && (
                      <span
                        onMouseDown={() => setAgarrado(b.cliente.id)}
                        onMouseUp={() => setAgarrado(null)}
                        title="Arrastrá para cambiar el orden"
                        aria-hidden="true"
                        className="text-ink-subtle hover:text-ink cursor-grab active:cursor-grabbing -ml-1"
                      >
                        <GripVertical size={16} />
                      </span>
                    )}
                    <span className={clsx(MONO, "text-[12px] text-ink-subtle w-5 text-right")}>{indice + 1}</span>
                    <div className="min-w-0 flex-1 basis-56">
                      <Link
                        href={`/libros/clientes/${b.cliente.id}`}
                        className="font-archivo text-[14px] font-bold text-ink hover:text-bordo"
                      >
                        {b.cliente.nombre}
                      </Link>
                      <p className="text-[11.5px] text-ink-subtle">
                        <span className={MONO}>{b.tareas.length}</span> {b.tareas.length === 1 ? "libro" : "libros"} ·{" "}
                        {b.cliente.responsableNombre ?? "sin responsable"}
                        {b.cliente.mandatoVencido && (
                          <Link href={URL_RENOVACIONES} className="text-red-700 font-semibold hover:underline">
                            {" "}· Mandato vencido (ver renovación en Pedidos)
                          </Link>
                        )}
                      </p>
                    </div>
                    {puedeEditar && (
                      <div className="flex flex-wrap gap-2">
                        {porEnviar > 0 && (
                          <button onClick={() => setEnvioDe(b)} className={BOTON_SECUNDARIO}>
                            <Send size={13} /> Enviar a copiar
                          </button>
                        )}
                        <button onClick={() => setCopiadoDe(b)} className={BOTON_PRIMARIO}>
                          Retirado / Registrar copiado
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead>
                        <tr>
                          <th className={clsx(TH, "text-left pl-4")}>Libro</th>
                          <th className={clsx(TH, "text-left")}>Estado</th>
                          <th className={clsx(TH, "text-right")}>Período</th>
                          <th className={clsx(TH, "text-left")}>Detalle</th>
                          <th className={clsx(TH, "hidden md:table-cell text-left")}>Envío</th>
                          <th className={clsx(TH, "hidden md:table-cell text-left")}>Retiro</th>
                          <th className={clsx(TH, "hidden md:table-cell text-right")}>Libres</th>
                          <th className={clsx(TH, "hidden lg:table-cell text-center")}>Material</th>
                        </tr>
                      </thead>
                      <tbody>
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
  busqueda,
  onLimpiarBusqueda,
}: {
  filas: PuestaAlDiaCliente[];
  equipo: Persona[];
  puedeEditar: boolean;
  busqueda: string;
  onLimpiarBusqueda: () => void;
}) {
  const [vista, setVista] = useState<"atrasados" | "sinDato">("atrasados");
  const [creandoPara, setCreandoPara] = useState<{ fila: PuestaAlDiaCliente; libroIds: string[] } | null>(null);

  // "Sin asignar" = atrasados que todavía no tienen tarea en la cola.
  const sinAsignar = (f: PuestaAlDiaCliente) => f.atrasados.filter((a) => !a.enCola);
  const visibles = filas.filter(
    (f) => (vista === "atrasados" ? sinAsignar(f) : f.sinDato).length > 0 && coincide(busqueda, f.nombre, f.cuit)
  );
  const nAtrasados = filas.reduce((n, f) => n + sinAsignar(f).length, 0);
  const nSinDato = filas.reduce((n, f) => n + f.sinDato.length, 0);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
        <div className="inline-flex rounded-full border border-line-input bg-paper p-0.5" role="tablist">
          {(
            [
              ["atrasados", "Sin asignar", nAtrasados],
              ["sinDato", "Sin dato", nSinDato],
            ] as const
          ).map(([v, label, n]) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={clsx(
                "px-3 py-1 text-[12.5px] font-semibold rounded-full",
                vista === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink"
              )}
            >
              {label} <span className="font-plex tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <Ayuda>
          {vista === "atrasados" ? (
            <>
              <b>Sin asignar:</b> libros atrasados (con último copiado cargado, no llegan a lo exigible) que todavía
              no tienen tarea en la cola. Anuales: último cierre con el
              balance ya vencido (cierre + 135 días). Trimestrales: último trimestre cerrado hace más de 30 días. Los
              libros por evento no cuentan.
            </>
          ) : (
            <>
              <b>Sin dato:</b> no tienen último copiado cargado, así que no se sabe si están atrasados. Hay que relevar
              el libro y cargar el dato en la ficha, no mandarlo a copiar.
            </>
          )}
        </Ayuda>
        <div className="flex-1" />
        <Link href="/libros/dashboard" className="text-[12.5px] font-semibold text-ink-muted hover:text-ink">
          Ver el avance en el Dashboard
        </Link>
      </div>

      <div className={clsx(PANEL, "divide-y divide-line-row")}>
        {visibles.length === 0 && (
          <div className={VACIO}>
            <p className="font-archivo text-[15px] font-bold text-ink">
              {busqueda.trim()
                ? "Ningún cliente coincide con la búsqueda"
                : vista === "atrasados"
                  ? "No hay atrasos sin asignar"
                  : "No hay libros sin dato"}
            </p>
            <p className={VACIO_TEXTO}>
              {busqueda.trim()
                ? "Probá con otra parte del nombre o del CUIT."
                : vista === "atrasados"
                  ? "Todos los libros atrasados ya tienen tarea en la cola, o están al día."
                  : "Todos los libros tienen el último copiado cargado en la ficha."}
            </p>
            {busqueda.trim() ? (
              <button onClick={onLimpiarBusqueda} className={BOTON_SECUNDARIO}>
                Limpiar búsqueda
              </button>
            ) : (
              vista === "atrasados" &&
              nSinDato > 0 && (
                <button onClick={() => setVista("sinDato")} className={BOTON_SECUNDARIO}>
                  Ver los <span className="font-plex tabular-nums">{nSinDato}</span> sin dato
                </button>
              )
            )}
          </div>
        )}
        {visibles.map((f) => {
          const creables = sinAsignar(f);
          return (
            <div key={f.clienteId} className="px-4 sm:px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  href={`/libros/clientes/${f.clienteId}`}
                  className="font-archivo text-[13.5px] font-bold text-ink hover:text-bordo w-full sm:w-72 truncate"
                >
                  {f.nombre}
                </Link>
                {f.sinCargar > 0 && (
                  <span className="text-[11.5px] text-ink-subtle">
                    <span className={MONO}>{f.sinCargar}</span> sin cargar en la ficha
                  </span>
                )}
                <div className="flex-1" />
                {vista === "atrasados" && puedeEditar && creables.length > 0 && (
                  <button
                    onClick={() => setCreandoPara({ fila: f, libroIds: creables.map((a) => a.libroId) })}
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-bordo hover:text-bordo-dark"
                  >
                    <Plus size={13} /> Crear tareas (<span className="font-plex tabular-nums">{creables.length}</span>)
                  </button>
                )}
                {vista === "sinDato" && (
                  <Link
                    href={`/libros/clientes/${f.clienteId}`}
                    className="text-[12.5px] font-semibold text-bordo hover:text-bordo-dark"
                  >
                    Relevar en la ficha
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {vista === "atrasados"
                  ? creables.map((a) => (
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
                          CHIP,
                          "!font-medium disabled:cursor-default",
                          a.enCola ? SEMAFORO.verdeClaro : SEMAFORO.rojo,
                          !a.enCola && puedeEditar && "hover:brightness-95"
                        )}
                      >
                        {a.nombre}
                        {a.sinLibro ? " · sin libro" : <span className={MONO}> · {fmtFecha(a.ultimo)}</span>}
                        {a.enCola && " · en cola"}
                      </button>
                    ))
                  : f.sinDato.map((a) => (
                      <span
                        key={a.libroId}
                        title={`Exigible: ${fmtFecha(a.exigible)} · sin último copiado cargado`}
                        className={clsx(CHIP, "!font-medium", SEMAFORO.sinDato)}
                      >
                        {a.nombre}
                        {a.tomo > 1 && ` · tomo ${a.tomo}`}
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
            nombre: a.tomo > 1 ? `${a.nombre} (tomo ${a.tomo})` : a.nombre,
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

function Historial({
  tareas,
  busqueda,
  onLimpiarBusqueda,
  onIrCola,
}: {
  tareas: TareaVista[];
  busqueda: string;
  onLimpiarBusqueda: () => void;
  onIrCola: () => void;
}) {
  const todas = tareas.filter((t) => t.esFinal);
  const terminadas = todas
    .filter((t) => coincide(busqueda, t.clienteNombre, t.clienteCuit))
    .sort((a, b) => (b.fecha_fin ?? "").localeCompare(a.fecha_fin ?? ""));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-ink-muted">
          <b className="font-archivo text-[17px] text-ink tabular-nums">{terminadas.length}</b> copiados registrados
        </p>
      </div>
      <div className={clsx(PANEL, "overflow-x-auto")}>
        {terminadas.length === 0 ? (
          <div className={VACIO}>
            <p className="font-archivo text-[15px] font-bold text-ink">
              {todas.length === 0 ? "Todavía no hay copiados registrados" : "Ningún cliente coincide con la búsqueda"}
            </p>
            <p className={VACIO_TEXTO}>
              {todas.length === 0
                ? "Cada vez que se registra un retiro o un copiado desde la Cola, queda acá."
                : "Probá con otra parte del nombre o del CUIT."}
            </p>
            {todas.length === 0 ? (
              <button onClick={onIrCola} className={BOTON_SECUNDARIO}>
                Ir a la Cola
              </button>
            ) : (
              <button onClick={onLimpiarBusqueda} className={BOTON_SECUNDARIO}>
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className={PANEL_CABECERA}>
                <th className={clsx(TH, "text-right pl-4")}>Fecha</th>
                <th className={clsx(TH, "text-left")}>Cliente</th>
                <th className={clsx(TH, "text-left")}>Libro</th>
                <th className={clsx(TH, "text-right")}>Copiado hasta</th>
                <th className={clsx(TH, "hidden md:table-cell text-left")}>Origen</th>
                <th className={clsx(TH, "hidden md:table-cell text-right")}>Envío</th>
                <th className={clsx(TH, "hidden md:table-cell text-right")}>Retiro</th>
                <th className={clsx(TH, "hidden md:table-cell text-right")}>Folios</th>
                <th className={clsx(TH, "hidden lg:table-cell text-left")}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {terminadas.map((t) => (
                <tr key={t.id} className="border-t border-line-row hover:bg-paper-hover">
                  <td className={clsx("px-3 py-2 pl-4", NUM)}>{fmtFecha(t.fecha_fin)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/libros/clientes/${t.cliente_id}`}
                      className="font-archivo text-[13px] font-bold text-ink hover:text-bordo"
                    >
                      {t.clienteNombre}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[12.5px] text-ink-cell">
                    {t.libroNombre}
                    {t.tomo > 1 && <span className="text-ink-subtle"> · tomo {t.tomo}</span>}
                  </td>
                  <td className={clsx("px-3 py-2", NUM)}>{fmtFecha(t.periodo_hasta)}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-[12px] text-ink-muted">{ORIGEN_TAREA_LABEL[t.origen]}</td>
                  <td className={clsx("hidden md:table-cell px-3 py-2", NUM)}>{fmtFecha(t.fecha_envio_copiar)}</td>
                  <td className={clsx("hidden md:table-cell px-3 py-2", NUM)}>{fmtFecha(t.fecha_retiro)}</td>
                  <td className={clsx("hidden md:table-cell px-3 py-2", NUM)}>{t.folios_usados ?? "—"}</td>
                  <td
                    className="hidden lg:table-cell px-3 py-2 text-[12px] text-ink-muted max-w-[320px] truncate"
                    title={t.observaciones ?? ""}
                  >
                    {t.observaciones ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Punto({ urgente }: { urgente?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx("w-2 h-2 rounded-full shrink-0 mt-[5px]", urgente ? "bg-red-600" : "bg-alerta-dot")}
    />
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
        <Link href={`/libros/clientes/${a.clienteId}`} className="font-semibold underline-offset-2 hover:underline">
          {a.nombre}
        </Link>{" "}
        (B<span className={MONO}>{a.anio}</span> · <span className={MONO}>{a.libros}</span>{" "}
        {a.libros === 1 ? "libro" : "libros"})
      </span>
    ));
  return (
    <>
      {legalizados.length > 0 && (
        <p className={AVISO}>
          <Punto />
          <span>
            <b>Balance legalizado, acta por hacer:</b> {lista(legalizados)}. Se sumaron solas las tareas del envío
            anual (P1).
          </span>
        </p>
      )}
      {finalizados.length > 0 && (
        <p className={AVISO}>
          <Punto />
          <span>
            <b>Balance finalizado, envío anual pendiente:</b> {lista(finalizados)}.
          </span>
        </p>
      )}
    </>
  );
}

const URL_RENOVACIONES = "/libros/pedidos?tipo=renovacion_autoridades&en_curso=1";

function AvisoDeMandatos({ aviso }: { aviso: AvisoMandatos }) {
  if (aviso.vencidos === 0 && aviso.proximos === 0) return null;
  return (
    <p className={aviso.vencidos > 0 ? AVISO_URGENTE : AVISO}>
      <Punto urgente={aviso.vencidos > 0} />
      <span>
        <b>
          <span className={MONO}>{aviso.vencidos}</span> {aviso.vencidos === 1 ? "mandato vencido" : "mandatos vencidos"}
        </b>{" "}
        · <span className={MONO}>{aviso.proximos}</span> {aviso.proximos === 1 ? "vence" : "vencen"} en{" "}
        <span className={MONO}>{aviso.dias}</span> días ·{" "}
        <Link href={URL_RENOVACIONES} className="font-semibold underline">
          Ver
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
  avisoMandatos,
  clientesAgregar,
  estados,
  equipo,
  puedeEditar,
  esAdmin,
}: {
  tareas: TareaVista[];
  clientes: ClienteCola[];
  puestaAlDia: PuestaAlDiaCliente[];
  avisosBalance: AvisoBalance[];
  avisoMandatos: AvisoMandatos;
  clientesAgregar: ClienteAgregar[];
  estados: LibroEstado[];
  equipo: Persona[];
  puedeEditar: boolean;
  esAdmin: boolean;
}) {
  const [pestaña, setPestaña] = useState<"cola" | "puesta" | "historial">("cola");
  const [busqueda, setBusqueda] = useState("");
  const clientesEnCola = new Set(tareas.filter((t) => !t.esFinal).map((t) => t.cliente_id)).size;
  const sinAsignar = puestaAlDia.map((f) => f.atrasados.filter((a) => !a.enCola).length);
  const librosSinAsignar = sinAsignar.reduce((n, x) => n + x, 0);
  const clientesSinAsignar = sinAsignar.filter((x) => x > 0).length;
  const [agregando, setAgregando] = useState(false);
  const hayAvisos = avisosBalance.length > 0 || avisoMandatos.vencidos > 0 || avisoMandatos.proximos > 0;

  return (
    <div className={PAGINA}>
      <div className="shrink-0 px-4 sm:px-6 pt-5 space-y-3">
        <div className="flex items-center gap-3">
          <span className={RAYA_MODULO} aria-hidden="true" />
          <h1 className={TITULO}>Seguimiento</h1>
          <Ayuda>
            Un bloque por cliente con sus libros en curso. &ldquo;Enviar a copiar&rdquo; registra la salida a la
            copiadora; &ldquo;Retirado / Registrar copiado&rdquo; registra la vuelta, pide los folios y pasa los libros
            al historial. Arrastrá cada cliente para cambiar su orden dentro de la prioridad: el orden lo ve todo el
            equipo.
          </Ayuda>
          <div className="flex-1" />
          {esAdmin && (
            <DescargarExcelButton
              href="/api/exportar/libros/seguimiento"
              title="Descargar la cola y la puesta al día a Excel"
            />
          )}
          {puedeEditar && (
            <button onClick={() => setAgregando(true)} className={BOTON_SECUNDARIO}>
              <Plus size={14} /> Agregar
            </button>
          )}
        </div>
        {hayAvisos && (
          <div className="space-y-1.5">
            <AvisosBalance avisos={avisosBalance} />
            <AvisoDeMandatos aviso={avisoMandatos} />
          </div>
        )}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line-rule">
          <div role="tablist" aria-label="Vistas" className="flex flex-wrap gap-x-6">
            <Pestaña activa={pestaña === "cola"} onClick={() => setPestaña("cola")}>
              Cola{" "}
              <span className="text-ink-subtle font-normal">
                · <span className="font-plex tabular-nums">{clientesEnCola}</span>{" "}
                {clientesEnCola === 1 ? "cliente" : "clientes"}
              </span>
            </Pestaña>
            <Pestaña activa={pestaña === "puesta"} onClick={() => setPestaña("puesta")}>
              Atrasos sin asignar{" "}
              <span className="text-ink-subtle font-normal">
                · <span className="font-plex tabular-nums">{librosSinAsignar}</span>{" "}
                {librosSinAsignar === 1 ? "libro" : "libros"} en <span className="font-plex tabular-nums">{clientesSinAsignar}</span>{" "}
                {clientesSinAsignar === 1 ? "cliente" : "clientes"}
              </span>
            </Pestaña>
            <Pestaña activa={pestaña === "historial"} onClick={() => setPestaña("historial")}>
              Historial
            </Pestaña>
          </div>
          <div className="flex-1" />
          <div className="relative w-full sm:w-auto pb-2">
            <Search size={13} className="absolute left-2.5 top-[calc(50%-4px)] -translate-y-1/2 text-ink-subtle" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o CUIT…"
              aria-label="Buscar cliente o CUIT"
              className={BUSCADOR}
            />
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pestaña === "cola" && (
          <Cola
            tareas={tareas}
            clientes={clientes}
            estados={estados}
            equipo={equipo}
            puedeEditar={puedeEditar}
            busqueda={busqueda}
            onIrPuesta={() => setPestaña("puesta")}
          />
        )}
        {pestaña === "puesta" && (
          <PuestaAlDia
            filas={puestaAlDia}
            equipo={equipo}
            puedeEditar={puedeEditar}
            busqueda={busqueda}
            onLimpiarBusqueda={() => setBusqueda("")}
          />
        )}
        {pestaña === "historial" && (
          <Historial
            tareas={tareas}
            busqueda={busqueda}
            onLimpiarBusqueda={() => setBusqueda("")}
            onIrCola={() => setPestaña("cola")}
          />
        )}
      </div>
      {agregando && (
        <AgregarTareaModal clientes={clientesAgregar} equipo={equipo} onClose={() => setAgregando(false)} />
      )}
    </div>
  );
}
