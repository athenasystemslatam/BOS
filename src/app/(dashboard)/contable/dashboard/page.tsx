import { createAdminClient } from "@/lib/supabase/admin";
import { Building2, CheckCircle2, Clock, AlertTriangle, Ban, UserX, Target } from "lucide-react";
import clsx from "clsx";
import { ESTADO_BALANCE, calcularAvance, DIAS_VTO_BALANCE, DIAS_VTO_F855, OBJETIVO_CONTABLE_TEXTO } from "../semaforo";
import { MapaCargaClient } from "./MapaCargaClient";

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

export default async function ContableDashboardPage() {
  // Ventana de dos años: un balance que cierra a fin de un año fiscal puede
  // vencer (cierre + 135/160 días) recién entrado el año siguiente, así que
  // el dashboard siempre mira el año actual + el anterior juntos, no uno
  // por vez (ver nota del 2026-10-20).
  const anioActual = new Date().getFullYear();
  const anios = [anioActual - 1, anioActual];
  const admin = createAdminClient();

  const [{ data: balancesRaw }, { data: equipoRaw }, { data: modulosRaw }] = await Promise.all([
    admin
      .from("balances")
      .select(
        "id, cliente_id, anio_fiscal, fecha_cierre, estado, f855_estado, presentado_fecha, f855_fecha, " +
        "clientes(nombre), " +
        "responsable:liquidadoras!balances_responsable_id_fkey(id, nombre), " +
        "responsable2:liquidadoras!balances_responsable2_id_fkey(id, nombre)"
      )
      .in("anio_fiscal", anios)
      .order("fecha_cierre"),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "contable"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balancesRaw as any[]) ?? [];
  const hoy = new Date();

  const equipoIdsContable = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoContable = (equipoRaw ?? []).filter((e) => equipoIdsContable.has(e.id));

  const conVto = balances.map((b) => ({
    ...b,
    vtoBalance: addDays(b.fecha_cierre, DIAS_VTO_BALANCE),
    vto855: addDays(b.fecha_cierre, DIAS_VTO_F855),
  }));

  // Objetivo del área (ítems 67/70): el mínimo legal es 100% en término.
  // Solo cuenta lo que ya venció (no tiene sentido evaluar "en término" algo
  // que todavía tiene plazo) y nunca a los frenados.
  const vencidosBalance = conVto.filter((b) => b.estado !== "frenado" && b.vtoBalance < hoy);
  const enTerminoBalance = vencidosBalance.filter(
    (b) => b.estado === "finalizado" && b.presentado_fecha && new Date(b.presentado_fecha) <= b.vtoBalance
  ).length;
  const vencidosF855 = conVto.filter((b) => b.estado !== "frenado" && b.vto855 < hoy);
  const enTerminoF855 = vencidosF855.filter(
    (b) => b.f855_estado === "presentado" && b.f855_fecha && new Date(b.f855_fecha) <= b.vto855
  ).length;

  // Estado general del área
  const total = balances.length;
  const terminados = balances.filter((b) => b.estado === "finalizado").length;
  const frenados = balances.filter((b) => b.estado === "frenado").length;
  const sinAsignar = balances.filter((b) => b.estado === "sin_asignar").length;
  const enProceso = balances.filter((b) => b.estado === "asignado" || b.estado === "legalizado").length;
  const vencidosSinCerrar = conVto.filter(
    (b) => b.estado !== "finalizado" && b.vtoBalance < hoy
  ).length;

  // Resumen por contador: "sin empezar" = asignado pero todavía en 0% de
  // avance (ni siquiera se pidió información); "en proceso" = cualquier
  // avance > 0% que no sea ni terminado ni frenado.
  const respMap = new Map<
    string,
    {
      nombre: string;
      total: number;
      terminados: number;
      enProceso: number;
      sinEmpezar: number;
      frenados: number;
      proximosVencimientos: number;
    }
  >();
  for (const b of conVto) {
    const resps = [b.responsable, b.responsable2].filter(Boolean);
    for (const r of resps) {
      if (!r?.id) continue;
      if (!respMap.has(r.id)) {
        respMap.set(r.id, {
          nombre: r.nombre,
          total: 0,
          terminados: 0,
          enProceso: 0,
          sinEmpezar: 0,
          frenados: 0,
          proximosVencimientos: 0,
        });
      }
      const entry = respMap.get(r.id)!;
      entry.total++;
      if (b.estado === "finalizado") entry.terminados++;
      else if (b.estado === "frenado") entry.frenados++;
      else if (calcularAvance(b) === 0) entry.sinEmpezar++;
      else entry.enProceso++;
      if (b.estado !== "finalizado" && diasRestantes(b.vtoBalance) <= 30) entry.proximosVencimientos++;
    }
  }
  const porResponsable = Array.from(respMap.values()).sort((a, b) => b.total - a.total);

  // Próximos vencimientos (detalle) — incluye los ya vencidos sin cerrar,
  // ordenados primero por ser lo más urgente.
  const proximosVto = conVto
    .filter((b) => b.estado !== "finalizado")
    .map((b) => ({
      nombre: b.clientes?.nombre ?? "—",
      estado: b.estado,
      fechaCierre: b.fecha_cierre,
      vtoBalance: b.vtoBalance,
      vto855: b.vto855,
    }))
    .sort((a, b) => a.vtoBalance.getTime() - b.vtoBalance.getTime())
    .slice(0, 10);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Contable · Resumen</p>
        <h1 className="text-[20px] font-semibold text-gray-900">
          Dashboard {anios[0]}–{anios[1]}
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          Ventana de dos años fiscales: un balance que cierra en {anios[0]} puede vencer recién en {anios[1]}.
        </p>
      </div>

      {/* Objetivo del área (ítems 67/68/70) — mínimo legal: 100% en término.
          Todavía hardcodeado acá (ver DIAS_VTO_BALANCE/DIAS_VTO_F855 en
          semaforo.ts) hasta que exista la pantalla de configuración del
          ítem 67 (objetivo general + excepción por cliente). */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <Target size={16} className="text-emerald-600" />
          <span className="text-[13px] font-semibold text-gray-900">Objetivo: {OBJETIVO_CONTABLE_TEXTO}</span>
        </div>
        <div className="flex items-center gap-5 ml-auto text-[12px]">
          <ObjetivoRatio label="Balances" ok={enTerminoBalance} total={vencidosBalance.length} />
          <ObjetivoRatio label="F.855" ok={enTerminoF855} total={vencidosF855.length} />
        </div>
      </div>

      {/* Estado general */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total balances" value={total} icon={<Building2 size={16} className="text-gray-400" />} />
        <StatCard
          label="Terminados (En ARCA)"
          value={terminados}
          icon={<CheckCircle2 size={16} className="text-emerald-500" />}
          valueColor="text-emerald-600"
        />
        <StatCard
          label="En proceso"
          value={enProceso}
          icon={<Clock size={16} className="text-amber-500" />}
          valueColor="text-amber-600"
        />
        <StatCard
          label="Sin asignar"
          value={sinAsignar}
          icon={<UserX size={16} className="text-gray-400" />}
        />
        <StatCard
          label="Frenados"
          value={frenados}
          icon={<Ban size={16} className="text-red-500" />}
          valueColor={frenados > 0 ? "text-red-600" : "text-gray-900"}
        />
        <StatCard
          label="Vencidos sin cerrar"
          value={vencidosSinCerrar}
          icon={<AlertTriangle size={16} className="text-red-500" />}
          valueColor={vencidosSinCerrar > 0 ? "text-red-600" : "text-gray-900"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Resumen por contador */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Resumen por contador</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Años fiscales {anios[0]} y {anios[1]}</p>
          </div>
          {porResponsable.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-400">Sin responsables asignados</div>
          ) : (
            <div className="max-h-[420px] overflow-auto [scrollbar-gutter:stable]">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Contador</th>
                    <th className="px-3 py-3 text-center">Total</th>
                    <th className="px-3 py-3 text-center">Terminados</th>
                    <th className="px-3 py-3 text-center">En proceso</th>
                    <th className="px-3 py-3 text-center">Sin empezar</th>
                    <th className="px-3 py-3 text-center">Frenados</th>
                    <th className="px-3 py-3 text-center">Próx. vtos.</th>
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
                      <td className="px-3 py-3.5 text-center text-[13px] text-gray-600">{r.total}</td>
                      <td className="px-3 py-3.5 text-center text-[13px] text-emerald-600 font-medium">{r.terminados}</td>
                      <td className="px-3 py-3.5 text-center text-[13px] text-amber-600 font-medium">{r.enProceso}</td>
                      <td className="px-3 py-3.5 text-center text-[13px] text-gray-500">{r.sinEmpezar}</td>
                      <td className={clsx("px-3 py-3.5 text-center text-[13px] font-medium", r.frenados > 0 ? "text-red-600" : "text-gray-300")}>
                        {r.frenados}
                      </td>
                      <td className={clsx("px-3 py-3.5 text-center text-[13px] font-medium", r.proximosVencimientos > 0 ? "text-red-600" : "text-gray-300")}>
                        {r.proximosVencimientos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Distribución por estado */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Por estado</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Años fiscales {anios[0]} y {anios[1]}</p>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: "Finalizado", count: terminados, color: ESTADO_BALANCE.finalizado.bar },
              { label: "Legalizado", count: balances.filter((b) => b.estado === "legalizado").length, color: ESTADO_BALANCE.legalizado.bar },
              { label: "Asignado", count: balances.filter((b) => b.estado === "asignado").length, color: ESTADO_BALANCE.asignado.bar },
              { label: "Frenado", count: frenados, color: ESTADO_BALANCE.frenado.bar },
              { label: "Sin asignar", count: sinAsignar, color: ESTADO_BALANCE.sin_asignar.bar },
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

      {/* Mapa de carga por contador — cómo se distribuye el trabajo de cada
          uno a lo largo de la ventana de dos años, para detectar picos. */}
      <div className="mt-5">
        <MapaCargaClient
          contadores={equipoContable}
          balances={conVto.map((b) => ({
            responsable_id: b.responsable?.id ?? null,
            responsable2_id: b.responsable2?.id ?? null,
            fechaCierre: b.fecha_cierre,
            fechaVencimiento: b.vtoBalance.toISOString().slice(0, 10),
          }))}
          anios={anios}
        />
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
              <thead className="sticky top-0 z-10 bg-white">
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

function StatCard({ label, value, icon, valueColor = "text-gray-900" }: {
  label: string; value: number; icon: React.ReactNode; valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
        {icon}
      </div>
      <p className={clsx("text-[26px] font-bold leading-none tracking-tight", valueColor)}>{value}</p>
    </div>
  );
}

function ObjetivoRatio({ label, ok, total }: { label: string; ok: number; total: number }) {
  if (total === 0) {
    return (
      <span className="text-gray-400">
        <span className="font-medium text-gray-500">{label}:</span> sin vencidos todavía
      </span>
    );
  }
  const completo = ok === total;
  return (
    <span className={completo ? "text-emerald-600" : "text-red-600"}>
      <span className="font-medium">{label}:</span> {ok} de {total} en término
    </span>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const { label, cls } = ESTADO_BALANCE[estado] ?? ESTADO_BALANCE.sin_asignar;
  return <span className={clsx("text-[11px] font-medium rounded-full px-2.5 py-1", cls)}>{label}</span>;
}
