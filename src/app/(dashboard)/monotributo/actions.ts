"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { ESTADOS_MES, type EstadoMes } from "@/lib/monotributo";
import { requireEditorMonotributo } from "@/lib/monotributoServer";

export async function upsertMonotributoTarea(
  clienteId: string,
  anio: number,
  mes: number,
  updates: {
    cuota_estado?: EstadoMes;
    cuota_fecha?: string | null;
    recategorizacion?: "no_corresponde" | "pendiente" | "realizada";
    categoria?: string | null;
    deuda_monto?: number | null;
    deuda_aviso?: boolean;
    deuda_aviso_fecha?: string | null;
    observaciones?: string | null;
  }
) {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (updates.cuota_estado && !ESTADOS_MES.includes(updates.cuota_estado)) return { error: "Estado inválido." };

  const admin = createAdminClient();
  const ahora = new Date().toISOString();

  // Cambio de estado del mes: queda con fecha, persona y en el historial.
  let estadoAnterior: string | null = null;
  const extra: Record<string, unknown> = {};
  if (updates.cuota_estado) {
    const { data: previa } = await admin
      .from("monotributo_tareas")
      .select("cuota_estado")
      .eq("cliente_id", clienteId).eq("anio", anio).eq("mes", mes)
      .maybeSingle();
    estadoAnterior = (previa as { cuota_estado: string } | null)?.cuota_estado ?? null;
    if (estadoAnterior !== updates.cuota_estado) {
      Object.assign(extra, { estado_cambiado_en: ahora, estado_cambiado_por: yoId, origen: "manual" });
    }
  }

  const { error } = await admin.from("monotributo_tareas").upsert(
    {
      cliente_id: clienteId,
      anio,
      mes,
      ...updates,
      ...extra,
      updated_at: ahora,
    },
    { onConflict: "cliente_id,anio,mes" }
  );
  if (error) return { error: error.message };

  if (updates.cuota_estado && estadoAnterior !== updates.cuota_estado) {
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
  return { ok: true };
}
