"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { ESTADOS_MES, type EstadoMes } from "@/lib/monotributo";
import { arrastreDesde, requireEditorMonotributo, ultimaFilaAnterior } from "@/lib/monotributoServer";

const DEUDA_ESTADOS = ["sin_verificar", "no", "si"] as const;
const INTIMACION_ESTADOS = ["no", "fijarse", "avisado", "si", "pago"] as const;

export type CambiosTarea = {
  cuota_estado?: EstadoMes;
  cuota_fecha?: string | null;
  recategorizacion?: "no_corresponde" | "pendiente" | "realizada";
  categoria?: string | null;
  deuda_estado?: (typeof DEUDA_ESTADOS)[number];
  deuda_periodos?: string | null;
  deuda_monto?: number | null;
  deuda_aviso?: boolean;
  deuda_aviso_fecha?: string | null;
  deuda_resuelta?: boolean;
  deuda_resuelta_fecha?: string | null;
  intimacion_estado?: (typeof INTIMACION_ESTADOS)[number] | null;
  intimacion_fecha?: string | null;
  observaciones?: string | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function upsertMonotributoTarea(clienteId: string, anio: number, mes: number, updates: CambiosTarea) {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (updates.cuota_estado && !ESTADOS_MES.includes(updates.cuota_estado)) return { error: "Estado inválido." };
  if (updates.deuda_estado && !DEUDA_ESTADOS.includes(updates.deuda_estado)) return { error: "Estado de deuda inválido." };
  if (updates.intimacion_estado && !INTIMACION_ESTADOS.includes(updates.intimacion_estado)) return { error: "Intimación inválida." };
  if (updates.deuda_monto !== undefined && updates.deuda_monto !== null && (!Number.isFinite(updates.deuda_monto) || updates.deuda_monto < 0)) {
    return { error: "Importe de deuda inválido." };
  }
  for (const k of ["cuota_fecha", "deuda_aviso_fecha", "deuda_resuelta_fecha", "intimacion_fecha"] as const) {
    const v = updates[k];
    if (v && !FECHA.test(v)) return { error: "Fecha inválida." };
  }
  if (typeof updates.deuda_periodos === "string") updates.deuda_periodos = updates.deuda_periodos.trim() || null;

  const admin = createAdminClient();
  const ahora = new Date().toISOString();

  const { data: previa } = await admin
    .from("monotributo_tareas")
    .select("cuota_estado")
    .eq("cliente_id", clienteId).eq("anio", anio).eq("mes", mes)
    .maybeSingle();
  const estadoAnterior = (previa as { cuota_estado: string } | null)?.cuota_estado ?? null;

  // Fila nueva del mes: trae deuda, intimación y categoría del mes anterior (lo que se edita ahora manda).
  let arrastre: Record<string, unknown> = {};
  if (!previa) {
    try {
      const prev = (await ultimaFilaAnterior(admin, [clienteId], anio, mes)).get(clienteId);
      arrastre = arrastreDesde(prev) ?? {};
    } catch {
      arrastre = {};
    }
  }

  // Cambio de estado del mes: queda con fecha, persona y en el historial.
  const extra: Record<string, unknown> = {};
  const cambiaEstado = !!updates.cuota_estado && estadoAnterior !== updates.cuota_estado;
  if (cambiaEstado) Object.assign(extra, { estado_cambiado_en: ahora, estado_cambiado_por: yoId, origen: "manual" });

  const { error } = await admin.from("monotributo_tareas").upsert(
    { cliente_id: clienteId, anio, mes, ...arrastre, ...updates, ...extra, updated_at: ahora },
    { onConflict: "cliente_id,anio,mes" }
  );
  if (error) return { error: error.message };

  if (cambiaEstado) {
    await admin.from("monotributo_eventos").insert({
      cliente_id: clienteId,
      anio,
      mes,
      estado_anterior: estadoAnterior,
      estado_nuevo: updates.cuota_estado,
      origen: "manual",
      creado_por: yoId,
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, estado_cambiado_en: cambiaEstado ? ahora : null };
}
