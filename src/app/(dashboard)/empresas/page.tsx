import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Cliente, Liquidadora } from "@/types";
import { EmpresasClient } from "./EmpresasClient";

export default async function EmpresasPage() {
  const supabase = createAdminClient();
  const yo = await getCurrentLiquidadora();

  const [{ data: liquidadoras }, { data: serviciosSueldos }, { data: rubricaTareas }] = await Promise.all([
    supabase.from("liquidadoras").select("*").eq("activa", true).order("nombre"),
    supabase.from("servicios_cliente").select("cliente_id").eq("servicio", "sueldos").eq("estado", true),
    supabase.from("tareas").select("cliente_id, periodo_id").or("rub_lsd_manual.eq.true,rub_lsd_drive.eq.true"),
  ]);

  // Módulo Sueldos: solo clientes con el servicio "sueldos" activo (no toda la
  // base de /panel-general — un cliente que solo tiene Impuestos no es de acá).
  const idsSueldos = (serviciosSueldos ?? []).map((s) => s.cliente_id);
  const { data: clientes } = idsSueldos.length > 0
    ? await supabase
        .from("clientes")
        .select("*, liquidadora:liquidadoras!liquidador_id(*)")
        .in("id", idsSueldos)
        .order("nombre")
    : { data: [] };

  const periodoIds = Array.from(new Set((rubricaTareas ?? []).map((t) => t.periodo_id)));
  const lsdHasta: Record<string, { anio: number; mes: number }> = {};

  if (periodoIds.length > 0) {
    const { data: periodos } = await supabase
      .from("periodos")
      .select("id, anio, mes")
      .in("id", periodoIds);

    const periodoMap = new Map((periodos ?? []).map((p) => [p.id, p]));
    for (const t of rubricaTareas ?? []) {
      const p = periodoMap.get(t.periodo_id);
      if (!p) continue;
      const ex = lsdHasta[t.cliente_id];
      if (!ex || p.anio * 100 + p.mes > ex.anio * 100 + ex.mes) {
        lsdHasta[t.cliente_id] = { anio: p.anio, mes: p.mes };
      }
    }
  }

  return (
    <EmpresasClient
      clientes={(clientes as (Cliente & { liquidadora: Liquidadora })[]) ?? []}
      liquidadoras={(liquidadoras as Liquidadora[]) ?? []}
      isAdmin={yo?.isAdmin ?? false}
      creadoPor={yo?.id ?? null}
      lsdHasta={lsdHasta}
    />
  );
}
