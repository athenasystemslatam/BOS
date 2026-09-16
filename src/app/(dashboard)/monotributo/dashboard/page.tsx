import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { TrendingUp, CheckCircle2, Circle } from "lucide-react";
import clsx from "clsx";
import { MesSelector } from "@/components/MesSelector";

const RECATEGORIZACION_MESES = new Set([2, 8]);

function generarOpciones(mesActual: number, anioActual: number) {
  const result = [];
  let m = mesActual;
  let a = anioActual;
  for (let i = 0; i < 14; i++) {
    result.push({ mes: m, anio: a, label: `${MESES_NOMBRES[m]} ${a}` });
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return result;
}

export default async function MonotributoDashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  const esRecategorizacion = RECATEGORIZACION_MESES.has(mes);

  const [{ data: serviciosRaw }, { data: tareasRaw }, { data: equipoRaw }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id")
      .eq("servicio", "monotributo")
      .eq("estado", true),
    admin
      .from("monotributo_tareas")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas = (tareasRaw as any[]) ?? [];
  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  const tareasMap = new Map(tareas.map((t) => [t.cliente_id, t]));

  const total = servicios.length;
  const cuotasPagadas = servicios.filter(
    (s) => tareasMap.get(s.cliente_id)?.cuota_estado === "pagado"
  ).length;
  const recatPendientes = esRecategorizacion
    ? servicios.filter((s) => {
        const t = tareasMap.get(s.cliente_id);
        return !t || t.recategorizacion === "pendiente";
      }).length
    : 0;
  const recatRealizadas = esRecategorizacion
    ? servicios.filter((s) => tareasMap.get(s.cliente_id)?.recategorizacion === "realizada").length
    : 0;
  const conDeuda = servicios.filter((s) => {
    const t = tareasMap.get(s.cliente_id);
    return t?.deuda_monto && t.deuda_monto > 0;
  }).length;

  const pctCuotas = total > 0 ? Math.round((cuotasPagadas / total) * 100) : 0;

  // Por responsable
  const respMap = new Map<string, { nombre: string; total: number; cuotasOk: number; recatOk: number }>();
  for (const s of servicios) {
    const rId = s.responsable_id;
    if (!rId) continue;
    const nombre = equipoMap.get(rId) ?? rId;
    if (!respMap.has(rId)) respMap.set(rId, { nombre, total: 0, cuotasOk: 0, recatOk: 0 });
    const entry = respMap.get(rId)!;
    entry.total++;
    if (tareasMap.get(s.cliente_id)?.cuota_estado === "pagado") entry.cuotasOk++;
    if (esRecategorizacion && tareasMap.get(s.cliente_id)?.recategorizacion === "realizada") entry.recatOk++;
  }
  const porResponsable = Array.from(respMap.values()).sort((a, b) => b.total - a.total);

  const opciones = generarOpciones(mesDefault, anioDefault);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo</p>
          <h1 className="text-[20px] font-semibold text-gray-900">
            Dashboard — {MESES_NOMBRES[mes]} {anio}
          </h1>
          {esRecategorizacion && (
            <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
              Mes de recategorización
            </span>
          )}
        </div>
        <MesSelector
          basePath="/monotributo/dashboard"
          options={opciones}
          currentMes={mes}
          currentAnio={anio}
          className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 cursor-pointer"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Total clientes</p>
          <p className="text-[28px] font-bold leading-none text-gray-900">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Cuotas pagadas</p>
          <p className={clsx("text-[28px] font-bold leading-none", pctCuotas === 100 ? "text-emerald-600" : "text-amber-600")}>
            {cuotasPagadas}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">{pctCuotas}% del total</p>
        </div>
        {esRecategorizacion ? (
          <div className="bg-white rounded-xl border border-amber-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider mb-3">Recategorización</p>
            <p className="text-[28px] font-bold leading-none text-amber-600">{recatRealizadas}</p>
            <p className="text-[11px] text-gray-400 mt-1">{recatPendientes} pendientes</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Con deuda</p>
            <p className={clsx("text-[28px] font-bold leading-none", conDeuda > 0 ? "text-red-500" : "text-gray-400")}>
              {conDeuda}
            </p>
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avance cuotas</p>
            <TrendingUp size={16} className="text-amber-500" />
          </div>
          <p className={clsx("text-[28px] font-bold leading-none", pctCuotas === 100 ? "text-emerald-600" : pctCuotas >= 50 ? "text-amber-600" : "text-gray-500")}>
            {pctCuotas}%
          </p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx("h-full rounded-full", pctCuotas === 100 ? "bg-emerald-500" : "bg-amber-400")}
              style={{ width: `${pctCuotas}%` }}
            />
          </div>
        </div>
      </div>

      {/* Por responsable */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-900">Avance por responsable</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">{MESES_NOMBRES[mes]} {anio}</p>
        </div>
        {porResponsable.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-gray-400">Sin responsables asignados</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Responsable</th>
                <th className="px-4 py-3 text-center">Total</th>
                <th className="px-4 py-3 text-center">Cuotas pagas</th>
                {esRecategorizacion && <th className="px-4 py-3 text-center">Recateg.</th>}
                <th className="px-4 py-3 text-center">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {porResponsable.map((r) => {
                const pct = r.total > 0 ? Math.round((r.cuotasOk / r.total) * 100) : 0;
                return (
                  <tr key={r.nombre} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center text-[11px] font-bold text-amber-700 shrink-0">
                          {r.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-800">{r.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-[13px] text-gray-600">{r.total}</td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.cuotasOk === r.total && r.total > 0
                          ? <CheckCircle2 size={13} className="text-emerald-500" />
                          : <Circle size={13} className="text-gray-300" />
                        }
                        <span className="text-[12px] text-gray-700">{r.cuotasOk}/{r.total}</span>
                      </div>
                    </td>
                    {esRecategorizacion && (
                      <td className="px-4 py-3.5 text-center text-[12px] text-gray-600">{r.recatOk}</td>
                    )}
                    <td className="px-4 py-3.5 text-center">
                      <span className={clsx(
                        "text-[12px] font-semibold",
                        pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-gray-400"
                      )}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
