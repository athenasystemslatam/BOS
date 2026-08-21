import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import clsx from "clsx";

const SUBTIPO_LABEL: Record<string, string> = { iva: "IVA", iibb: "IIBB", seh: "Seg. e Hig." };

export default async function ImpuestosEquipoPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();

  const [{ data: equipoRaw }, { data: modulosRaw }, { data: serviciosRaw }, { data: tareasRaw }] = await Promise.all([
    admin.from("equipo").select("id, nombre").eq("activo", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "impuestos"),
    admin
      .from("servicios_cliente")
      .select("cliente_id, subtipo, responsable_id, clientes(nombre)")
      .eq("servicio", "impuestos")
      .eq("estado", true),
    admin
      .from("impuestos_tareas")
      .select("cliente_id, subtipo, estado, pago_estado")
      .eq("anio", anio)
      .eq("mes", mes),
  ]);

  const equipoIdsImpuestos = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipo = (equipoRaw ?? []).filter((e) => equipoIdsImpuestos.has(e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas = (tareasRaw as any[]) ?? [];

  const tareasMap = new Map(tareas.map((t) => [`${t.cliente_id}:${t.subtipo}`, t]));

  const stats = equipo.map((e) => {
    const misServicios = servicios.filter((s) => s.responsable_id === e.id);
    const presentados = misServicios.filter(
      (s) => tareasMap.get(`${s.cliente_id}:${s.subtipo}`)?.estado === "presentado"
    ).length;

    const porSubtipo = ["iva", "iibb", "seh"].map((sub) => {
      const srvs = misServicios.filter((s) => s.subtipo === sub);
      const ok = srvs.filter((s) => tareasMap.get(`${s.cliente_id}:${sub}`)?.estado === "presentado").length;
      return { sub, label: SUBTIPO_LABEL[sub], total: srvs.length, ok };
    }).filter((x) => x.total > 0);

    return { ...e, total: misServicios.length, presentados, porSubtipo };
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Impuestos</p>
        <h1 className="text-[20px] font-semibold text-gray-900">
          Equipo — {MESES_NOMBRES[mes]} {anio}
        </h1>
        <p className="text-[13px] text-gray-400 mt-1">{equipo.length} miembros en el módulo impuestos</p>
      </div>

      {equipo.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-[13px] text-gray-400">
          No hay miembros en el módulo impuestos
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((e) => {
            const pct = e.total > 0 ? Math.round((e.presentados / e.total) * 100) : 0;
            return (
              <div key={e.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[15px] font-bold text-blue-700 shrink-0">
                    {e.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">{e.nombre}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center">
                    <p className="text-[22px] font-bold text-gray-900">{e.total}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[22px] font-bold text-emerald-600">{e.presentados}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Presentados</p>
                  </div>
                  <div className="text-center">
                    <p className={clsx(
                      "text-[22px] font-bold",
                      pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-gray-400"
                    )}>
                      {pct}%
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Avance</p>
                  </div>
                </div>

                {e.porSubtipo.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-gray-50">
                    {e.porSubtipo.map(({ sub, label, total, ok }) => {
                      const p = total > 0 ? Math.round((ok / total) * 100) : 0;
                      return (
                        <div key={sub} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 w-20 shrink-0">{label}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={clsx("h-full rounded-full", p === 100 ? "bg-emerald-500" : "bg-blue-400")}
                              style={{ width: `${p}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-500 shrink-0">{ok}/{total}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {e.total === 0 && (
                  <p className="text-center text-[12px] text-gray-300 py-2">Sin clientes asignados</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
