import { createAdminClient } from "@/lib/supabase/admin";
import { Cliente, Tarea } from "@/types";
import { CALENDAR_2026, MESES_NOMBRES } from "@/lib/vencimientos";
import { CalendarDays } from "lucide-react";
import clsx from "clsx";

export default async function VencimientosPage() {
  const supabase = createAdminClient();
  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, terminacion_cuit")
    .eq("estado", "activo");

  const clientesList = (clientes as Pick<Cliente, "id" | "terminacion_cuit">[]) ?? [];

  // Contar empresas por grupo de terminación
  const countGrupo = (min: number, max: number) =>
    clientesList.filter((c) => c.terminacion_cuit >= min && c.terminacion_cuit <= max).length;

  const totalesPorGrupo = [
    countGrupo(0, 3),
    countGrupo(4, 6),
    countGrupo(7, 9),
  ];

  // Tareas por período para mostrar F.931 completados
  const { data: periodos } = await supabase.from("periodos").select("id, anio, mes").eq("anio", 2026);
  const { data: tareas } = await supabase
    .from("tareas")
    .select("cliente_id, periodo_id, f931_manual, f931_drive");

  const periodoMap = new Map(
    ((periodos ?? []) as { id: string; anio: number; mes: number }[]).map((p) => [
      `${p.anio}-${p.mes}`,
      p.id,
    ])
  );

  const tareasMap = new Map<string, { f931: boolean }[]>();
  for (const t of (tareas ?? []) as Tarea[]) {
    const list = tareasMap.get(t.periodo_id) ?? [];
    list.push({ f931: t.f931_manual || t.f931_drive });
    tareasMap.set(t.periodo_id, list);
  }

  function getF931Ok(mes: number, grupoIdx: number): number {
    const periodoId = periodoMap.get(`2026-${mes}`);
    if (!periodoId) return 0;
    const grupTareas = tareasMap.get(periodoId) ?? [];
    // simplificación: conta total f931 ok del período (no por grupo de terminación)
    if (grupoIdx === 0) return grupTareas.filter((t) => t.f931).length;
    return 0; // datos exactos requieren join de cliente para filtrar por terminacion
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">F.931 — ARCA</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">
          Calendario de vencimientos 2026
        </h1>
        <p className="text-sm text-gray-400 mt-2">
          Fechas oficiales para la presentación del Formulario 931 por grupo de CUIT.
        </p>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-5 mb-6 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-success" />
          Más de 7 días
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          3–7 días
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-danger" />
          Menos de 3 días / vencido
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-200" />
          Mes pasado
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-6 py-3 text-left font-medium w-32">Mes liq.</th>
              {[
                { label: "CUITs 0–3", sub: `${totalesPorGrupo[0]} empresas` },
                { label: "CUITs 4–6", sub: `${totalesPorGrupo[1]} empresas` },
                { label: "CUITs 7–9", sub: `${totalesPorGrupo[2]} empresas` },
              ].map((g) => (
                <th key={g.label} className="px-6 py-3 text-center font-medium">
                  <div>{g.label}</div>
                  <div className="text-[10px] font-normal text-gray-300 normal-case mt-0.5">
                    {g.sub}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {CALENDAR_2026.map(({ mes, nombre, grupos }) => {
              const esPasado = mes < mesActual;
              const esActual = mes === mesActual;
              return (
                <tr
                  key={mes}
                  className={clsx(
                    "transition-colors",
                    esActual ? "bg-bordo/5" : "hover:bg-gray-50/60"
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {esActual && (
                        <div className="w-1.5 h-1.5 rounded-full bg-bordo shrink-0" />
                      )}
                      <div>
                        <p
                          className={clsx(
                            "text-[13px] font-medium",
                            esPasado ? "text-gray-400" : "text-gray-900"
                          )}
                        >
                          {nombre}
                        </p>
                        {esActual && (
                          <p className="text-[10px] text-bordo font-medium">Mes actual</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {grupos.map((g, i) => {
                    const dias = Math.ceil((g.fecha.getTime() - hoy.getTime()) / 86400000);
                    const vencido = dias < 0;
                    const urgente = !vencido && dias <= 2;
                    const proximo = !vencido && dias <= 7;

                    return (
                      <td key={g.label} className="px-6 py-4 text-center">
                        <div
                          className={clsx(
                            "inline-flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs",
                            esPasado
                              ? "bg-gray-50 text-gray-400"
                              : vencido || urgente
                              ? "bg-red-50 text-danger"
                              : proximo
                              ? "bg-amber-50 text-amber-700"
                              : "bg-green-50 text-success"
                          )}
                        >
                          <span className="font-semibold">
                            {g.fecha.toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          {!esPasado && (
                            <span className="text-[10px] font-medium opacity-75">
                              {vencido
                                ? "Vencido"
                                : dias === 0
                                ? "¡Hoy!"
                                : `${dias}d`}
                            </span>
                          )}
                          {esPasado && (
                            <span className="text-[10px] opacity-60">
                              {g.fecha.toLocaleDateString("es-AR", { weekday: "short" })}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
        <CalendarDays size={12} />
        Fechas según resolución ARCA 2026. Para años futuros se usan fechas genéricas (9/10/11 del mes siguiente).
      </p>
    </div>
  );
}
