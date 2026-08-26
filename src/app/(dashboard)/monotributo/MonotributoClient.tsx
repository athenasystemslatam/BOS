"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CheckCircle2, Circle, History } from "lucide-react";
import clsx from "clsx";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { AsignacionServicioModal } from "@/components/AsignacionServicioModal";
import { EquipoModuloPanel, EquipoModuloBoton } from "@/components/EquipoModuloPanel";
import { ClavesModuloPopover } from "@/components/ClavesModuloPopover";
import type { ClaveAcceso } from "@/types";
import { upsertMonotributoTarea } from "./actions";

const ACCENT_MONOTRIBUTO = { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" };

const RECATEGORIZACION_MESES = new Set([2, 8]);
const CATEGORIAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

type Tarea = {
  cliente_id: string;
  anio: number;
  mes: number;
  cuota_estado: "pendiente" | "pagado";
  cuota_fecha: string | null;
  recategorizacion: "no_corresponde" | "pendiente" | "realizada";
  categoria: string | null;
  deuda_monto: number | null;
  deuda_aviso: boolean;
  deuda_aviso_fecha: string | null;
  observaciones: string | null;
};

type Servicio = {
  cliente_id: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  clientes: { id: string; nombre: string; cuit: string; tipo_contribuyente: string; claves_acceso: ClaveAcceso[] | null };
};

function generarPeriodos(mesActual: number, anioActual: number) {
  const result = [];
  let m = mesActual;
  let a = anioActual;
  for (let i = 0; i < 14; i++) {
    result.push({ mes: m, anio: a });
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return result;
}

export function MonotributoClient({
  servicios,
  tareas: initialTareas,
  equipoMonotributo,
  mes,
  anio,
  isAdmin,
  puedeEditar,
  creadoPor,
}: {
  servicios: Servicio[];
  tareas: Tarea[];
  equipoMonotributo: { id: string; nombre: string }[];
  mes: number;
  anio: number;
  isAdmin: boolean;
  puedeEditar: boolean;
  creadoPor: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filterResp, setFilterResp] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [reasignando, setReasignando] = useState<Servicio | null>(null);
  const [mostrarEquipo, setMostrarEquipo] = useState(false);

  const esRecategorizacion = RECATEGORIZACION_MESES.has(mes);

  const [tareasMap, setTareasMap] = useState<Map<string, Tarea>>(() => {
    const m = new Map<string, Tarea>();
    for (const t of initialTareas) m.set(t.cliente_id, t);
    return m;
  });

  function getTarea(clienteId: string): Tarea {
    return (
      tareasMap.get(clienteId) ?? {
        cliente_id: clienteId,
        anio,
        mes,
        cuota_estado: "pendiente",
        cuota_fecha: null,
        recategorizacion: esRecategorizacion ? "pendiente" : "no_corresponde",
        categoria: null,
        deuda_monto: null,
        deuda_aviso: false,
        deuda_aviso_fecha: null,
        observaciones: null,
      }
    );
  }

  function patchTarea(clienteId: string, patch: Partial<Tarea>) {
    setTareasMap((prev) => {
      const existing = prev.get(clienteId) ?? {
        cliente_id: clienteId,
        anio,
        mes,
        cuota_estado: "pendiente" as const,
        cuota_fecha: null,
        recategorizacion: (esRecategorizacion ? "pendiente" : "no_corresponde") as Tarea["recategorizacion"],
        categoria: null,
        deuda_monto: null,
        deuda_aviso: false,
        deuda_aviso_fecha: null,
        observaciones: null,
      };
      const next = new Map(prev);
      next.set(clienteId, { ...existing, ...patch });
      return next;
    });
  }

  async function toggleCuota(clienteId: string) {
    const t = getTarea(clienteId);
    const nuevoEstado = t.cuota_estado === "pendiente" ? "pagado" : "pendiente";
    const nuevaFecha = nuevoEstado === "pagado" ? new Date().toISOString().slice(0, 10) : null;
    patchTarea(clienteId, { cuota_estado: nuevoEstado, cuota_fecha: nuevaFecha });
    startTransition(async () => {
      await upsertMonotributoTarea(clienteId, anio, mes, {
        cuota_estado: nuevoEstado,
        cuota_fecha: nuevaFecha,
      });
    });
  }

  function navigatePeriod(newMes: number, newAnio: number) {
    router.push(`/monotributo?mes=${newMes}&anio=${newAnio}`);
  }

  const periodos = useMemo(() => generarPeriodos(mes, anio), [mes, anio]);

  const responsables = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of servicios) {
      if (s.responsable_nombre && !seen.has(s.responsable_nombre)) {
        seen.add(s.responsable_nombre);
        result.push(s.responsable_nombre);
      }
    }
    return result.sort();
  }, [servicios]);

  // Cantidad de clientes a cargo de cada persona, para el panel de equipo
  const conteosResp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of servicios) {
      if (!s.responsable_nombre) continue;
      m[s.responsable_nombre] = (m[s.responsable_nombre] ?? 0) + 1;
    }
    return m;
  }, [servicios]);

  const filas = useMemo(() => {
    let list = servicios;
    if (filterResp) list = list.filter((s) => s.responsable_nombre === filterResp);
    if (soloPendientes) {
      list = list.filter((s) => {
        const t = getTarea(s.cliente_id);
        return (
          t.cuota_estado === "pendiente" ||
          (esRecategorizacion && t.recategorizacion === "pendiente")
        );
      });
    }
    return [...list].sort((a, b) =>
      (a.clientes?.nombre ?? "").localeCompare(b.clientes?.nombre ?? "")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, filterResp, soloPendientes, tareasMap]);

  const stats = useMemo(() => {
    const total = servicios.length;
    const pagadas = servicios.filter(
      (s) => getTarea(s.cliente_id).cuota_estado === "pagado"
    ).length;
    const recategorizadas = esRecategorizacion
      ? servicios.filter((s) => getTarea(s.cliente_id).recategorizacion === "realizada").length
      : 0;
    const conDeuda = servicios.filter(
      (s) => (getTarea(s.cliente_id).deuda_monto ?? 0) > 0
    ).length;
    return { total, pagadas, recategorizadas, conDeuda };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, tareasMap]);

  return (
    <>
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-amber-500" />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Monotributo</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">Seguimiento mensual</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
          <EquipoModuloBoton
            cantidad={equipoMonotributo.length}
            accent={ACCENT_MONOTRIBUTO}
            onClick={() => setMostrarEquipo(true)}
          />
          <div className="relative">
            <select
              value={`${mes}-${anio}`}
              onChange={(e) => {
                const [m, a] = e.target.value.split("-").map(Number);
                navigatePeriod(m, a);
              }}
              className="appearance-none text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              {periodos.map(({ mes: m, anio: a }) => (
                <option key={`${m}-${a}`} value={`${m}-${a}`}>
                  {MESES_NOMBRES[m]} {a}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          </div>
        </div>
      </div>

      {/* Stats + Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-gray-500">
            <span className="font-semibold text-emerald-600">{stats.pagadas}</span>
            <span className="text-gray-400"> / {stats.total} cuotas pagas</span>
          </span>
          {stats.conDeuda > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-semibold">
                {stats.conDeuda} con deuda
              </span>
            </>
          )}
          {esRecategorizacion && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500">
                <span className="font-semibold text-amber-600">{stats.recategorizadas}</span>
                <span className="text-gray-400"> / {stats.total} recategorizados</span>
              </span>
              <span className="text-[11px] bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                Mes de recategorización
              </span>
            </>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={filterResp}
              onChange={(e) => setFilterResp(e.target.value)}
              className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="">Todos los responsables</option>
              {responsables.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={() => setSoloPendientes((v) => !v)}
            className={clsx(
              "text-xs px-3 py-1.5 rounded-lg border font-medium transition-all",
              soloPendientes
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            )}
          >
            Solo pendientes
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="overflow-x-auto pb-2">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">
                Cliente
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-24">
                Categoría
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-32">
                Responsable
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-32">
                Cuota
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-36">
                Fecha pago
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-44">
                Recategorización
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-32">
                Deuda $
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-24">
                Aviso
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">
                Observaciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 text-sm py-16">
                  {soloPendientes || filterResp
                    ? "Sin resultados para el filtro aplicado"
                    : "No hay clientes con servicio de monotributo"}
                </td>
              </tr>
            )}
            {filas.map((s) => {
              const t = getTarea(s.cliente_id);
              const pagado = t.cuota_estado === "pagado";
              return (
                <tr key={s.cliente_id} className={clsx(
                  "transition-colors",
                  (t.deuda_monto ?? 0) > 0 ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-amber-50/20"
                )}>
                  {/* Cliente */}
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium text-gray-800 leading-tight">
                        {s.clientes?.nombre ?? "—"}
                      </p>
                      <ClavesModuloPopover claves={s.clientes?.claves_acceso} modulo="monotributo" />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 capitalize">
                      {s.clientes?.tipo_contribuyente ?? ""}
                    </p>
                  </td>

                  {/* Categoría */}
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={t.categoria ?? ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            patchTarea(s.cliente_id, { categoria: val });
                            startTransition(async () => {
                              await upsertMonotributoTarea(s.cliente_id, anio, mes, { categoria: val });
                            });
                          }}
                          className="appearance-none text-[13px] font-semibold text-gray-700 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 pr-5 cursor-pointer"
                        >
                          <option value="">—</option>
                          {CATEGORIAS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    ) : (
                      <span className="text-[13px] font-semibold text-gray-700">
                        {t.categoria ?? <span className="text-gray-300">—</span>}
                      </span>
                    )}
                  </td>

                  {/* Responsable */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-gray-600">
                        {s.responsable_nombre ?? <span className="text-gray-300">—</span>}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => setReasignando(s)}
                          title="Ver historial / reasignar"
                          className="text-gray-300 hover:text-amber-600 transition-colors"
                        >
                          <History size={13} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Cuota */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => puedeEditar && toggleCuota(s.cliente_id)}
                      disabled={!puedeEditar}
                      className={clsx(
                        "flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 py-1 transition-all",
                        pagado
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100",
                        !puedeEditar && "cursor-default opacity-70"
                      )}
                    >
                      {pagado
                        ? <CheckCircle2 size={13} strokeWidth={2} />
                        : <Circle size={13} strokeWidth={1.75} />
                      }
                      {pagado ? "Pagado" : "Pendiente"}
                    </button>
                  </td>

                  {/* Fecha pago */}
                  <td className="px-4 py-3">
                    {pagado && puedeEditar ? (
                      <input
                        type="date"
                        defaultValue={t.cuota_fecha ?? ""}
                        onBlur={(e) => {
                          const val = e.target.value || null;
                          patchTarea(s.cliente_id, { cuota_fecha: val });
                          startTransition(async () => {
                            await upsertMonotributoTarea(s.cliente_id, anio, mes, { cuota_fecha: val });
                          });
                        }}
                        className="text-[12px] text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 w-32"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-400">
                        {t.cuota_fecha
                          ? new Date(t.cuota_fecha + "T00:00:00").toLocaleDateString("es-AR")
                          : "—"}
                      </span>
                    )}
                  </td>

                  {/* Recategorización */}
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={t.recategorizacion}
                          onChange={(e) => {
                            const val = e.target.value as Tarea["recategorizacion"];
                            patchTarea(s.cliente_id, { recategorizacion: val });
                            startTransition(async () => {
                              await upsertMonotributoTarea(s.cliente_id, anio, mes, { recategorizacion: val });
                            });
                          }}
                          className={clsx(
                            "appearance-none text-[12px] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 pr-5 cursor-pointer",
                            t.recategorizacion === "realizada"
                              ? "text-emerald-600 font-medium"
                              : t.recategorizacion === "pendiente"
                              ? "text-amber-600"
                              : "text-gray-300"
                          )}
                        >
                          <option value="no_corresponde">No corresponde</option>
                          <option value="pendiente">Pendiente</option>
                          <option value="realizada">Realizada</option>
                        </select>
                        <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    ) : (
                      <span className={clsx(
                        "text-[12px]",
                        t.recategorizacion === "realizada" ? "text-emerald-600 font-medium" :
                        t.recategorizacion === "pendiente" ? "text-amber-600" :
                        "text-gray-300"
                      )}>
                        {t.recategorizacion === "realizada" ? "Realizada" :
                         t.recategorizacion === "pendiente" ? "Pendiente" :
                         "—"}
                      </span>
                    )}
                  </td>

                  {/* Deuda $ */}
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <input
                        type="number"
                        defaultValue={t.deuda_monto ?? ""}
                        placeholder="—"
                        min={0}
                        onBlur={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          patchTarea(s.cliente_id, { deuda_monto: val });
                          startTransition(async () => {
                            await upsertMonotributoTarea(s.cliente_id, anio, mes, { deuda_monto: val });
                          });
                        }}
                        className={clsx(
                          "text-[12px] border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-red-300 rounded px-1 py-0.5 w-28 placeholder:text-gray-300",
                          (t.deuda_monto ?? 0) > 0 ? "text-red-600 font-semibold" : "text-gray-400"
                        )}
                      />
                    ) : (
                      <span className={clsx(
                        "text-[12px]",
                        (t.deuda_monto ?? 0) > 0 ? "text-red-600 font-semibold" : "text-gray-300"
                      )}>
                        {t.deuda_monto ? "$ " + t.deuda_monto.toLocaleString("es-AR") : "—"}
                      </span>
                    )}
                  </td>

                  {/* Aviso deuda */}
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <button
                        onClick={() => {
                          const nuevoAviso = !t.deuda_aviso;
                          const nuevaFecha = nuevoAviso ? new Date().toISOString().slice(0, 10) : null;
                          patchTarea(s.cliente_id, { deuda_aviso: nuevoAviso, deuda_aviso_fecha: nuevaFecha });
                          startTransition(async () => {
                            await upsertMonotributoTarea(s.cliente_id, anio, mes, {
                              deuda_aviso: nuevoAviso,
                              deuda_aviso_fecha: nuevaFecha,
                            });
                          });
                        }}
                        className={clsx(
                          "text-[11px] font-medium rounded-full px-2 py-0.5 transition-all",
                          t.deuda_aviso
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : (t.deuda_monto ?? 0) > 0
                            ? "bg-red-50 text-red-500 hover:bg-red-100"
                            : "text-gray-300"
                        )}
                        title={t.deuda_aviso_fecha ? "Enviado " + new Date(t.deuda_aviso_fecha + "T00:00:00").toLocaleDateString("es-AR") : ""}
                      >
                        {t.deuda_aviso ? "Enviado" : (t.deuda_monto ?? 0) > 0 ? "Pendiente" : "—"}
                      </button>
                    ) : (
                      <span className={clsx(
                        "text-[11px]",
                        t.deuda_aviso ? "text-emerald-600 font-medium" : "text-gray-300"
                      )}>
                        {t.deuda_aviso ? "Enviado" : "—"}
                      </span>
                    )}
                  </td>

                  {/* Observaciones */}
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <input
                        type="text"
                        defaultValue={t.observaciones ?? ""}
                        placeholder="—"
                        onBlur={(e) => {
                          const val = e.target.value || null;
                          patchTarea(s.cliente_id, { observaciones: val });
                          startTransition(async () => {
                            await upsertMonotributoTarea(s.cliente_id, anio, mes, { observaciones: val });
                          });
                        }}
                        className="text-[12px] text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 w-full min-w-[120px] placeholder:text-gray-300"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-500">{t.observaciones ?? "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    {reasignando && (
      <AsignacionServicioModal
        clienteId={reasignando.cliente_id}
        clienteNombre={reasignando.clientes?.nombre ?? ""}
        servicio="monotributo"
        subtipo="general"
        equipo={equipoMonotributo}
        responsableActual={reasignando.responsable_nombre}
        creadoPor={creadoPor}
        onClose={() => setReasignando(null)}
      />
    )}
    {mostrarEquipo && (
      <EquipoModuloPanel
        moduloNombre="Monotributo"
        equipo={equipoMonotributo}
        conteos={conteosResp}
        filterResp={filterResp}
        onSelect={(nombre) => setFilterResp((prev) => (prev === nombre ? "" : nombre))}
        onClose={() => setMostrarEquipo(false)}
        accent={ACCENT_MONOTRIBUTO}
      />
    )}
    </>
  );
}
