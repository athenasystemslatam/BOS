import { createAdminClient } from "@/lib/supabase/admin";
import clsx from "clsx";

const ANIOS = [2026, 2025, 2024, 2023];

export default async function ContableEquipoPage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const anio = Number(searchParams.anio) || new Date().getFullYear();
  const admin = createAdminClient();

  const [
    { data: equipoRaw },
    { data: modulosRaw },
    { data: balancesRaw },
  ] = await Promise.all([
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "contable"),
    admin
      .from("balances")
      .select("responsable_id, responsable2_id, estado, avance")
      .eq("anio_fiscal", anio),
  ]);

  const equipoIdsContable = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipo = (equipoRaw ?? []).filter((e) => equipoIdsContable.has(e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balancesRaw as any[]) ?? [];

  const stats = equipo.map((e) => {
    const asignados = balances.filter(
      (b) => b.responsable_id === e.id || b.responsable2_id === e.id
    );
    const finalizados = asignados.filter((b) => b.estado === "finalizado").length;
    const enProceso = asignados.filter(
      (b) => b.estado === "en_proceso" || b.estado === "asignado"
    ).length;
    const avanceProm =
      asignados.length > 0
        ? Math.round(asignados.reduce((s: number, b: { avance: number }) => s + (b.avance ?? 0), 0) / asignados.length)
        : 0;
    return { ...e, total: asignados.length, finalizados, enProceso, avanceProm };
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Contable</p>
          <h1 className="text-[20px] font-semibold text-gray-900">Equipo {anio}</h1>
          <p className="text-[13px] text-gray-400 mt-1">{equipo.length} miembros en el módulo contable</p>
        </div>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          {ANIOS.map((a) => (
            <a
              key={a}
              href={`/contable/equipo?anio=${a}`}
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

      {equipo.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-[13px] text-gray-400">
          No hay miembros en el módulo contable
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((e) => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-[15px] font-bold text-emerald-700 shrink-0">
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
                  <p className="text-[22px] font-bold text-emerald-600">{e.finalizados}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Finalizados</p>
                </div>
                <div className="text-center">
                  <p className={clsx(
                    "text-[22px] font-bold",
                    e.avanceProm >= 80 ? "text-emerald-600" : e.avanceProm >= 40 ? "text-amber-600" : "text-gray-400"
                  )}>
                    {e.avanceProm}%
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Avance</p>
                </div>
              </div>

              {e.total > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Progreso</span>
                    <span>{e.finalizados}/{e.total}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        e.finalizados === e.total ? "bg-emerald-500" : "bg-amber-400"
                      )}
                      style={{ width: `${Math.round((e.finalizados / e.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
