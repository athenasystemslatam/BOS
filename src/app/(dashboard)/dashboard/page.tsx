import { createAdminClient } from "@/lib/supabase/admin";
import { Cliente, Liquidadora, Tarea } from "@/types";
import { getVencimientosGrupos, getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { TrendingUp, Building2, CheckCircle2, Clock, CalendarDays, AlertTriangle } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { MonthSelector } from "./MonthSelector";

const CAMPO_LABELS: Record<string, string> = {
  f931: "F.931", recibos: "Recibos", rec_q1: "Recibos Q1",
  bol_sind: "Boleta sindical", rub_lsd: "Rúbrica LSD", sac: "SAC",
};

function generateMonthOptions(mesTrabajo: number, anioTrabajo: number) {
  let mes = mesTrabajo;
  let anio = anioTrabajo;
  for (let i = 0; i < 12; i++) {
    if (mes === 1) { mes = 12; anio--; } else mes--;
  }
  const options = [];
  for (let i = 0; i < 15; i++) {
    options.push({ label: `${MESES_NOMBRES[mes]} ${anio}`, mes, anio });
    if (mes === 12) { mes = 1; anio++; } else mes++;
  }
  return options;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const supabase = createAdminClient();
  const hoy = new Date();

  const { mes: mesTrabajo, anio: anioTrabajo } = getMesTrabajoActual();
  const mesActual = parseInt(searchParams.mes ?? "") || mesTrabajo;
  const anioActual = parseInt(searchParams.anio ?? "") || anioTrabajo;

  const esMesSAC = mesActual === 6 || mesActual === 12;

  const esMesActual = mesActual === mesTrabajo && anioActual === anioTrabajo;
  const monthOptions = generateMonthOptions(mesTrabajo, anioTrabajo);

  const [{ data: liquidadoras }, { data: clientes }] = await Promise.all([
    supabase.from("liquidadoras").select("*").eq("activa", true).order("nombre"),
    supabase.from("clientes").select("*, liquidadora:liquidadoras!liquidador_id(*)").eq("estado", "activo"),
  ]);

  let { data: periodoActual } = await supabase
    .from("periodos").select("*").eq("anio", anioActual).eq("mes", mesActual).maybeSingle();

  if (!periodoActual) {
    const { data: nuevo } = await supabase
      .from("periodos")
      .upsert(
        { anio: anioActual, mes: mesActual, nombre_mes: `${MESES_NOMBRES[mesActual]} ${anioActual}` },
        { onConflict: "anio,mes" }
      )
      .select().single();
    periodoActual = nuevo;
  }

  const { data: tareas } = periodoActual
    ? await supabase.from("tareas").select("*").eq("periodo_id", periodoActual.id)
    : { data: [] };

  const { data: alertasPostcierre } = await supabase
    .from("alertas_postcierre")
    .select("*, cliente:clientes(nombre), periodo:periodos(nombre_mes)")
    .gte("modificado_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
    .order("modificado_at", { ascending: false })
    .limit(50);

  const clientesList = (clientes as (Cliente & { liquidadora: Liquidadora })[]) ?? [];
  const liquidadorasList = (liquidadoras as Liquidadora[]) ?? [];
  const tareasList = (tareas as Tarea[]) ?? [];
  const tareasMap = new Map(tareasList.map((t) => [t.cliente_id, t]));

  let completadas = 0;
  let enProceso = 0;
  for (const c of clientesList) {
    const t = tareasMap.get(c.id);
    if (!t) continue;
    const checks = [
      t.recibos_manual || t.recibos_drive,
      t.f931_manual || t.f931_drive,
      c.tiene_sindicato ? (t.bol_sind_manual || t.bol_sind_drive) : true,
      c.tiene_rubrica_lsd ? (t.rub_lsd_manual || t.rub_lsd_drive) : true,
      esMesSAC ? (t.sac_manual || t.sac_drive) : true,
    ];
    if (checks.every(Boolean)) completadas++;
    else if (checks.some(Boolean)) enProceso++;
  }

  const total = clientesList.length;
  const pctAvance = total > 0 ? Math.round((completadas / total) * 100) : 0;

  const resumen = liquidadorasList.map((liq) => {
    const mis = clientesList.filter((c) => c.liquidador_id === liq.id);
    let recibosOk = 0, f931Ok = 0, sacOk = 0, pendientes = 0;
    for (const c of mis) {
      const t = tareasMap.get(c.id);
      if (!t) { pendientes++; continue; }
      if (t.recibos_manual || t.recibos_drive) recibosOk++;
      if (t.f931_manual || t.f931_drive) f931Ok++;
      if (esMesSAC && (t.sac_manual || t.sac_drive)) sacOk++;
      if (
        !(t.recibos_manual || t.recibos_drive) ||
        !(t.f931_manual || t.f931_drive)
      ) pendientes++;
    }
    return { liq, total: mis.length, recibosOk, f931Ok, sacOk, pendientes };
  });

  // F.931 por grupo de CUIT — vencimientos del mes de trabajo
  const gruposF931 = getVencimientosGrupos(anioActual, mesActual).map((g) => {
    const clientesGrupo = clientesList.filter(
      (c) => c.terminacion_cuit >= g.min && c.terminacion_cuit <= g.max
    );
    const ok = clientesGrupo.filter((c) => {
      const t = tareasMap.get(c.id);
      return t ? t.f931_manual || t.f931_drive : false;
    }).length;
    const ms = g.fecha.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(ms / 86400000);
    return { ...g, ok, total: clientesGrupo.length, diasRestantes };
  });

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-7 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Resumen mensual</p>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
              {MESES_NOMBRES[mesActual]} {anioActual}
            </h1>
            <MonthSelector options={monthOptions} currentMes={mesActual} currentAnio={anioActual} />
          </div>
        </div>
        {!esMesActual && (
          <Link
            href="/dashboard"
            className="text-[12px] text-bordo font-medium hover:underline"
          >
            Volver al mes actual
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label="Total empresas" value={total} icon={<Building2 size={16} className="text-gray-400" />} />
        <StatCard
          label="Completadas"
          value={completadas}
          icon={<CheckCircle2 size={16} className="text-success" />}
          valueColor="text-success"
          sub={total > 0 ? `${pctAvance}% del total` : undefined}
        />
        <StatCard
          label="En proceso"
          value={enProceso}
          icon={<Clock size={16} className="text-warning" />}
          valueColor="text-warning"
        />
        <ProgressCard pct={pctAvance} completadas={completadas} total={total} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Avance por liquidadora */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Avance por liquidadora</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {MESES_NOMBRES[mesActual]} {anioActual}
            </p>
          </div>

          {resumen.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-400">
              No hay liquidadoras configuradas
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  {["Liquidadora", "Empresas", "Recibos", "F.931", ...(esMesSAC ? ["SAC"] : []), "Pendientes"].map((h) => (
                    <th
                      key={h}
                      className={clsx(
                        "py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider",
                        h === "Liquidadora" ? "px-6 text-left" : "px-4 text-center"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resumen.map(({ liq, total: tot, recibosOk, f931Ok, sacOk, pendientes }) => (
                  <tr key={liq.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-bordo/10 flex items-center justify-center text-[11px] font-bold text-bordo shrink-0">
                          {liq.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-800">{liq.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-[13px] text-gray-600">{tot}</td>
                    <td className="px-4 py-3.5 text-center">
                      <ProgressPill done={recibosOk} total={tot} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ProgressPill done={f931Ok} total={tot} />
                    </td>
                    {esMesSAC && (
                      <td className="px-4 py-3.5 text-center">
                        <ProgressPill done={sacOk} total={tot} />
                      </td>
                    )}
                    <td className="px-4 py-3.5 text-center">
                      {pendientes > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-danger text-[11px] font-bold">
                          {pendientes}
                        </span>
                      ) : (
                        <CheckCircle2 size={14} className="text-success mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* F.931 por grupo de CUIT */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Vencimientos F.931</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Liq. {MESES_NOMBRES[mesActual]} — vence en{" "}
              {mesActual === 12 ? "enero" : MESES_NOMBRES[mesActual + 1].toLowerCase()}
            </p>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {gruposF931.map((g) => {
              const vencido = g.diasRestantes < 0;
              const urgente = !vencido && g.diasRestantes <= 2;
              const proximo = !vencido && g.diasRestantes <= 7;
              return (
                <div
                  key={g.label}
                  className={clsx(
                    "rounded-lg p-3.5 border",
                    vencido || urgente
                      ? "bg-red-50 border-red-200"
                      : proximo
                      ? "bg-amber-50 border-amber-200"
                      : "bg-green-50 border-green-100"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-gray-600">{g.label}</span>
                    <span
                      className={clsx(
                        "text-[12px] font-bold",
                        vencido || urgente
                          ? "text-danger"
                          : proximo
                          ? "text-amber-700"
                          : "text-success"
                      )}
                    >
                      {vencido
                        ? "Vencido"
                        : g.diasRestantes === 0
                        ? "¡Hoy!"
                        : `${g.diasRestantes}d`}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-600 font-medium">
                    {g.fecha.toLocaleDateString("es-AR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-gray-500">F.931 presentados</span>
                    <span
                      className={clsx(
                        "text-[11px] font-semibold",
                        g.ok === g.total && g.total > 0 ? "text-success" : "text-gray-500"
                      )}
                    >
                      {g.ok}/{g.total}
                    </span>
                  </div>
                  {g.total > 0 && (
                    <div className="mt-1.5 h-1 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          g.ok === g.total ? "bg-success" : "bg-gray-400"
                        )}
                        style={{ width: `${Math.round((g.ok / g.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-gray-100">
            <Link
              href="/vencimientos"
              className="text-[11px] font-medium text-bordo hover:text-bordo-dark flex items-center gap-1.5 transition-colors"
            >
              <CalendarDays size={12} />
              Ver calendario completo 2026
            </Link>
          </div>
        </div>
      </div>

      {/* Modificaciones fuera de término */}
      {alertasPostcierre && alertasPostcierre.length > 0 && (
        <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-orange-200">
            <AlertTriangle size={13} className="shrink-0 text-orange-500" />
            <span className="text-[13px] font-semibold text-orange-900">Modificaciones fuera de término</span>
            <span className="ml-auto text-[11px] text-orange-400">últimos 60 días</span>
          </div>
          <table className="w-full text-[12px] text-orange-900">
            <thead>
              <tr className="border-b border-orange-100">
                <th className="px-5 py-2 text-left text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Empresa</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Ítem</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Período</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {alertasPostcierre.map((a) => (
                <tr key={a.id} className="border-b border-orange-100 last:border-0 hover:bg-orange-100/40 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{(a.cliente as { nombre: string })?.nombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-orange-700">{CAMPO_LABELS[a.campo] ?? a.campo}</td>
                  <td className="px-4 py-2.5 text-orange-500">{(a.periodo as { nombre_mes: string })?.nombre_mes ?? "—"}</td>
                  <td className="px-4 py-2.5 text-orange-400 text-right">
                    {new Date(a.modificado_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
    </div>
  );
}

function ProgressCard({ pct, completadas, total }: { pct: number; completadas: number; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avance global</p>
        <TrendingUp size={16} className="text-bordo" />
      </div>
      <p className={clsx("text-[28px] font-bold leading-none tracking-tight",
        pct >= 80 ? "text-success" : pct >= 40 ? "text-warning" : "text-danger"
      )}>
        {pct}%
      </p>
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all",
            pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">{completadas} de {total} empresas</p>
    </div>
  );
}

function ProgressPill({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[12px] text-gray-700 font-medium">{done}/{total}</span>
      <span className={clsx("text-[10px] font-semibold",
        pct === 100 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"
      )}>
        {pct}%
      </span>
    </div>
  );
}
