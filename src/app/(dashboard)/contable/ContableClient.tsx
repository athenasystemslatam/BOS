"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, Check, Minus } from "lucide-react";
import clsx from "clsx";
import { updateBalance } from "./actions";
import { NuevoBalanceModal } from "./NuevoBalanceModal";

type Balance = {
  id: string;
  cliente_id: string;
  anio_fiscal: number;
  fecha_cierre: string;
  responsable_id: string | null;
  responsable2_id: string | null;
  estado: string;
  avance: number;
  envio1: boolean; envio1_fecha: string | null;
  envio2: boolean; envio2_fecha: string | null;
  envio3: boolean; envio3_fecha: string | null;
  info_recibida: boolean;
  estado_eecc: string;
  f855_estado: string;
  f899_estado: string;
  f713_estado: string;
  f657_estado: string;
  igj_presentacion: string;
  igj_tasa: string;
  observaciones: string | null;
  clientes: { nombre: string; cuit: string } | null;
  responsable: { id: string; nombre: string } | null;
  responsable2: { id: string; nombre: string } | null;
};

const ANIOS = [2026, 2025, 2024, 2023];

const ESTADO_BALANCE: Record<string, { label: string; cls: string }> = {
  sin_asignar: { label: "Sin asignar", cls: "bg-gray-100 text-gray-500" },
  asignado:    { label: "Asignado",    cls: "bg-blue-100 text-blue-700" },
  en_proceso:  { label: "En proceso",  cls: "bg-amber-100 text-amber-700" },
  finalizado:  { label: "Finalizado",  cls: "bg-emerald-100 text-emerald-700" },
  frenado:     { label: "Frenado",     cls: "bg-red-100 text-red-600" },
};

const ESTADO_EECC: Record<string, { label: string; cls: string }> = {
  pendiente:       { label: "Pendiente",   cls: "text-gray-400" },
  en_proceso:      { label: "En proceso",  cls: "text-amber-600" },
  legalizado:      { label: "Legalizado",  cls: "text-emerald-600 font-medium" },
  presentado_arca: { label: "En ARCA",     cls: "text-blue-600 font-medium" },
};

// Returns ISO date string or null
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function FormBadge({ estado, options }: {
  estado: string;
  options: { value: string; label: string }[];
}) {
  if (estado === "no_corresponde") return <span className="text-gray-300 text-xs">N/A</span>;
  if (estado === "presentado" || estado === "enviada")
    return <Check size={14} className="text-emerald-500" strokeWidth={2.5} />;
  return <Minus size={14} className="text-gray-300" />;
  void options;
}

