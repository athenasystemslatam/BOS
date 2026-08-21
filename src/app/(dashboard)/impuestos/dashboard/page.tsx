import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { CheckCircle2, Circle, TrendingUp } from "lucide-react";
import clsx from "clsx";

const SUBTIPOS = [
  { key: "iva", label: "IVA" },
  { key: "iibb", label: "IIBB" },
  { key: "seh", label: "Seg. e Hig." },
] as const;

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

export default async function ImpuestosDashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();

  const [{ data: serviciosRaw }, { data: tareasRaw }, { data: equipoRaw }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, subtipo, responsable_id")
      .eq("servicio", "impuestos")
      .eq("estado", true),
    admin.from("impuestos_tareas").select("*").eq("anio", anio).eq("mes", mes),
    admin.from("equipo").select("id, nombre").eq("activo", true),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas = (tareasRaw as any[]) ?? [];
  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  const tareasMap = new Map(tareas.map((t) => [`${t.cliente_id}:${t.subtipo}`, t]));

  // Stats per subtipo
  const statsPorSubtipo = SUBTIPOS.map(({ key, label }) => {
    const srvs = servicios.filter((s) => s.subtipo === key);
    const total = srvs.length;
    const presentados = srvs.filter((s) => tareasMap.get(`${s.cliente_id}:${key}`)?.estado === "presentado").length;
    const conPago = srvs.filter((s) => {
      const t = tareasMap.get(`${s.cliente_id}:${key}`);
      return t && t.pago_estado !== "pendiente";
    }).length;
    return { key, label, total, presentados, conPago };
  });

  // Stats por responsable (para IVA por defecto, mostrar global)
  const respMap = new Map<string, { nombre: string; total: number; presentados: number }>();
  for (const s of servicios) {
    const rId = s.responsable_id;
    if (!rId) continue;
    const nombre = equipoMap.get(rId) ?? rId;
    if (!respMap.has(rId)) respMap.set(rId, { nombre, total: 0, presentados: 0 });
    const entry = respMap.get(rId)!;
    entry.total++;
    if (tareasMap.get(`${s.cliente_id}:${s.subtipo}`)?.estado === "presentado") entry.presentados++;
  }
  const porResponsable = Array.from(respMap.values()).sort((a, b) => b.total - a.total);

  const opciones = generarOpciones(mesDefault, anioDefault);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Impuestos</p>
          <h1 className="text-[20px] font-semibold text-gray-900">
            Dashboard — {MESES_NOMBRES[mes]} {anio}
          </h1>
        </div>
        <form method="get">
          <select
            name="mes"
            defaultValue={`${mes}`}
            className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 cursor-pointer"
            onChange={(e) => {
              void e;
            }}
          >
            {opciones.map((o) => (
              <option key={`${o.mes}-${o.anio}`} value={`${o.mes}`} data-anio={o.anio}>
                {o.label}
              </option>
            ))}
          </select>
        </form>
      </div>

      {/* Stats por sub-tipo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {statsPorSubtipo.map(({ key, label, total, presentados, conPago }) => {
          const pct = total > 0 ? Math.round((presentados / total) * 100) : 0;
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-gray-700">{label}</p>
                <span className="text-[11px] text-gray-400">{total} clientes</span>
              </div>
              <div className="flex items-end gap-3 mb-3">
                <div>
                  <p className={clsx(
                    "text-[28px] font-bold leading-none",
                    pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-gray-500"
                  )}>
                    {presentados}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">presentados</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[18px] font-semibold text-blue-600">{conPago}</p>
                  <p className="text-[11px] text-gray-400 mt-1">con pago</p>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full",
                    pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-gray-300"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{pct}% presentado</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Avance por responsable */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <TrendingUp size={14} className="text-blue-500" />
            <h2 className="text-[14px] font-semibold text-gray-900">Por responsable</h2>
            <p className="text-[11px] text-gray-400 ml-auto">todos los subtipos</p>
          </div>
          {porResponsable.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-gray-400">Sin responsables asignados</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">Presentados</th>
                  <th className="px-4 py-3 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {porResponsable.map((r) => {
                  const pct = r.total > 0 ? Math.round((r.presentados / r.total) * 100) : 0;
                  return (
                    <tr key={r.nombre} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-[11px] font-bold text-blue-700 shrink-0">
                            {r.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-medium text-gray-800">{r.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-[13px] text-gray-600">{r.total}</td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {r.presentados === r.total && r.total > 0
                            ? <CheckCircle2 size={13} className="text-emerald-500" />
                            : <Circle size={13} className="text-gray-300" />
                          }
                          <span className="text-[12px] text-gray-700">{r.presentados}</span>
                        </div>
                      </td>
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

        {/* Resumen del mes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Resumen del período</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{MESES_NOMBRES[mes]} {anio}</p>
          </div>
          <div className="p-6 space-y-4">
            {statsPorSubtipo.map(({ key, label, total, presentados, conPago }) => {
              const pendientes = total - presentados;
              const pct = total > 0 ? Math.round((presentados / total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-16 text-[11px] font-semibold text-gray-500">{label}</div>
                  <div className="flex-1">
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                      <span className="text-emerald-600 font-medium">{presentados} ok</span>
                      <span className="text-gray-400">{pendientes} pend · {conPago} pagados</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-400" : "bg-gray-300"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-10 text-right text-[12px] font-semibold text-gray-600">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
