import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getVencimientoF931 } from "@/lib/vencimientos";
import { ProductividadClient, FilaLiquidadora } from "./ProductividadClient";

function vencimientoRecibos(anio: number, mes: number): Date {
  // Deadline recibos: día 3 del mes siguiente
  const d = new Date(anio, mes, 3); // mes es 1-based, Date usa 0-based: mes = siguiente
  return d;
}

function diffDias(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function ProductividadPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/seguimiento");

  const admin = createAdminClient();

  // Períodos desde junio 2026 en adelante (antes no se usaba el sistema)
  const { data: periodos } = await admin
    .from("periodos")
    .select("id, anio, mes, nombre_mes")
    .or("anio.gt.2026,and(anio.eq.2026,mes.gte.6)")
    .order("anio", { ascending: true })
    .order("mes", { ascending: true });

  if (!periodos || periodos.length === 0) {
    return <div className="p-8 text-gray-400 text-sm">Sin períodos registrados.</div>;
  }

  const periodoIds = periodos.map((p) => p.id);

  // Tareas con timestamps y cliente
  const { data: tareas } = await admin
    .from("tareas")
    .select("cliente_id, periodo_id, f931_manual, recibos_manual, f931_manual_en, recibos_manual_en, f931_drive, recibos_drive")
    .in("periodo_id", periodoIds);

  // Clientes activos con liquidadora
  const { data: clientes } = await admin
    .from("clientes")
    .select("id, liquidador_id, terminacion_cuit")
    .eq("estado", "activo");

  // Asignaciones para resolver liquidadora histórica
  const { data: asignaciones } = await admin
    .from("asignaciones")
    .select("cliente_id, liquidador_id, desde_anio, desde_mes");

  // Liquidadoras activas
  const { data: liquidadoras } = await admin
    .from("liquidadoras")
    .select("id, nombre")
    .eq("activa", true)
    .order("nombre");

  if (!clientes || !liquidadoras || !tareas) {
    return <div className="p-8 text-gray-400 text-sm">Sin datos suficientes.</div>;
  }

  // Mapa cliente → terminacion_cuit y liquidador_id actual
  const clienteMap = new Map(clientes.map((c) => [c.id, c]));

  // Función: resolver liquidadora para un cliente en un período
  function resolverLiquidadora(clienteId: string, anio: number, mes: number): string | null {
    const cliente = clienteMap.get(clienteId);
    if (!cliente) return null;
    if (!asignaciones || asignaciones.length === 0) return cliente.liquidador_id;

    let mejor: typeof asignaciones[0] | null = null;
    for (const a of asignaciones) {
      if (a.cliente_id !== clienteId) continue;
      if (a.desde_anio * 100 + a.desde_mes > anio * 100 + mes) continue;
      if (!mejor || a.desde_anio * 100 + a.desde_mes > mejor.desde_anio * 100 + mejor.desde_mes) {
        mejor = a;
      }
    }
    return mejor ? mejor.liquidador_id : cliente.liquidador_id;
  }

  // Construir filas por liquidadora
  const tareasMap = new Map<string, typeof tareas[0]>();
  for (const t of tareas) tareasMap.set(`${t.cliente_id}:${t.periodo_id}`, t);

  const liqData = new Map<string, FilaLiquidadora>();
  for (const liq of liquidadoras) {
    liqData.set(liq.id, { id: liq.id, nombre: liq.nombre, meses: [] });
  }

  for (const periodo of periodos) {
    // Agrupar clientes por liquidadora en este período
    const porLiq = new Map<string, { terminacion: number; tarea: typeof tareas[0] | null }[]>();

    for (const cliente of clientes) {
      const liqId = resolverLiquidadora(cliente.id, periodo.anio, periodo.mes);
      if (!liqId) continue;
      if (!porLiq.has(liqId)) porLiq.set(liqId, []);
      const tarea = tareasMap.get(`${cliente.id}:${periodo.id}`) ?? null;
      porLiq.get(liqId)!.push({ terminacion: cliente.terminacion_cuit, tarea });
    }

    for (const [liqId, items] of Array.from(porLiq.entries())) {
      const entry = liqData.get(liqId);
      if (!entry) continue;

      let f931ATiempo = 0, f931Tarde = 0, f931SinTs = 0;
      let recibosATiempo = 0, recibosTarde = 0, recibosSinTs = 0;
      let completadas = 0;
      const diasF931: number[] = [];
      const diasRecibos: number[] = [];
      const vencRecibos = vencimientoRecibos(periodo.anio, periodo.mes);

      for (const { terminacion, tarea } of items) {
        if (!tarea) continue;
        const tieneF931 = tarea.f931_manual || tarea.f931_drive;
        const tieneRecibos = tarea.recibos_manual || tarea.recibos_drive;
        if (tieneF931 && tieneRecibos) completadas++;

        if (tarea.f931_manual) {
          if (tarea.f931_manual_en) {
            const venc = getVencimientoF931(terminacion, periodo.anio, periodo.mes);
            const delta = diffDias(new Date(tarea.f931_manual_en), venc);
            if (delta >= 0) f931ATiempo++; else f931Tarde++;
            diasF931.push(delta);
          } else {
            f931SinTs++;
          }
        }

        if (tarea.recibos_manual) {
          if (tarea.recibos_manual_en) {
            const delta = diffDias(new Date(tarea.recibos_manual_en), vencRecibos);
            if (delta >= 0) recibosATiempo++; else recibosTarde++;
            diasRecibos.push(delta);
          } else {
            recibosSinTs++;
          }
        }
      }

      const avgDiasF931 = diasF931.length > 0
        ? diasF931.reduce((a, b) => a + b, 0) / diasF931.length
        : null;
      const avgDiasRecibos = diasRecibos.length > 0
        ? diasRecibos.reduce((a, b) => a + b, 0) / diasRecibos.length
        : null;

      entry.meses.push({
        periodoId: periodo.id,
        anio: periodo.anio,
        mes: periodo.mes,
        total: items.length,
        f931ATiempo, f931Tarde, f931SinTs,
        recibosATiempo, recibosTarde, recibosSinTs,
        completadas,
        avgDiasF931,
        avgDiasRecibos,
      });
    }
  }

  // Solo liquidadoras con al menos 1 período con datos
  const filas = Array.from(liqData.values()).filter((f) => f.meses.some((m) => m.total > 0));

  return (
    <ProductividadClient
      filas={filas}
    />
  );
}
