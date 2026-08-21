import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import clsx from "clsx";

const RECATEGORIZACION_MESES = new Set([2, 8]);

export default async function MonotributoEquipoPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  const esRecategorizacion = RECATEGORIZACION_MESES.has(mes);

  const [{ data: equipoRaw }, { data: modulosRaw }, { data: serviciosRaw }, { data: tareasRaw }] = await Promise.all([
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "monotributo"),
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, clientes(nombre)")
      .eq("servicio", "monotributo")
      .eq("estado", true),
    admin
      .from("monotributo_tareas")
      .select("cliente_id, cuota_estado, recategorizacion, deuda_monto")
      .eq("anio", anio)
      .eq("mes", mes),
  ]);

  const equipoIdsMonotributo = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipo = (equipoRaw ?? []).filter((e) => equipoIdsMonotributo.has(e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas = (tareasRaw as any[]) ?? [];
  const tareasMap = new Map(tareas.map((t) => [t.cliente_id, t]));

  const stats = equipo.map((e) => {
    const mis = servicios.filter((s) => s.responsable_id === e.id);
    const cuotasOk = mis.filter((s) => tareasMap.get(s.cliente_id)?.cuota_estado === "pagado").length;
    const recatOk = esRecategorizacion
      ? mis.filter((s) => tareasMap.get(s.cliente_id)?.recategorizacion === "realizada").length
      : 0;
    const conDeuda = mis.filter((s) => {
      const t = tareasMap.get(s.cliente_id);
      return t?.deuda_monto && t.deuda_monto > 0;
    }).length;
    return { ...e, total: mis.length, cuotasOk, recatOk, conDeuda };
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo</p>
        <h1 className="text-[20px] font-semibold text-gray-900">
          Equipo — {MESES_NOMBRES[mes]} {anio}
        </h1>
        <p className="text-[13px] text-gray-400 mt-1">{equipo.length} miembros en el módulo monotributo</p>
      </div>

      {equipo.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-[13px] text-gray-400">
          No hay miembros en el módulo monotributo
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((e) => {
            const pct = e.total > 0 ? Math.round((e.cuotasOk / e.total) * 100) : 0;
            return (
              <div key={e.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-[15px] font-bold text-amber-700 shrink-0">
                    {e.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">{e.nombre}</p>
                  </div>
                </div>

                <div className={clsx("grid gap-2 mb-4", esRecategorizacion ? "grid-cols-4" : "grid-cols-3")}>
                  <div className="text-center">
                    <p className="text-[20px] font-bold text-gray-900">{e.total}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Total</p>
                  </div>
                  <div className="text-center">
                    <p className={clsx("text-[20px] font-bold", pct === 100 ? "text-emerald-600" : "text-amber-600")}>
                      {e.cuotasOk}
                    </p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Cuotas</p>
                  </div>
                  {esRecategorizacion && (
                    <div className="text-center">
                      <p className="text-[20px] font-bold text-amber-600">{e.recatOk}</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Recat.</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className={clsx("text-[20px] font-bold", e.conDeuda > 0 ? "text-red-500" : "text-gray-300")}>
                      {e.conDeuda}
                    </p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Deuda</p>
                  </div>
                </div>

                {e.total > 0 && (
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                      <span>Cuotas</span>
                      <span>{e.cuotasOk}/{e.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={clsx("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-amber-400")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
