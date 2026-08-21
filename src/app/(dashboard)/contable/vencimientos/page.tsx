import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarDays } from "lucide-react";
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

const ESTADO_BALANCE: Record<string, { label: string; cls: string }> = {
  sin_asignar: { label: "Sin asignar", cls: "bg-gray-100 text-gray-500" },
  asignado:    { label: "Asignado",    cls: "bg-blue-100 text-blue-700" },
  en_proceso:  { label: "En proceso",  cls: "bg-amber-100 text-amber-700" },
  finalizado:  { label: "Finalizado",  cls: "bg-emerald-100 text-emerald-700" },
  frenado:     { label: "Frenado",     cls: "bg-red-100 text-red-600" },
};

export default async function ContableVencimientosPage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const anio = Number(searchParams.anio) || new Date().getFullYear();
  const admin = createAdminClient();

  const { data: balancesRaw } = await admin
    .from("balances")
    .select(
      "id, fecha_cierre, estado, avance, " +
      "clientes(nombre), " +
      "responsable:equipo!balances_responsable_id_fkey(nombre), " +
      "responsable2:equipo!balances_responsable2_id_fkey(nombre)"
    )
    .eq("anio_fiscal", anio)
    .order("fecha_cierre");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balancesRaw as any[]) ?? [];
  const hoy = new Date();

  const filas = balances.map((b) => {
    const vtoBalance = addDays(b.fecha_cierre, 135);
    const vto855 = addDays(b.fecha_cierre, 160);
    const diasVto = Math.ceil((vtoBalance.getTime() - hoy.getTime()) / 86400000);
    return { ...b, vtoBalance, vto855, diasVto };
  });

  const pendientes = filas.filter((b) => b.estado !== "finalizado");
  const finalizados = filas.filter((b) => b.estado === "finalizado");

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Contable</p>
          <h1 className="text-[20px] font-semibold text-gray-900">Vencimientos {anio}</h1>
          <p className="text-[13px] text-gray-400 mt-1">
            VTO Balance = cierre + 135 días · VTO F.855 = cierre + 160 días
          </p>
        </div>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          {ANIOS.map((a) => (
            <a
              key={a}
              href={`/contable/vencimientos?anio=${a}`}
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

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 mb-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Más de 30 días</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400" /> 14–30 días</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> Menos de 14 días / vencido</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-gray-200" /> Finalizado</div>
      </div>

      {/* Pendientes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <CalendarDays size={14} className="text-amber-500" />
          <h2 className="text-[14px] font-semibold text-gray-900">Pendientes de finalizar</h2>
          <span className="ml-auto text-[11px] text-gray-400">{pendientes.length} balances</span>
        </div>
        {pendientes.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-gray-400">Todos los balances finalizados ✓</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-left">Cierre</th>
                  <th className="px-4 py-3 text-left">VTO Balance</th>
                  <th className="px-4 py-3 text-left">VTO F.855</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-center">Avance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendientes.map((b) => {
                  const urgente = b.diasVto <= 14;
                  const proximo = b.diasVto <= 30;
                  const vencido = b.diasVto < 0;
                  const { label, cls } = ESTADO_BALANCE[b.estado] ?? ESTADO_BALANCE.sin_asignar;
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-800">{b.clientes?.nombre ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {b.responsable?.nombre ?? "—"}
                        {b.responsable2?.nombre && (
                          <span className="text-gray-400 text-[11px]"> + {b.responsable2.nombre}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(b.fecha_cierre + "T00:00:00").toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className={clsx(
                          "inline-flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px]",
                          vencido || urgente ? "bg-red-50 text-red-700" : proximo ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                        )}>
                          <span className="font-semibold">{fmt(b.vtoBalance)}</span>
                          <span className="opacity-75">
                            {vencido ? "vencido" : b.diasVto === 0 ? "hoy" : `${b.diasVto}d`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmt(b.vto855)}</td>
                      <td className="px-4 py-3">
                        <span className={clsx("text-[11px] font-medium rounded-full px-2.5 py-1", cls)}>{label}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx(
                          "text-[12px] font-semibold",
                          b.avance >= 80 ? "text-emerald-600" : b.avance >= 40 ? "text-amber-600" : "text-gray-400"
                        )}>
                          {b.avance ?? 0}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Finalizados */}
      {finalizados.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-gray-900">Finalizados</h2>
            <span className="ml-auto text-[11px] text-gray-400">{finalizados.length} balances</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-left">Cierre</th>
                  <th className="px-4 py-3 text-left">VTO Balance</th>
                  <th className="px-4 py-3 text-left">VTO F.855</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {finalizados.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/50 transition-colors opacity-60">
                    <td className="px-6 py-3 font-medium text-gray-700">{b.clientes?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{b.responsable?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(b.fecha_cierre + "T00:00:00").toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{fmt(b.vtoBalance)}</td>
                    <td className="px-4 py-3 text-gray-400">{fmt(b.vto855)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
