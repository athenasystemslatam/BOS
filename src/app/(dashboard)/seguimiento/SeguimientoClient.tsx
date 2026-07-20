"use client";

import { useState, useMemo, useRef, useTransition } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Cloud,
  Check,
  ChevronLeft,
  ChevronRight,
  Building2,
  ShieldCheck,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Search,
  KeyRound,
  Copy,
  X,
  Bell,
} from "lucide-react";
import { Cliente, ClaveAcceso, Liquidadora, Periodo, Tarea } from "@/types";
import {
  toggleManual,
  updateLegajos,
  updateObservaciones,
  updateRecordatorio,
  fetchPeriodo,
  fetchTareas,
  fetchRecordatoriosPrevios,
  syncDrive,
  CampoManual,
  SyncDriveResult,
} from "./actions";
import { getVencimientosGrupos } from "@/lib/vencimientos";

type ClienteConLiq = Cliente & { liquidadora: { id: string; nombre: string } };

interface Props {
  clientes: ClienteConLiq[];
  tareas: Tarea[];
  periodos: Periodo[];
  periodo: Periodo | null;
  liquidadoras: Pick<Liquidadora, "id" | "nombre">[];
  isAdmin: boolean;
  recordatoriosPrevios: Record<string, string>;
}

type TareaState = {
  rec_q1_manual: boolean;
  rec_q1_drive: boolean;
  recibos_manual: boolean;
  recibos_drive: boolean;
  f931_manual: boolean;
  f931_drive: boolean;
  bol_sind_manual: boolean;
  bol_sind_drive: boolean;
  rub_lsd_manual: boolean;
  rub_lsd_drive: boolean;
  sac_manual: boolean;
  sac_drive: boolean;
  legajos_cantidad: number;
  observaciones: string;
  recordatorio: string;
};

const DEFAULTS: TareaState = {
  rec_q1_manual: false, rec_q1_drive: false,
  recibos_manual: false, recibos_drive: false,
  f931_manual: false, f931_drive: false,
  bol_sind_manual: false, bol_sind_drive: false,
  rub_lsd_manual: false, rub_lsd_drive: false,
  sac_manual: false, sac_drive: false,
  legajos_cantidad: 0,
  observaciones: "",
  recordatorio: "",
};

type CheckState = "empty" | "warning" | "drive" | "confirmed";

function getCheckState(manual: boolean, drive: boolean): CheckState {
  if (manual && drive) return "confirmed";
  if (manual) return "warning";
  if (drive) return "drive";
  return "empty";
}

// ─── CheckboxCell ─────────────────────────────────────────────────────────────

function CheckboxCell({
  manual,
  drive,
  onToggle,
}: {
  manual: boolean;
  drive: boolean;
  onToggle: () => void;
}) {
  const state = getCheckState(manual, drive);
  const labels: Record<CheckState, string> = {
    empty: "Sin marcar — clic para marcar",
    warning: "Marcado (Drive no confirmó el archivo)",
    drive: "Drive detectó el archivo — clic para confirmar",
    confirmed: "Completado y confirmado por Drive",
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      title={labels[state]}
      className={clsx(
        "w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all mx-auto",
        state === "empty" &&
          "border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50",
        state === "warning" &&
          "bg-amber-50 border-amber-300 text-amber-600 hover:bg-amber-100",
        state === "drive" &&
          "bg-blue-50 border-blue-300 text-blue-500 hover:bg-blue-100",
        state === "confirmed" &&
          "bg-green-50 border-green-400 text-success hover:bg-green-100"
      )}
    >
      {state === "warning" && <AlertTriangle size={13} strokeWidth={2.5} />}
      {state === "drive" && <Cloud size={13} strokeWidth={2.5} />}
      {state === "confirmed" && <Check size={13} strokeWidth={3} />}
    </button>
  );
}

