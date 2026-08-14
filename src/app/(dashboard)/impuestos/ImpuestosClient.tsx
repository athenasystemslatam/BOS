"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CheckCircle2, Circle } from "lucide-react";
import clsx from "clsx";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { upsertImpuestoTarea } from "./actions";

type Subtipo = "iva" | "iibb" | "seh";

type Servicio = {
  cliente_id: string;
  subtipo: Subtipo;
  responsable_id: string | null;
  responsable_nombre: string | null;
  clientes: { id: string; nombre: string; cuit: string; tipo_contribuyente: string };
};

type Tarea = {
  cliente_id: string;
  subtipo: string;
  anio: number;
  mes: number;
  estado: "pendiente" | "presentado";
  fecha_presentacion: string | null;
  pago_estado: string;
  observaciones: string | null;
};

const TABS: { key: Subtipo; label: string }[] = [
  { key: "iva", label: "IVA" },
  { key: "iibb", label: "IIBB" },
  { key: "seh", label: "Seg. e Hig." },
];

const PAGO_OPTIONS: Record<Subtipo, { value: string; label: string }[]> = {
  iva: [
    { value: "pendiente", label: "Pendiente" },
    { value: "diferido", label: "Diferido" },
    { value: "pago", label: "Pago" },
    { value: "saldo_a_favor", label: "Saldo a favor" },
  ],
  iibb: [
    { value: "pendiente", label: "Pendiente" },
    { value: "pago", label: "Pago" },
    { value: "saldo_a_favor", label: "Saldo a favor" },
    { value: "enviado", label: "Enviado" },
  ],
  seh: [
    { value: "pendiente", label: "Pendiente" },
    { value: "pago", label: "Pago" },
    { value: "boleta", label: "Boleta" },
  ],
};

