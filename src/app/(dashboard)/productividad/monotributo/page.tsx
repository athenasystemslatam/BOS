import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MonotributoProductividadClient, FilaResponsableMono } from "./MonotributoProductividadClient";

// Vencimiento cuota: día 20 del mismo mes.
function vencimientoCuota(anio: number, mes: number): Date {
  return new Date(anio, mes - 1, 20);
}

export default async function ProductividadMonotributoPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/monotributo");

  const admin = createAdminClient();

  const [{ data: servicios }, { data: tareas }, { data: asignaciones }, { data: liquidadoras }] =
    await Promise.all([
      admin
        .from("servicios_cliente")
        .select("cliente_id, responsable_id")
        .eq("servicio", "monotributo")
        .eq("estado", true),
      admin
        .from("monotributo_tareas")
        .select("cliente_id, anio, mes, cuota_estado, cuota_fecha, recategorizacion")
        .gte("anio", 2026),
      admin
        .from("asignaciones_servicio")
        .select("cliente_id, desde_anio, desde_mes, responsable_id")
        .eq("servicio", "monotributo"),
      admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    ]);

  if (!servicios || !tareas || !liquidadoras) {
    return <div className="p-8 text-gray-400 text-sm">Sin datos suficientes.</div>;
  }

  const periodosSet = new Set(tareas.map((t) => t.anio * 100 + t.mes));
  const periodos = Array.from(periodosSet)
    .sort((a, b) => a - b)
    .map((p) => ({ anio: Math.floor(p / 100), mes: p % 100 }));

  if (periodos.length === 0) {
    return <div className="p-8 text-gray-400 text-sm">Todavía no hay datos cargados en Monotributo.</div>;
  }

  const defaultResp = new Map(servicios.map((s) => [s.cliente_id, s.responsable_id]));

  const historial = new Map<string, { desde_anio: number; desde_mes: number; responsable_id: string }[]>();
  for (const a of asignaciones ?? []) {
    if (!historial.has(a.cliente_id)) historial.set(a.cliente_id, []);
    historial.get(a.cliente_id)!.push(a);
  }

  function resolverResponsable(clienteId: string, anio: number, mes: number): string | null {
    const hist = historial.get(clienteId);
    if (hist && hist.length > 0) {
      let mejor: (typeof hist)[0] | null = null;
      for (const h of hist) {
        if (h.desde_anio * 100 + h.desde_mes > anio * 100 + mes) continue;
        if (!mejor || h.desde_anio * 100 + h.desde_mes > mejor.desde_anio * 100 + mejor.desde_mes) mejor = h;
      }
      if (mejor) return mejor.responsable_id;
    }
    return defaultResp.get(clienteId) ?? null;
  }

  const tareasMap = new Map(tareas.map((t) => [`${t.cliente_id}:${t.anio}:${t.mes}`, t]));

  const filaMap = new Map<string, FilaResponsableMono>();
  for (const l of liquidadoras) filaMap.set(l.id, { id: l.id, nombre: l.nombre, meses: [] });

  for (const periodo of periodos) {
    const porResp = new Map<string, ((typeof tareas)[0] | null)[]>();

    for (const s of servicios) {
      const respId = resolverResponsable(s.cliente_id, periodo.anio, periodo.mes);
      if (!respId) continue;
      if (!porResp.has(respId)) porResp.set(respId, []);
      const tarea = tareasMap.get(`${s.cliente_id}:${periodo.anio}:${periodo.mes}`) ?? null;
      porResp.get(respId)!.push(tarea);
    }

    for (const [respId, items] of Array.from(porResp.entries())) {
      const fila = filaMap.get(respId);
      if (!fila) continue;

      let pagadas = 0, aTiempo = 0, tarde = 0, recatRealizada = 0, recatPendiente = 0;
      const venc = vencimientoCuota(periodo.anio, periodo.mes);

      for (const tarea of items) {
        if (!tarea) continue;
        if (tarea.cuota_estado === "pagado") {
          pagadas++;
          if (tarea.cuota_fecha) {
            if (new Date(tarea.cuota_fecha) <= venc) aTiempo++; else tarde++;
          }
        }
        if (tarea.recategorizacion === "realizada") recatRealizada++;
        if (tarea.recategorizacion === "pendiente") recatPendiente++;
      }

      fila.meses.push({
        anio: periodo.anio,
        mes: periodo.mes,
        total: items.length,
        pagadas,
        aTiempo,
        tarde,
        recatRealizada,
        recatPendiente,
      });
    }
  }

  const filas = Array.from(filaMap.values()).filter((f) => f.meses.some((m) => m.total > 0));

  return <MonotributoProductividadClient filas={filas} />;
}