function DashCell() {
  return <span className="text-gray-200 text-base font-light select-none">—</span>;
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar"
      className="ml-1.5 text-gray-300 hover:text-bordo transition-colors"
    >
      {copied ? <Check size={12} strokeWidth={3} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

// ─── ClavesModal ──────────────────────────────────────────────────────────────

function ClavesModal({
  cliente,
  onClose,
}: {
  cliente: ClienteConLiq;
  onClose: () => void;
}) {
  const claves: ClaveAcceso[] = cliente.claves_acceso ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[13px] font-semibold text-gray-800">{cliente.nombre}</p>
            <p className="text-[10px] text-gray-400 font-mono">{cliente.cuit}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* CUIL ARCA */}
        {cliente.cuil_arca && (
          <div className="mb-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              CUIL ARCA
            </p>
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2 font-mono text-[13px] text-gray-700">
              {cliente.cuil_arca}
              <CopyButton value={cliente.cuil_arca} />
            </div>
          </div>
        )}

        {/* Claves de acceso */}
        {claves.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Claves de acceso
            </p>
            <div className="space-y-2">
              {claves.map((clave, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5 text-[12px]">
                  <p className="font-semibold text-gray-600 mb-1.5">{clave.sistema}</p>
                  <div className="space-y-1">
                    {clave.usuario && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-[11px]">Usuario</span>
                        <div className="flex items-center font-mono text-gray-700">
                          {clave.usuario}
                          <CopyButton value={clave.usuario} />
                        </div>
                      </div>
                    )}
                    {clave.contrasena && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-[11px]">Contraseña</span>
                        <div className="flex items-center font-mono text-gray-700">
                          {clave.contrasena}
                          <CopyButton value={clave.contrasena} />
                        </div>
                      </div>
                    )}
                    {clave.url && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-[11px]">URL</span>
                        <div className="flex items-center font-mono text-[11px] text-gray-500">
                          <span className="truncate max-w-[140px]">{clave.url}</span>
                          <CopyButton value={clave.url} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          !cliente.cuil_arca && (
            <p className="text-[12px] text-gray-400 text-center py-4">
              Sin CUIL ARCA ni claves registradas para esta empresa.
            </p>
          )
        )}

        {!cliente.cuil_arca && claves.length === 0 && null}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SeguimientoClient({
  clientes,
  tareas: initialTareas,
  periodo: initialPeriodo,
  liquidadoras,
  isAdmin,
  recordatoriosPrevios: initialRecordatoriosPrevios,
}: Props) {
  // Period state — managed client-side to avoid URL params (which make the route dynamic)
  const [currentPeriodo, setCurrentPeriodo] = useState<Periodo | null>(initialPeriodo);
  const [currentTareas, setCurrentTareas] = useState<Tarea[]>(initialTareas);
  const [isPending, startTransition] = useTransition();

  // Optimistic overrides for instant checkbox feedback
  const [overrides, setOverrides] = useState<Map<string, Partial<TareaState>>>(new Map());

  // Admin filter
  const [filtroLiq, setFiltroLiq] = useState<string>("todas");

  // Búsqueda por nombre
  const [searchQuery, setSearchQuery] = useState("");

  // Modal de claves
  const [clienteClaves, setClienteClaves] = useState<ClienteConLiq | null>(null);

  // Recordatorios del período anterior
  const [recordatoriosPrevios, setRecordatoriosPrevios] = useState<Record<string, string>>(
    initialRecordatoriosPrevios
  );

  // Debounce timers
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Drive sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncDriveResult | null>(null);

  async function handleSync() {
    if (!currentPeriodo || isSyncing) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncDrive(currentPeriodo.id, currentPeriodo.mes, currentPeriodo.anio);
      setSyncResult(result);
      if (!result.error) {
        const newTareas = await fetchTareas(currentPeriodo.id);
        setCurrentTareas(newTareas);
        setOverrides(new Map());
      }
    } finally {
      setIsSyncing(false);
    }
  }

  // Build tareas map from current data
  const tareasMap = useMemo(() => {
    const m = new Map<string, TareaState>();
    for (const t of currentTareas) {
      m.set(t.cliente_id, {
        rec_q1_manual: t.rec_q1_manual,
        rec_q1_drive: t.rec_q1_drive,
        recibos_manual: t.recibos_manual,
        recibos_drive: t.recibos_drive,
        f931_manual: t.f931_manual,
        f931_drive: t.f931_drive,
        bol_sind_manual: t.bol_sind_manual,
        bol_sind_drive: t.bol_sind_drive,
        rub_lsd_manual: t.rub_lsd_manual,
        rub_lsd_drive: t.rub_lsd_drive,
        sac_manual: t.sac_manual,
        sac_drive: t.sac_drive,
        legajos_cantidad: t.legajos_cantidad,
        observaciones: t.observaciones ?? "",
        recordatorio: t.recordatorio ?? "",
      });
    }
    return m;
  }, [currentTareas]);

  function getEffective(clienteId: string): TareaState {
    const server = tareasMap.get(clienteId) ?? DEFAULTS;
    const override = overrides.get(clienteId) ?? {};
    return { ...server, ...override };
  }

  const clientesFiltrados = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return clientes.filter((c) => {
      if (filtroLiq !== "todas" && c.liquidadora?.id !== filtroLiq) return false;
      if (q && !c.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, filtroLiq, searchQuery]);

  const tieneQuincenales = useMemo(
    () => clientes.some((c) => c.es_quincenal),
    [clientes]
  );
  const esMesSAC = currentPeriodo
    ? currentPeriodo.mes === 6 || currentPeriodo.mes === 12
    : false;

  // Vencimientos del mes siguiente al período activo
  const vencimientosProximos = useMemo(() => {
    if (!currentPeriodo) return null;
    const mesNext = currentPeriodo.mes === 12 ? 1 : currentPeriodo.mes + 1;
    const anioNext = currentPeriodo.mes === 12 ? currentPeriodo.anio + 1 : currentPeriodo.anio;
    const grupos = getVencimientosGrupos(anioNext, currentPeriodo.mes);
    const hoy = new Date();
    const proximosDias = grupos
      .map((g) => {
        const diff = Math.ceil((g.fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        return { label: g.label, fecha: g.fecha, dias: diff };
      })
      .filter((g) => g.dias <= 14 && g.dias >= 0);
    return proximosDias.length > 0 ? { grupos: proximosDias, mesNext, anioNext } : null;
  }, [currentPeriodo]);

  // ── Period navigation (client-side, no URL change) ────────────────────────

  function navPeriodo(delta: -1 | 1) {
    if (!currentPeriodo || isPending) return;
    let newMes = currentPeriodo.mes + delta;
    let newAnio = currentPeriodo.anio;
    if (newMes < 1) { newMes = 12; newAnio--; }
    if (newMes > 12) { newMes = 1; newAnio++; }

    startTransition(async () => {
      const newPeriodo = await fetchPeriodo(newAnio, newMes);
      if (newPeriodo) {
        const [newTareas, newRecordatorios] = await Promise.all([
          fetchTareas(newPeriodo.id),
          fetchRecordatoriosPrevios(newPeriodo.id),
        ]);
        setCurrentPeriodo(newPeriodo);
        setCurrentTareas(newTareas);
        setRecordatoriosPrevios(newRecordatorios);
        setOverrides(new Map());
      }
    });
  }

  // ── Checkbox toggle (optimistic) ──────────────────────────────────────────

  function handleToggle(clienteId: string, campo: CampoManual) {
    if (!currentPeriodo) return;
    const current = getEffective(clienteId);
    const newValue = !current[`${campo}_manual`];

    setOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(clienteId) ?? {};
      next.set(clienteId, { ...existing, [`${campo}_manual`]: newValue });
      return next;
    });

    toggleManual(clienteId, currentPeriodo.id, campo, newValue);
  }

  // ── Legajos (debounced) ───────────────────────────────────────────────────

  function handleLegajos(clienteId: string, valor: string) {
    if (!currentPeriodo) return;
    const num = Math.max(0, parseInt(valor) || 0);
    setOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(clienteId) ?? {};
      next.set(clienteId, { ...existing, legajos_cantidad: num });
      return next;
    });
    const key = `${clienteId}-legajos`;
    clearTimeout(debounceTimers.current.get(key));
    debounceTimers.current.set(
      key,
      setTimeout(() => updateLegajos(clienteId, currentPeriodo.id, num), 700)
    );
  }

  // ── Observaciones (debounced) ─────────────────────────────────────────────

  function handleObservaciones(clienteId: string, valor: string) {
    if (!currentPeriodo) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(clienteId) ?? {};
      next.set(clienteId, { ...existing, observaciones: valor });
      return next;
    });
    const key = `${clienteId}-obs`;
    clearTimeout(debounceTimers.current.get(key));
    debounceTimers.current.set(
      key,
      setTimeout(
        () => updateObservaciones(clienteId, currentPeriodo.id, valor),
        700
      )
    );
  }

  // ── Recordatorio (debounced) ──────────────────────────────────────────────

  function handleRecordatorio(clienteId: string, valor: string) {
    if (!currentPeriodo) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(clienteId) ?? {};
      next.set(clienteId, { ...existing, recordatorio: valor });
      return next;
    });
    const key = `${clienteId}-rec`;
    clearTimeout(debounceTimers.current.get(key));
    debounceTimers.current.set(
      key,
      setTimeout(
        () => updateRecordatorio(clienteId, currentPeriodo.id, valor),
        700
      )
    );
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  const { totalDone } = useMemo(() => {
    let done = 0;
    for (const c of clientesFiltrados) {
      const t = getEffective(c.id);
      const checks = [
        t.recibos_manual || t.recibos_drive,
        t.f931_manual || t.f931_drive,
        c.tiene_sindicato ? t.bol_sind_manual || t.bol_sind_drive : true,
        c.tiene_rubrica_lsd ? t.rub_lsd_manual || t.rub_lsd_drive : true,
        esMesSAC ? t.sac_manual || t.sac_drive : true,
      ];
      if (checks.every(Boolean)) done++;
    }
    return { totalDone: done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesFiltrados, overrides, tareasMap, esMesSAC]);

  const totalPending = clientesFiltrados.length - totalDone;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-[1600px]">
      {clienteClaves && (
        <ClavesModal cliente={clienteClaves} onClose={() => setClienteClaves(null)} />
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">
            Liquidaciones mensuales
          </p>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight flex items-center gap-3">
            Seguimiento
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-bordo/10 text-bordo px-2 py-0.5 rounded-full">
                <ShieldCheck size={11} />
                Vista admin
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {clientesFiltrados.length} empresas ·{" "}
            <span className="text-success font-medium">{totalDone} completas</span>
            {totalPending > 0 && (
              <>
                {" "}·{" "}
                <span className="text-warning font-medium">
                  {totalPending} pendientes
                </span>
              </>
            )}
          </p>
        </div>

        {/* Right side: sync + period nav */}
        <div className="flex items-center gap-3">
          {/* Sincronizar Drive */}
          <button
            onClick={handleSync}
            disabled={isSyncing || isPending || !currentPeriodo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 transition-colors"
          >
            {isSyncing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {isSyncing ? "Sincronizando…" : "Sincronizar Drive"}
          </button>

          {/* Period navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navPeriodo(-1)}
              disabled={isPending}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors text-gray-400 hover:text-gray-700"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 min-w-[130px] text-center flex items-center justify-center gap-2">
              {isPending && <Loader2 size={12} className="animate-spin text-gray-400" />}
              {currentPeriodo?.nombre_mes ?? "Sin período"}
            </div>
            <button
              onClick={() => navPeriodo(1)}
              disabled={isPending}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors text-gray-400 hover:text-gray-700"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div
          className={clsx(
            "mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-medium border",
            syncResult.error
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-green-50 border-green-200 text-green-700"
          )}
        >
          {syncResult.error ? (
            <>
              <XCircle size={14} />
              Error: {syncResult.error}
            </>
          ) : (
            <>
              <CheckCircle2 size={14} />
              Drive sincronizado — {syncResult.archivosDetectados} archivos en{" "}
              {syncResult.clientesConArchivos} empresas
              {Object.keys(syncResult.errorCodes).length > 0 && (
                <span className="ml-2 text-green-500 font-normal">
                  ({Object.entries(syncResult.errorCodes)
                    .map(([k, v]) => `${v} ${k}`)
                    .join(", ")})
                </span>
              )}
            </>
          )}
          <button
            onClick={() => setSyncResult(null)}
            className="ml-auto text-current opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Alerta vencimientos próximos */}
      {vencimientosProximos && (
        <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          <Bell size={14} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <span className="font-semibold">Próximos vencimientos F.931 — </span>
            {vencimientosProximos.grupos.map((g, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <span className="font-medium">CUITs {g.label}</span>{" "}
                {g.fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                <span className="text-amber-600"> ({g.dias === 0 ? "hoy" : `en ${g.dias}d`})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Admin filter by liquidadora */}
      {liquidadoras.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mr-1">
            Ver:
          </span>
          <button
            onClick={() => setFiltroLiq("todas")}
            className={clsx(
              "px-3 py-1 rounded-full text-[12px] font-medium border transition-all",
              filtroLiq === "todas"
                ? "bg-bordo text-white border-bordo"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
            )}
          >
            Todas ({clientes.length})
          </button>
          {liquidadoras.map((liq) => {
            const count = clientes.filter(
              (c) => c.liquidadora?.id === liq.id
            ).length;
            return (
              <button
                key={liq.id}
                onClick={() => setFiltroLiq(liq.id)}
                className={clsx(
                  "px-3 py-1 rounded-full text-[12px] font-medium border transition-all",
                  filtroLiq === liq.id
                    ? "bg-bordo text-white border-bordo"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                {liq.nombre} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Búsqueda por empresa */}
      <div className="relative mb-4 max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar empresa..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-bordo focus:border-bordo placeholder:text-gray-300 bg-white"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4 text-[11px] text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md border-2 border-dashed border-gray-200" />
          Pendiente
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md border-2 bg-amber-50 border-amber-300 flex items-center justify-center">
            <AlertTriangle size={10} className="text-amber-500" />
          </div>
          Marcado (Drive no confirmó)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md border-2 bg-blue-50 border-blue-300 flex items-center justify-center">
            <Cloud size={10} className="text-blue-400" />
          </div>
          Drive detectó
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md border-2 bg-green-50 border-green-400 flex items-center justify-center">
            <Check size={10} strokeWidth={3} className="text-success" />
          </div>
          Confirmado
        </div>
      </div>

      {/* No period */}
      {!currentPeriodo && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-gray-400 text-sm">
          No se encontró el período.
        </div>
      )}

      {/* No clients */}
      {currentPeriodo && clientesFiltrados.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
          <Building2 size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No hay empresas para mostrar.</p>
        </div>
      )}

      {/* Table */}
      {currentPeriodo && clientesFiltrados.length > 0 && (
        <div
          className={clsx(
            "bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-opacity",
            isPending && "opacity-60"
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 720 }}>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider min-w-[210px]">
                    Empresa
                  </th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider min-w-[110px]">
                    Liquidadora
                  </th>
                  {tieneQuincenales && (
                    <th className="px-2 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-[72px]">
                      Rec.Q1
                    </th>
                  )}
                  {(
                    [
                      { key: "recibos" as CampoManual, label: "Recibos" },
                      { key: "f931" as CampoManual, label: "F.931" },
                      { key: "bol_sind" as CampoManual, label: "Bol.Sind" },
                      { key: "rub_lsd" as CampoManual, label: "Rúb.LSD" },
                    ]
                  ).map(({ key, label }) => (
                    <th
                      key={key}
                      className="px-2 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-[72px]"
                    >
                      {label}
                    </th>
                  ))}
                  {esMesSAC && (
                    <th className="px-2 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-[72px]">
                      SAC
                    </th>
                  )}
                  <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-[76px]">
                    Legajos
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider min-w-[160px]">
                    Observaciones
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-amber-400 uppercase tracking-wider min-w-[160px]">
                    Nota → Sig. mes
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {clientesFiltrados.map((cliente) => {
                  const t = getEffective(cliente.id);
                  const checks = [
                    t.recibos_manual || t.recibos_drive,
                    t.f931_manual || t.f931_drive,
                    cliente.tiene_sindicato
                      ? t.bol_sind_manual || t.bol_sind_drive
                      : true,
                    cliente.tiene_rubrica_lsd
                      ? t.rub_lsd_manual || t.rub_lsd_drive
                      : true,
                    esMesSAC ? t.sac_manual || t.sac_drive : true,
                  ];
                  const isComplete = checks.every(Boolean);

                  return (
                    <tr
                      key={cliente.id}
                      className={clsx(
                        "transition-colors",
                        isComplete
                          ? "bg-green-50/30 hover:bg-green-50/50"
                          : "hover:bg-gray-50/60"
                      )}
                    >
                      {/* Empresa */}
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={clsx(
                              "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0",
                              isComplete
                                ? "bg-green-100 text-success"
                                : "bg-gray-100 text-gray-500"
                            )}
                          >
                            {cliente.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-gray-800 truncate max-w-[150px]">
                              {cliente.nombre}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono">
                              {cliente.cuit}
                            </p>
                            {recordatoriosPrevios[cliente.id] && (
                              <p
                                className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 max-w-[150px] truncate"
                                title={`Nota del mes anterior: ${recordatoriosPrevios[cliente.id]}`}
                              >
                                ↩ {recordatoriosPrevios[cliente.id]}
                              </p>
                            )}
                          </div>
                          {(cliente.cuil_arca || (cliente.claves_acceso && cliente.claves_acceso.length > 0)) && (
                            <button
                              type="button"
                              title="Ver CUIL ARCA y claves"
                              onClick={() => setClienteClaves(cliente)}
                              className="shrink-0 text-gray-300 hover:text-bordo transition-colors"
                            >
                              <KeyRound size={13} />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Liquidadora */}
                      <td className="px-3 py-2.5">
                        <span className="text-[12px] text-gray-500 truncate block max-w-[100px]">
                          {cliente.liquidadora?.nombre ?? "—"}
                        </span>
                      </td>

                      {/* Rec Q1 */}
                      {tieneQuincenales && (
                        <td className="px-2 py-2.5 text-center">
                          {cliente.es_quincenal ? (
                            <CheckboxCell
                              manual={t.rec_q1_manual}
                              drive={t.rec_q1_drive}
                              onToggle={() => handleToggle(cliente.id, "rec_q1")}
                            />
                          ) : (
                            <DashCell />
                          )}
                        </td>
                      )}

                      {/* Recibos */}
                      <td className="px-2 py-2.5 text-center">
                        <CheckboxCell
                          manual={t.recibos_manual}
                          drive={t.recibos_drive}
                          onToggle={() => handleToggle(cliente.id, "recibos")}
                        />
                      </td>

                      {/* F.931 */}
                      <td className="px-2 py-2.5 text-center">
                        <CheckboxCell
                          manual={t.f931_manual}
                          drive={t.f931_drive}
                          onToggle={() => handleToggle(cliente.id, "f931")}
                        />
                      </td>

                      {/* Bol.Sind */}
                      <td className="px-2 py-2.5 text-center">
                        {cliente.tiene_sindicato ? (
                          <CheckboxCell
                            manual={t.bol_sind_manual}
                            drive={t.bol_sind_drive}
                            onToggle={() => handleToggle(cliente.id, "bol_sind")}
                          />
                        ) : (
                          <DashCell />
                        )}
                      </td>

                      {/* Rúb.LSD */}
                      <td className="px-2 py-2.5 text-center">
                        {cliente.tiene_rubrica_lsd ? (
                          <CheckboxCell
                            manual={t.rub_lsd_manual}
                            drive={t.rub_lsd_drive}
                            onToggle={() => handleToggle(cliente.id, "rub_lsd")}
                          />
                        ) : (
                          <DashCell />
                        )}
                      </td>

                      {/* SAC */}
                      {esMesSAC && (
                        <td className="px-2 py-2.5 text-center">
                          <CheckboxCell
                            manual={t.sac_manual}
                            drive={t.sac_drive}
                            onToggle={() => handleToggle(cliente.id, "sac")}
                          />
                        </td>
                      )}

                      {/* Legajos */}
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="number"
                          min={0}
                          value={t.legajos_cantidad || ""}
                          placeholder="0"
                          onChange={(e) =>
                            handleLegajos(cliente.id, e.target.value)
                          }
                          className="w-14 text-center text-[12px] font-medium text-gray-700 border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-bordo focus:border-bordo bg-transparent hover:border-gray-300 transition-colors"
                        />
                      </td>

                      {/* Observaciones */}
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={t.observaciones}
                          placeholder="Agregar nota..."
                          onChange={(e) =>
                            handleObservaciones(cliente.id, e.target.value)
                          }
                          className="w-full text-[12px] text-gray-600 border border-transparent rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-bordo focus:border-bordo focus:bg-white hover:border-gray-200 bg-transparent placeholder:text-gray-300 transition-colors"
                        />
                      </td>

                      {/* Recordatorio para el mes siguiente */}
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={t.recordatorio}
                          placeholder="Recordar el mes que viene..."
                          onChange={(e) =>
                            handleRecordatorio(cliente.id, e.target.value)
                          }
                          className="w-full text-[12px] text-amber-700 border border-transparent rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-300 focus:bg-amber-50/50 hover:border-amber-200 bg-transparent placeholder:text-amber-300 transition-colors"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <p className="text-[11px] text-gray-400">
              {clientesFiltrados.length} empresas en{" "}
              <span className="font-medium">{currentPeriodo.nombre_mes}</span>
            </p>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-36 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      clientesFiltrados.length > 0
                        ? Math.round(
                            (totalDone / clientesFiltrados.length) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span className="text-[11px] font-medium text-gray-500">
                {clientesFiltrados.length > 0
                  ? Math.round((totalDone / clientesFiltrados.length) * 100)
                  : 0}
                % completado
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
