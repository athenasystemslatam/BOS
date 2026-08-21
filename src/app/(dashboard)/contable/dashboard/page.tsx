import { createAdminClient } from "@/lib/supabase/admin";
import { TrendingUp, Building2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import clsx from "clsx";

const ANIOS = [2026, 2025, 2024, 2023];

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function diasRestantes(d: Date) {
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default async function ContableDashboardPage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const anio = Number(searchParams.anio) || new Date().getFullYear();
  const admin = createAdminClient();

  const { data: balancesRaw } = await admin
    .from("balances")
    .select(
      "id, cliente_id, fecha_cierre, estado, avance, " +
      "clientes(nombre), " +
      "responsable:liquidadoras!balances_responsable_id_fkey(id, nombre), " +
      "responsable2:liquidadoras!balances_responsable2_id_fkey(id, nombre)"
    )
    .eq("anio_fiscal", anio)
    .order("fecha_cierre");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balancesRaw as any[]) ?? [];

  const total = balances.length;
  const finalizados = balances.filter((b) => b.estado === "finalizado").length;
  const enProceso = balances.filter((b) => b.estado === "en_proceso").length;
  const asignados = balances.filter((b) => b.estado === "asignado").length;
  const frenados = balances.filter((b) => b.estado === "frenado").length;
  const sinAsignar = balances.filter((b) => b.estado === "sin_asignar").length;
  const avancePromedio =
    total > 0 ? Math.round(balances.reduce((s: number, b: { avance: number }) => s + (b.avance ?? 0), 0) / total) : 0;

  // Agrupación por responsable
  const respMap = new Map<string, { nombre: string; total: number; finalizados: number; avanceSum: number }>();
  for (const b of balances) {
    const resps = [b.responsable, b.responsable2].filter(Boolean);
    for (const r of resps) {
      if (!r?.id) continue;
      if (!respMap.has(r.id)) respMap.set(r.id, { nombre: r.nombre, total: 0, finalizados: 0, avanceSum: 0 });
      const entry = respMap.get(r.id)!;
      entry.total++;
      if (b.estado === "finalizado") entry.finalizados++;
      entry.avanceSum += b.avance ?? 0;
    }
  }
  const porResponsable = Array.from(respMap.values())
    .map((r) => ({ ...r, avanceProm: r.total > 0 ? Math.round(r.avanceSum / r.total) : 0 }))
    .sort((a, b) => b.total - a.total);

  // Próximos vencimientos (balances no finalizados, con VTO balance más próximo)
  const hoy = new Date();
  const proximosVto = balances
    .filter((b) => b.estado !== "finalizado")
    .map((b) => ({
      nombre: b.clientes?.nombre ?? "—",
      estado: b.estado,
      fechaCierre: b.fecha_cierre,
      vtoBalance: addDays(b.fecha_cierre, 135),
      vto855: addDays(b.fecha_cierre, 160),
    }))
    .filter((b) => b.vtoBalance >= hoy)
    .sort((a, b) => a.vtoBalance.getTime() - b.vtoBalance.getTime())
    .slice(0, 10);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Contable</p>
          <h1 className="text-[20px] font-semibold text-gray-900">Dashboard {anio}</h1>
        </div>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          {ANIOS.map((a) => (
            <a
              key={a}
              href={`/contable/dashboard?anio=${a}`}
              className={clsx(
                "px-3 py-1.5 text-[13px] font-medium rounded-md transition-all",
                a === anio ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {a}
            </a>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total balances" value={total} icon={<Building2 size={16} className="text-gray-400" />} />
        <StatCard
          label="Finalizados"
          value={finalizados}
          icon={<CheckCircle2 size={16} className="text-emerald-500" />}
          valueColor="text-emerald-600"
          sub={total > 0 ? `${Math.round((finalizados / total) * 100)}%` : undefined}
        />
        <StatCard
          label="En proceso"
          value={enProceso + asignados}
          icon={<Clock size={16} className="text-amber-500" />}
          valueColor="text-amber-600"
        />
        <AvanceCard pct={avancePromedio} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Avance por responsable */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Avance por responsable</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Año fiscal {anio}</p>
          </div>
          {porResponsable.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-400">Sin responsables asignados</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">Finalizados</th>
                  <th className="px-4 py-3 text-center">Avance prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {porResponsable.map((r) => (
                  <tr key={r.nombre} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-[11px] font-bold text-emerald-700 shrink-0">
                          {r.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-800">{r.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-[13px] text-gray-600">{r.total}</td>
                    <td className="px-4 py-3.5 text-center">
                      <RatioCell done={r.finalizados} total={r.total} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={clsx(
                        "text-[13px] font-semibold",
                        r.avanceProm >= 80 ? "text-emerald-600" : r.avanceProm >= 40 ? "text-amber-600" : "text-gray-500"
                      )}>
                        {r.avanceProm}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Distribución por estado */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Por estado</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Año fiscal {anio}</p>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: "Finalizado", count: finalizados, color: "bg-emerald-500" },
              { label: "En proceso", count: enProceso, color: "bg-amber-400" },
              { label: "Asignado", count: asignados, color: "bg-blue-400" },
              { label: "Frenado", count: frenados, color: "bg-red-400" },
              { label: "Sin asignar", count: sinAsignar, color: "bg-gray-300" },
            ].map(({ label, count, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] text-gray-600">{label}</span>
                  <span className="text-[12px] font-semibold text-gray-700">
                    {count}
                    {total > 0 && <span className="text-gray-400 font-normal ml-1">({Math.round((count / total) * 100)}%)</span>}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full", color)}
                    style={{ width: total > 0 ? `${Math.round((count / total) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Próximos vencimientos */}
      {proximosVto.length > 0 && (
        <div className="mt-5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <h2 className="text-[14px] font-semibold text-gray-900">Próximos vencimientos</h2>
            <span className="text-[11px] text-gray-400 ml-auto">balances no finalizados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Cierre</th>
                  <th className="px-4 py-3 text-left">VTO Balance</th>
                  <th className="px-4 py-3 text-left">VTO F.855</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {proximosVto.map((b, i) => {
                  const dias = diasRestantes(b.vtoBalance);
                  const urgente = dias <= 14;
                  const proximo = dias <= 30;
                  return (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-800">{b.nombre}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(b.fechaCierre + "T00:00:00").toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "font-medium",
                          urgente ? "text-red-600" : proximo ? "text-amber-600" : "text-gray-700"
                        )}>
                          {fmt(b.vtoBalance)}
                          <span className="ml-1.5 text-[11px] font-normal opacity-70">
                            {dias === 0 ? "hoy" : dias > 0 ? `${dias}d` : "vencido"}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmt(b.vto855)}</td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={b.estado} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, valueColor = "text-gray-900", sub }: {
  label: string; value: number; icon: React.ReactNode; valueColor?: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        {icon}
      </div>
      <p className={clsx("text-[28px] font-bold leading-none tracking-tight", valueColor)}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function AvanceCard({ pct }: { pct: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avance global</p>
        <TrendingUp size={16} className="text-emerald-600" />
      </div>
      <p className={clsx(
        "text-[28px] font-bold leading-none tracking-tight",
        pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-gray-500"
      )}>
        {pct}%
      </p>
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full", pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-gray-300")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RatioCell({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[12px] text-gray-700 font-medium">{done}/{total}</span>
      <span className={clsx("text-[10px] font-semibold",
        pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-gray-400"
      )}>{pct}%</span>
    </div>
  );
}

const ESTADO_BALANCE: Record<string, { label: string; cls: string }> = {
  sin_asignar: { label: "Sin asignar", cls: "bg-gray-100 text-gray-500" },
  asignado:    { label: "Asignado",    cls: "bg-blue-100 text-blue-700" },
  en_proceso:  { label: "En proceso",  cls: "bg-amber-100 text-amber-700" },
  finalizado:  { label: "Finalizado",  cls: "bg-emerald-100 text-emerald-700" },
  frenado:     { label: "Frenado",     cls: "bg-red-100 text-red-600" },
};

function EstadoBadge({ estado }: { estado: string }) {
  const { label, cls } = ESTADO_BALANCE[estado] ?? ESTADO_BALANCE.sin_asignar;
  return <span className={clsx("text-[11px] font-medium rounded-full px-2.5 py-1", cls)}>{label}</span>;
}