export function ContableClient({
  balances: initialBalances,
  equipoContable,
  clientesConServicio,
  anio,
  puedeEditar,
}: {
  balances: Balance[];
  equipoContable: { id: string; nombre: string }[];
  clientesConServicio: { id: string; nombre: string; cuit: string }[];
  anio: number;
  isAdmin: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [filterResp, setFilterResp] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

  const [balancesMap, setBalancesMap] = useState<Map<string, Balance>>(() => {
    const m = new Map<string, Balance>();
    for (const b of initialBalances) m.set(b.id, b);
    return m;
  });

  const balances = useMemo(() => Array.from(balancesMap.values()), [balancesMap]);

  function patch(id: string, updates: Partial<Balance>) {
    setBalancesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) next.set(id, { ...existing, ...updates });
      return next;
    });
  }

  function update(id: string, updates: Partial<Balance>) {
    patch(id, updates);
    startTransition(async () => {
      await updateBalance(id, updates as Record<string, unknown>);
    });
  }

  // IDs already in this year
  const yaEnAnio = useMemo(
    () => new Set(balances.map((b) => b.cliente_id)),
    [balances]
  );
  const clientesDisponibles = useMemo(
    () => clientesConServicio.filter((c) => !yaEnAnio.has(c.id)),
    [clientesConServicio, yaEnAnio]
  );

  // Responsables present in this year's data
  const responsablesPresentes = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const b of balances) {
      if (b.responsable?.nombre && !seen.has(b.responsable.nombre)) {
        seen.add(b.responsable.nombre);
        result.push(b.responsable.nombre);
      }
      if (b.responsable2?.nombre && !seen.has(b.responsable2.nombre)) {
        seen.add(b.responsable2.nombre);
        result.push(b.responsable2.nombre);
      }
    }
    return result.sort();
  }, [balances]);

  // Apply filters + sort by fecha_cierre
  const filas = useMemo(() => {
    let list = balances;
    if (filterResp) {
      list = list.filter(
        (b) =>
          b.responsable?.nombre === filterResp ||
          b.responsable2?.nombre === filterResp
      );
    }
    if (filterEstado) list = list.filter((b) => b.estado === filterEstado);
    return [...list].sort(
      (a, b) => a.fecha_cierre.localeCompare(b.fecha_cierre)
    );
  }, [balances, filterResp, filterEstado]);

  // Stats
  const stats = useMemo(() => ({
    total: balances.length,
    finalizados: balances.filter((b) => b.estado === "finalizado").length,
    enProceso: balances.filter((b) => b.estado === "en_proceso" || b.estado === "asignado").length,
    sinAsignar: balances.filter((b) => b.estado === "sin_asignar").length,
  }), [balances]);

  const FORM_OPTIONS_F657 = [
    { value: "pendiente", label: "Pendiente" },
    { value: "presentado", label: "Presentado" },
    { value: "no_corresponde", label: "N/A" },
  ];
  const FORM_OPTIONS_IGJ = [
    { value: "pendiente", label: "Pendiente" },
    { value: "presentado", label: "Presentado" },
    { value: "no_corresponde", label: "N/A" },
  ];
  const FORM_OPTIONS_IGJ_TASA = [
    { value: "pendiente", label: "Pendiente" },
    { value: "enviada", label: "Enviada" },
    { value: "no_corresponde", label: "N/A" },
  ];
  const FORM_OPTIONS_BASE = [
    { value: "pendiente", label: "Pendiente" },
    { value: "presentado", label: "Presentado" },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-emerald-500" />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Contable — Balances</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">Seguimiento anual por empresa</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Year selector */}
            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
              {ANIOS.map((a) => (
                <button
                  key={a}
                  onClick={() => router.push(`/contable?anio=${a}`)}
                  className={clsx(
                    "px-3 py-1.5 text-[13px] font-medium rounded-md transition-all",
                    a === anio
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>

            {puedeEditar && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Plus size={14} strokeWidth={2.5} />
                Agregar balance
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats + Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-gray-500">
            <span className="font-semibold text-emerald-600">{stats.finalizados}</span>
            <span className="text-gray-400"> finalizados</span>
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">
            <span className="font-semibold text-amber-600">{stats.enProceso}</span>
            <span className="text-gray-400"> en proceso</span>
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">
            <span className="font-semibold text-gray-500">{stats.sinAsignar}</span>
            <span className="text-gray-400"> sin asignar</span>
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">{stats.total} total</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={filterResp}
              onChange={(e) => setFilterResp(e.target.value)}
              className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-emerald-400 cursor-pointer"
            >
              <option value="">Todos los responsables</option>
              {responsablesPresentes.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-emerald-400 cursor-pointer"
            >
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_BALANCE).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* Group 1: cliente + fechas */}
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-6 py-3 w-56">Cliente</th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">Cierre</th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">VTO Bal.</th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">VTO 855</th>
              {/* Group 2: estado */}
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-36">Estado</th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-8">%</th>
              {/* Group 3: responsables */}
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">Responsable</th>
              {/* Group 4: info */}
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">E1</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">E2</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">E3</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">Rec.</th>
              {/* Group 5: formularios */}
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">EECC</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">855</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">F899</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">F713</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">F657</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">IGJ</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">Tasa</th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">Obs.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={19} className="text-center text-gray-400 text-sm py-16">
                  {filterResp || filterEstado
                    ? "Sin resultados para el filtro aplicado"
                    : `No hay balances cargados para ${anio}`}
                </td>
              </tr>
            )}
            {filas.map((b) => {
              const vtoBalance = addDays(b.fecha_cierre, 135);
              const vto855 = addDays(b.fecha_cierre, 160);
              const estadoInfo = ESTADO_BALANCE[b.estado] ?? ESTADO_BALANCE.sin_asignar;
              const eeccInfo = ESTADO_EECC[b.estado_eecc] ?? ESTADO_EECC.pendiente;

              return (
                <tr key={b.id} className="hover:bg-emerald-50/30 transition-colors group">
                  {/* Cliente */}
                  <td className="px-6 py-2.5">
                    <p className="text-[13px] font-medium text-gray-800 truncate max-w-[200px]">
                      {b.clientes?.nombre ?? "—"}
                    </p>
                  </td>

                  {/* Cierre */}
                  <td className="px-3 py-2.5">
                    <span className="text-[12px] text-gray-600">{fmt(b.fecha_cierre)}</span>
                  </td>

                  {/* VTO Balance */}
                  <td className="px-3 py-2.5">
                    <span className="text-[12px] text-gray-500">{fmt(vtoBalance)}</span>
                  </td>

                  {/* VTO 855 */}
                  <td className="px-3 py-2.5">
                    <span className="text-[12px] text-gray-500">{fmt(vto855)}</span>
                  </td>

                  {/* Estado */}
                  <td className="px-3 py-2.5">
                    {puedeEditar ? (
                      <div className="relative">
                        <select
                          value={b.estado}
                          onChange={(e) => update(b.id, { estado: e.target.value })}
                          className={clsx(
                            "appearance-none text-[11px] font-medium rounded-full px-2.5 py-1 pr-5 border-0 focus:outline-none focus:ring-1 focus:ring-emerald-300 cursor-pointer",
                            estadoInfo.cls
                          )}
                        >
                          {Object.entries(ESTADO_BALANCE).map(([v, { label }]) => (
                            <option key={v} value={v}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                      </div>
                    ) : (
                      <span className={clsx("text-[11px] font-medium rounded-full px-2.5 py-1", estadoInfo.cls)}>
                        {estadoInfo.label}
                      </span>
                    )}
                  </td>

                  {/* Avance */}
                  <td className="px-3 py-2.5">
                    {puedeEditar ? (
                      <input
                        type="number"
                        min={0} max={100}
                        defaultValue={b.avance}
                        onBlur={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          update(b.id, { avance: val });
                        }}
                        className="w-10 text-[12px] text-center text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-300 rounded"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-500">{b.avance}%</span>
                    )}
                  </td>

                  {/* Responsables */}
                  <td className="px-3 py-2.5">
                    {puedeEditar ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="relative">
                          <select
                            value={b.responsable_id ?? ""}
                            onChange={(e) => update(b.id, { responsable_id: e.target.value || null })}
                            className="appearance-none text-[12px] text-gray-700 bg-transparent border-0 focus:outline-none pr-4 cursor-pointer"
                          >
                            <option value="">—</option>
                            {equipoContable.map((e) => (
                              <option key={e.id} value={e.id}>{e.nombre}</option>
                            ))}
                          </select>
                          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        {(b.responsable2_id || b.responsable2) && (
                          <div className="relative">
                            <select
                              value={b.responsable2_id ?? ""}
                              onChange={(e) => update(b.id, { responsable2_id: e.target.value || null })}
                              className="appearance-none text-[11px] text-gray-400 bg-transparent border-0 focus:outline-none pr-4 cursor-pointer"
                            >
                              <option value="">—</option>
                              {equipoContable.map((e) => (
                                <option key={e.id} value={e.id}>{e.nombre}</option>
                              ))}
                            </select>
                            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                        {!b.responsable2_id && !b.responsable2 && (
                          <button
                            onClick={() => patch(b.id, { responsable2_id: "" })}
                            className="text-[11px] text-gray-300 hover:text-gray-500 text-left hidden group-hover:block"
                          >
                            + resp. 2
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[12px] text-gray-700">
                        {b.responsable?.nombre ?? "—"}
                        {b.responsable2?.nombre && (
                          <span className="text-gray-400 text-[11px]"> + {b.responsable2.nombre}</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Envío 1 */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={b.envio1}
                      disabled={!puedeEditar}
                      onChange={(e) => update(b.id, { envio1: e.target.checked })}
                      className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                    />
                  </td>

                  {/* Envío 2 */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={b.envio2}
                      disabled={!puedeEditar}
                      onChange={(e) => update(b.id, { envio2: e.target.checked })}
                      className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                    />
                  </td>

                  {/* Envío 3 */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={b.envio3}
                      disabled={!puedeEditar}
                      onChange={(e) => update(b.id, { envio3: e.target.checked })}
                      className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                    />
                  </td>

                  {/* Recibido */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={b.info_recibida}
                      disabled={!puedeEditar}
                      onChange={(e) => update(b.id, { info_recibida: e.target.checked })}
                      className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                    />
                  </td>

                  {/* EECC / Legalización */}
                  <td className="px-3 py-2.5 text-center">
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={b.estado_eecc}
                          onChange={(e) => update(b.id, { estado_eecc: e.target.value })}
                          className={clsx("appearance-none text-[11px] bg-transparent border-0 focus:outline-none pr-3 cursor-pointer", eeccInfo.cls)}
                        >
                          {Object.entries(ESTADO_EECC).map(([v, { label }]) => (
                            <option key={v} value={v}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={9} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    ) : (
                      <span className={clsx("text-[11px]", eeccInfo.cls)}>{eeccInfo.label}</span>
                    )}
                  </td>

                  {/* 855 */}
                  <FormCell estado={b.f855_estado} field="f855_estado" balanceId={b.id}
                    options={FORM_OPTIONS_BASE} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* F899 */}
                  <FormCell estado={b.f899_estado} field="f899_estado" balanceId={b.id}
                    options={FORM_OPTIONS_BASE} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* F713 */}
                  <FormCell estado={b.f713_estado} field="f713_estado" balanceId={b.id}
                    options={FORM_OPTIONS_BASE} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* F657 */}
                  <FormCell estado={b.f657_estado} field="f657_estado" balanceId={b.id}
                    options={FORM_OPTIONS_F657} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* IGJ Presentación */}
                  <FormCell estado={b.igj_presentacion} field="igj_presentacion" balanceId={b.id}
                    options={FORM_OPTIONS_IGJ} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* IGJ Tasa */}
                  <FormCell estado={b.igj_tasa} field="igj_tasa" balanceId={b.id}
                    options={FORM_OPTIONS_IGJ_TASA} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* Observaciones */}
                  <td className="px-3 py-2.5 max-w-[180px]">
                    {puedeEditar ? (
                      <input
                        type="text"
                        defaultValue={b.observaciones ?? ""}
                        placeholder="—"
                        onBlur={(e) => update(b.id, { observaciones: e.target.value || null })}
                        className="w-full text-[12px] text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-300 rounded px-1 placeholder:text-gray-200 truncate"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-500 truncate block">{b.observaciones ?? "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <NuevoBalanceModal
          anio={anio}
          clientesDisponibles={clientesDisponibles}
          equipoContable={equipoContable}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// Extracted to avoid duplication
function FormCell({
  estado,
  field,
  balanceId,
  options,
  puedeEditar,
  onUpdate,
}: {
  estado: string;
  field: string;
  balanceId: string;
  options: { value: string; label: string }[];
  puedeEditar: boolean;
  onUpdate: (id: string, updates: Partial<Balance>) => void;
}) {
  if (!puedeEditar) {
    return (
      <td className="px-3 py-2.5 text-center">
        <FormBadge estado={estado} options={options} />
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5 text-center">
      <div className="relative inline-flex items-center justify-center">
        <select
          value={estado}
          onChange={(e) => onUpdate(balanceId, { [field]: e.target.value } as Partial<Balance>)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        >
          {options.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <FormBadge estado={estado} options={options} />
      </div>
    </td>
  );
}
