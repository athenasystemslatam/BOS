import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import clsx from "clsx";

// Vencimiento cuota monotributo: día 20 de cada mes (mismo mes, no el siguiente)
// Meses de recategorización: febrero (mes 2) y agosto (mes 8)
const RECATEGORIZACION_MESES = new Set([2, 8]);

function vtoMes(mes: number, anio: number): Date {
  return new Date(anio, mes - 1, 20);
}

function generarCalendario(anio: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      mes: m,
      label: MESES_NOMBRES[m],
      vto: vtoMes(m, anio),
      esRecategorizacion: RECATEGORIZACION_MESES.has(m),
    };
  });
}

export default async function MonotributoVencimientosPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  const hoy = new Date();
  const esRecategorizacion = RECATEGORIZACION_MESES.has(mes);

  const [{ data: serviciosRaw }, { data: tareasRaw }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, clientes(nombre)")
      .eq("servicio", "monotributo")
      .eq("estado", true),
    admin
      .from("monotributo_tareas")
      .select("cliente_id, cuota_estado, recategorizacion, deuda_monto, deuda_aviso")
      .eq("anio", anio)
      .eq("mes", mes),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas = (tareasRaw as any[]) ?? [];
  const tareasMap = new Map(tareas.map((t) => [t.cliente_id, t]));

  const pendientesCuota = servicios.filter(
    (s) => tareasMap.get(s.cliente_id)?.cuota_estado !== "pagado"
  );
  const pendientesRecat = esRecategorizacion
    ? servicios.filter((s) => {
        const t = tareasMap.get(s.cliente_id);
        return !t || t.recategorizacion === "pendiente";
      })
    : [];

  const vto = vtoMes(mes, anio);
  const diasVto = Math.ceil((vto.getTime() - hoy.getTime()) / 86400000);
  const vencido = diasVto < 0;
  const urgente = !vencido && diasVto <= 3;
  const proximo = !vencido && diasVto <= 7;

  const calendario = generarCalendario(anio);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo</p>
          <h1 className="text-[20px] font-semibold text-gray-900">
            Vencimientos — {MESES_NOMBRES[mes]} {anio}
          </h1>
        </div>
        <div className="relative">
          <select
            value={`${mes}-${anio}`}
            className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 cursor-pointer"
            onChange={() => {}}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const m = mesDefault - i <= 0 ? mesDefault - i + 12 : mesDefault - i;
              const a = mesDefault - i <= 0 ? anioDefault - 1 : anioDefault;
              return { mes: m, anio: a };
            }).map((o) => (
              <option key={`${o.mes}-${o.anio}`} value={`${o.mes}-${o.anio}`}>
                {MESES_NOMBRES[o.mes]} {o.anio}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {/* Panel vencimiento cuota */}
        <div className={clsx(
          "md:col-span-2 rounded-xl border shadow-sm overflow-hidden",
          vencido || urgente ? "bg-red-50 border-red-200" : proximo ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"
        )}>
          <div className="px-6 py-4 border-b border-current/10">
            <h2 className="text-[15px] font-semibold text-gray-900">Cuota mensual</h2>
            <p className={clsx(
              "text-[13px] font-medium mt-0.5",
              vencido || urgente ? "text-red-600" : proximo ? "text-amber-600" : "text-gray-500"
            )}>
              Vencimiento: {vto.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              {vencido ? "vencido" : diasVto === 0 ? "hoy" : `${diasVto} días`}
            </p>
          </div>

          <div className="p-5">
            <div className="flex items-center gap-6 mb-4 text-[13px]">
              <span>
                <span className="font-semibold text-emerald-600">{servicios.length - pendientesCuota.length}</span>
                <span className="text-gray-400"> / {servicios.length} pagadas</span>
              </span>
              {pendientesCuota.length > 0 && (
                <span className="text-red-500 font-semibold">{pendientesCuota.length} pendientes</span>
              )}
            </div>

            {pendientesCuota.length === 0 ? (
              <p className="text-center text-emerald-600 font-medium py-4">Todas las cuotas pagadas ✓</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-white/80">
                    <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="py-2 text-left">Cliente</th>
                      <th className="py-2 px-4 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pendientesCuota.map((s) => (
                      <tr key={s.cliente_id} className="hover:bg-white/80">
                        <td className="py-2 text-gray-800 font-medium">{s.clientes?.nombre ?? "—"}</td>
                        <td className="py-2 px-4">
                          <span className="text-[11px] font-medium bg-amber-50 text-amber-700 rounded-full px-2.5 py-1">
                            Pendiente
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Panel recategorización */}
        <div className={clsx(
          "rounded-xl border shadow-sm overflow-hidden",
          esRecategorizacion ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"
        )}>
          <div className="px-5 py-4 border-b border-current/10">
            <h2 className="text-[14px] font-semibold text-gray-900">Recategorización</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Febrero y agosto</p>
          </div>
          <div className="p-5">
            {esRecategorizacion ? (
              <>
                <div className="flex items-center gap-4 text-[13px] mb-4">
                  <span>
                    <span className="font-semibold text-emerald-600">{servicios.length - pendientesRecat.length}</span>
                    <span className="text-gray-400"> realizadas</span>
                  </span>
                  <span className="text-amber-600 font-semibold">{pendientesRecat.length} pendientes</span>
                </div>
                {pendientesRecat.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {pendientesRecat.map((s) => (
                      <p key={s.cliente_id} className="text-[12px] text-gray-700 py-1 border-b border-amber-100 last:border-0">
                        {s.clientes?.nombre ?? "—"}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-emerald-600 font-medium text-[12px] py-4">Todas realizadas ✓</p>
                )}
              </>
            ) : (
              <div className="py-4 text-center">
                <p className="text-[13px] text-gray-400">No corresponde este mes</p>
                <p className="text-[11px] text-gray-300 mt-1">Próxima: {mes < 2 ? "febrero" : mes < 8 ? "agosto" : "febrero del año siguiente"}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendario anual */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-900">Calendario {anio}</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Cuota mensual — vencimiento día 20 de cada mes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Mes</th>
                <th className="px-4 py-3 text-left">Vencimiento cuota</th>
                <th className="px-4 py-3 text-center">Recategorización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {calendario.map((row) => {
                const dias = Math.ceil((row.vto.getTime() - hoy.getTime()) / 86400000);
                const esPasado = dias < 0;
                const esEste = row.mes === mes;
                return (
                  <tr key={row.mes} className={clsx(
                    "transition-colors",
                    esEste ? "bg-amber-50" : "hover:bg-gray-50/60"
                  )}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        {esEste && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                        <span className={clsx(
                          "font-medium",
                          esPasado ? "text-gray-400" : "text-gray-900"
                        )}>
                          {row.label}
                          {esEste && <span className="ml-2 text-[10px] text-amber-600 font-semibold">← actual</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className={clsx(
                        "inline-flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px]",
                        esPasado ? "bg-gray-50 text-gray-400" : "bg-amber-50 text-amber-700"
                      )}>
                        <span className="font-semibold">
                          {row.vto.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                        </span>
                        {!esPasado && (
                          <span className="opacity-75">
                            {dias === 0 ? "hoy" : dias > 0 ? `${dias}d` : "vencido"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {row.esRecategorizacion ? (
                        <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">
                          Recategorizar
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
