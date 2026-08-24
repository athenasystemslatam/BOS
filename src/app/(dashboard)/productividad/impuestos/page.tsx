import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ImpuestosProductividadClient, FilaResponsableImpuestos } from "./ImpuestosProductividadClient";

// Vencimiento aproximado por subtipo (día del mes siguiente al declarado) —
// mismo criterio que /impuestos/vencimientos.
const VTO_DIA: Record<string, number> = { iva: 20, iibb: 15, seh: 10 };

function vto(subtipo: string, anio: number, mes: number): Date {
  const dia = VTO_DIA[subtipo] ?? 20;
  const m = mes === 12 ? 1 : mes + 1;
  const a = mes === 12 ? anio + 1 : anio;
  return new Date(a, m - 1, dia);
}

export default async function ProductividadImpuestosPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/impuestos");

  const admin = createAdminClient();

  const [{ data: servicios }, { data: tareas }, { data: asignaciones }, { data: liquidadoras }] =
    await Promise.all([
      admin
        .from("servicios_cliente")
        .select("cliente_id, subtipo, responsable_id")
        .eq("servicio", "impuestos")
        .eq("estado", true),
      admin
        .from("impuestos_tareas")
        .select("cliente_id, subtipo, anio, mes, estado, fecha_presentacion, pago_estado")
        .gte("anio", 2026),
      admin
        .from("asignaciones_servicio")
        .select("cliente_id, subtipo, desde_anio, desde_mes, responsable_id")
        .eq("servicio", "impuestos"),
      admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    ]);

  if (!servicios || !tareas || !liquidadoras) {
    return <div className="p-8 text-gray-400 text-sm">Sin datos suficientes.</div>;
  }

  // Períodos con datos reales, ordenados cronológicamente.
  const periodosSet = new Set(tareas.map((t) => t.anio * 100 + t.mes));
  const periodos = Array.from(periodosSet)
    .sort((a, b) => a - b)
    .map((p) => ({ anio: Math.floor(p / 100), mes: p % 100 }));

  if (periodos.length === 0) {
    return <div className="p-8 text-gray-400 text-sm">Todavía no hay datos cargados en Impuestos.</div>;
  }

  // Responsable "por defecto" de cada (cliente, subtipo) — el actual en servicios_cliente.
  const defaultResp = new Map<string, string | null>();
  for (const s of servicios) defaultResp.set(`${s.cliente_id}:${s.subtipo}`, s.responsable_id);

  // Historial de reasignaciones por (cliente, subtipo), para resolver quién
  // era responsable en cada período pasado (igual que /seguimiento con `asignaciones`).
  const historial = new Map<string, { desde_anio: number; desde_mes: number; responsable_id: string }[]>();
  for (const a of asignaciones ?? []) {
    const key = `${a.cliente_id}:${a.subtipo}`;
    if (!historial.has(key)) historial.set(key, []);
    historial.get(key)!.push(a);
  }

  function resolverResponsable(clienteId: string, subtipo: string, anio: number, mes: number): string | null {
    const key = `${clienteId}:${subtipo}`;
    const hist = historial.get(key);
    if (hist && hist.length > 0) {
      let mejor: (typeof hist)[0] | null = null;
      for (const h of hist) {
        if (h.desde_anio * 100 + h.desde_mes > anio * 100 + mes) continue;
        if (!mejor || h.desde_anio * 100 + h.desde_mes > mejor.desde_anio * 100 + mejor.desde_mes) mejor = h;
      }
      if (mejor) return mejor.responsable_id;
    }
    return defaultResp.get(key) ?? null;
  }

  const tareasMap = new Map(tareas.map((t) => [`${t.cliente_id}:${t.subtipo}:${t.anio}:${t.mes}`, t]));

  const filaMap = new Map<string, FilaResponsableImpuestos>();
  for (const l of liquidadoras) filaMap.set(l.id, { id: l.id, nombre: l.nombre, meses: [] });

  for (const periodo of periodos) {
    const porResp = new Map<string, { subtipo: string; tarea: (typeof tareas)[0] | null }[]>();

    for (const s of servicios) {
      const respId = resolverResponsable(s.cliente_id, s.subtipo, periodo.anio, periodo.mes);
      if (!respId) continue;
      if (!porResp.has(respId)) porResp.set(respId, []);
      const tarea = tareasMap.get(`${s.cliente_id}:${s.subtipo}:${periodo.anio}:${periodo.mes}`) ?? null;
      porResp.get(respId)!.push({ subtipo: s.subtipo, tarea });
    }

    for (const [respId, items] of Array.from(porResp.entries())) {
      const fila = filaMap.get(respId);
      if (!fila) continue;

      let presentados = 0, aTiempo = 0, tarde = 0, conPago = 0;
      const porSubtipo: Record<string, { total: number; presentados: number }> = {
        iva: { total: 0, presentados: 0 },
        iibb: { total: 0, presentados: 0 },
        seh: { total: 0, presentados: 0 },
      };

      for (const { subtipo, tarea } of items) {
        porSubtipo[subtipo] = porSubtipo[subtipo] ?? { total: 0, presentados: 0 };
        porSubtipo[subtipo].total++;
        if (!tarea) continue;
        if (tarea.estado === "presentado") {
          presentados++;
          porSubtipo[subtipo].presentados++;
          if (tarea.fecha_presentacion) {
            const venc = vto(subtipo, periodo.anio, periodo.mes);
            if (new Date(tarea.fecha_presentacion) <= venc) aTiempo++; else tarde++;
          }
        }
        if (tarea.pago_estado && tarea.pago_estado !== "pendiente") conPago++;
      }

      fila.meses.push({
        anio: periodo.anio,
        mes: periodo.mes,
        total: items.length,
        presentados,
        aTiempo,
        tarde,
        conPago,
        porSubtipo,
      });
    }
  }

  const filas = Array.from(filaMap.values()).filter((f) => f.meses.some((m) => m.total > 0));

  return <ImpuestosProductividadClient filas={filas} />;
}