const PAGO_STYLE: Record<string, string> = {
  pendiente: "text-gray-400",
  pago: "text-emerald-600 font-medium",
  saldo_a_favor: "text-blue-600 font-medium",
  enviado: "text-amber-600 font-medium",
  diferido: "text-violet-600 font-medium",
  boleta: "text-teal-600 font-medium",
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

export function ImpuestosClient({
  servicios,
  tareas: initialTareas,
  mes,
  anio,
  puedeEditar,
}: {
  servicios: Servicio[];
  tareas: Tarea[];
  equipoImpuestos: { id: string; nombre: string }[];
  mes: number;
  anio: number;
  isAdmin: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<Subtipo>("iva");
  const [filterResp, setFilterResp] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const [tareasMap, setTareasMap] = useState<Map<string, Tarea>>(() => {
    const m = new Map<string, Tarea>();
    for (const t of initialTareas) m.set(`${t.cliente_id}:${t.subtipo}`, t);
    return m;
  });

  function getTarea(clienteId: string, subtipo: string): Tarea {
    return (
      tareasMap.get(`${clienteId}:${subtipo}`) ?? {
        cliente_id: clienteId,
        subtipo,
        anio,
        mes,
        estado: "pendiente",
        fecha_presentacion: null,
        pago_estado: "pendiente",
        observaciones: null,
      }
    );
  }

  function patchTarea(clienteId: string, subtipo: string, patch: Partial<Tarea>) {
    setTareasMap((prev) => {
      const key = `${clienteId}:${subtipo}`;
      const existing = prev.get(key) ?? getTarea(clienteId, subtipo);
      const next = new Map(prev);
      next.set(key, { ...existing, ...patch });
      return next;
    });
  }

  async function toggleEstado(clienteId: string, subtipo: Subtipo) {
    const t = getTarea(clienteId, subtipo);
    const nuevoEstado = t.estado === "pendiente" ? "presentado" : "pendiente";
    const nuevaFecha = nuevoEstado === "presentado"
      ? new Date().toISOString().slice(0, 10)
      : null;
    patchTarea(clienteId, subtipo, { estado: nuevoEstado, fecha_presentacion: nuevaFecha });
    startTransition(async () => {
      await upsertImpuestoTarea(clienteId, subtipo, anio, mes, {
        estado: nuevoEstado,
        fecha_presentacion: nuevaFecha,
      });
    });
  }

  async function setPago(clienteId: string, subtipo: Subtipo, valor: string) {
    patchTarea(clienteId, subtipo, { pago_estado: valor });
    startTransition(async () => {
      await upsertImpuestoTarea(clienteId, subtipo, anio, mes, { pago_estado: valor });
    });
  }

  function navigatePeriod(newMes: number, newAnio: number) {
    router.push(`/impuestos?mes=${newMes}&anio=${newAnio}`);
  }

  const periodos = useMemo(() => generarPeriodos(mes, anio), [mes, anio]);

  // Filter servicios for current tab
  const serviciosTab = useMemo(
    () => servicios.filter((s) => s.subtipo === activeTab),
    [servicios, activeTab]
  );

  // All responsables for current tab (for filter dropdown)
  const responsablesDeTab = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of serviciosTab) {
      if (s.responsable_nombre && !seen.has(s.responsable_nombre)) {
        seen.add(s.responsable_nombre);
        result.push(s.responsable_nombre);
      }
    }
    return result.sort();
  }, [serviciosTab]);

  // Apply filters
  const filas = useMemo(() => {
    let list = serviciosTab;
    if (filterResp) list = list.filter((s) => s.responsable_nombre === filterResp);
    if (soloPendientes) {
      list = list.filter((s) => {
        const t = getTarea(s.cliente_id, s.subtipo);
        return t.estado === "pendiente" || t.pago_estado === "pendiente";
      });
    }
    return [...list].sort((a, b) =>
      (a.clientes?.nombre ?? "").localeCompare(b.clientes?.nombre ?? "")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviciosTab, filterResp, soloPendientes, tareasMap]);

  // Stats
  const stats = useMemo(() => {
    const total = serviciosTab.length;
    const presentados = serviciosTab.filter(
      (s) => getTarea(s.cliente_id, s.subtipo).estado === "presentado"
    ).length;
    const pagados = serviciosTab.filter((s) => {
      const t = getTarea(s.cliente_id, s.subtipo);
      return t.pago_estado !== "pendiente";
    }).length;
    return { total, presentados, pagados };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviciosTab, tareasMap]);

  const pagoOptions = PAGO_OPTIONS[activeTab];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-blue-500" />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Impuestos</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">Seguimiento mensual</p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={`${mes}-${anio}`}
                onChange={(e) => {
                  const [m, a] = e.target.value.split("-").map(Number);
                  navigatePeriod(m, a);
                }}
                className="appearance-none text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-blue-400 cursor-pointer"
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

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setFilterResp(""); }}
              className={clsx(
                "px-5 py-3 text-[13px] font-medium border-b-2 transition-all",
                activeTab === key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {label}
              <span className={clsx(
                "ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full",
                activeTab === key ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
              )}>
                {servicios.filter((s) => s.subtipo === key).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats + Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 flex-wrap">
        {/* Stats */}
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-gray-500">
            <span className="font-semibold text-emerald-600">{stats.presentados}</span>
            <span className="text-gray-400"> / {stats.total} presentados</span>
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">
            <span className="font-semibold text-blue-600">{stats.pagados}</span>
            <span className="text-gray-400"> / {stats.total} con pago</span>
          </span>
        </div>

        <div className="flex-1" />

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={filterResp}
              onChange={(e) => setFilterResp(e.target.value)}
              className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-blue-400 cursor-pointer"
            >
              <option value="">Todos los responsables</option>
              {responsablesDeTab.map((r) => (
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
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            )}
          >
            Solo pendientes
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-6 py-3 w-72">
                Cliente
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-32">
                Responsable
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-40">
                Declaración
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-36">
                Fecha pres.
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">
                {activeTab === "seh" ? "Pago" : "VEP / Pago"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 text-sm py-16">
                  {soloPendientes || filterResp ? "Sin resultados para el filtro aplicado" : "No hay clientes en este módulo"}
                </td>
              </tr>
            )}
            {filas.map((s) => {
              const t = getTarea(s.cliente_id, s.subtipo);
              const presentado = t.estado === "presentado";
              return (
                <tr key={s.cliente_id} className="hover:bg-blue-50/30 transition-colors">
                  {/* Cliente */}
                  <td className="px-6 py-3">
                    <p className="text-[13px] font-medium text-gray-800 leading-tight">
                      {s.clientes?.nombre ?? "—"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 capitalize">
                      {s.clientes?.tipo_contribuyente ?? ""}
                    </p>
                  </td>

                  {/* Responsable */}
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-gray-600">
                      {s.responsable_nombre ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* Estado declaración */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => puedeEditar && toggleEstado(s.cliente_id, activeTab)}
                      disabled={!puedeEditar}
                      className={clsx(
                        "flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 py-1 transition-all",
                        presentado
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100",
                        !puedeEditar && "cursor-default opacity-70"
                      )}
                    >
                      {presentado
                        ? <CheckCircle2 size={13} strokeWidth={2} />
                        : <Circle size={13} strokeWidth={1.75} />
                      }
                      {presentado ? "Presentado" : "Pendiente"}
                    </button>
                  </td>

                  {/* Fecha presentación */}
                  <td className="px-4 py-3">
                    {presentado && puedeEditar ? (
                      <input
                        type="date"
                        defaultValue={t.fecha_presentacion ?? ""}
                        onBlur={(e) => {
                          const val = e.target.value || null;
                          patchTarea(s.cliente_id, activeTab, { fecha_presentacion: val });
                          startTransition(async () => {
                            await upsertImpuestoTarea(s.cliente_id, activeTab, anio, mes, {
                              fecha_presentacion: val,
                            });
                          });
                        }}
                        className="text-[12px] text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 w-32"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-400">
                        {t.fecha_presentacion
                          ? new Date(t.fecha_presentacion + "T00:00:00").toLocaleDateString("es-AR")
                          : "—"}
                      </span>
                    )}
                  </td>

                  {/* Pago / VEP */}
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={t.pago_estado}
                          onChange={(e) => setPago(s.cliente_id, activeTab, e.target.value)}
                          className={clsx(
                            "appearance-none text-[12px] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 pr-5 cursor-pointer",
                            PAGO_STYLE[t.pago_estado] ?? "text-gray-400"
                          )}
                        >
                          {pagoOptions.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    ) : (
                      <span className={clsx("text-[12px]", PAGO_STYLE[t.pago_estado] ?? "text-gray-400")}>
                        {pagoOptions.find((o) => o.value === t.pago_estado)?.label ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
