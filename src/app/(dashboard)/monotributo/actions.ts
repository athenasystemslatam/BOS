"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { ESTADOS_MES, type EstadoMes } from "@/lib/monotributo";
import { CAMPOS_ARRASTRE, arrastreDesde, requireEditorMonotributo, ultimaFilaAnterior } from "@/lib/monotributoServer";
import { diferencias, registrarHistorial } from "@/lib/monotributoHistorial";

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
  deuda_nota?: string | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const CAMPOS_TAREA = [
  "cuota_estado", "cuota_fecha", "recategorizacion", "categoria", "deuda_estado", "deuda_periodos", "deuda_monto",
  "deuda_aviso", "deuda_aviso_fecha", "deuda_resuelta", "deuda_resuelta_fecha", "intimacion_estado", "intimacion_fecha", "observaciones",
  "deuda_nota",
] as const;

const iguales = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Categoría, deuda e intimación pasan solas a los meses siguientes. Si esos meses ya tenían
 * fila creada, el cambio se copia a los que todavía tenían el valor viejo (hasta el primero que
 * alguien haya cambiado a mano). Queda en el historial y el "Deshacer" lo revierte también. */
async function propagarAMesesSiguientes(
  admin: ReturnType<typeof createAdminClient>,
  clienteId: string,
  anio: number,
  mes: number,
  antes: Record<string, unknown>,
  updates: Record<string, unknown>,
  yoId: string
): Promise<string[]> {
  const campos = (CAMPOS_ARRASTRE as readonly string[]).filter((k) => k in updates && !iguales(antes[k], updates[k]));
  if (!campos.length) return [];
  const { data } = await admin
    .from("monotributo_tareas")
    .select("*")
    .eq("cliente_id", clienteId)
    .or(`anio.gt.${anio},and(anio.eq.${anio},mes.gt.${mes})`)
    .order("anio").order("mes");
  const siguientes = (data ?? []) as Record<string, unknown>[];
  const sigue = new Set(campos);
  const ids: string[] = [];
  for (const fila of siguientes) {
    const patch: Record<string, unknown> = {};
    for (const k of Array.from(sigue)) {
      if (iguales(fila[k], antes[k])) patch[k] = updates[k];
      else sigue.delete(k); // alguien lo cambió en ese mes: de ahí en adelante no se toca
    }
    if (!Object.keys(patch).length) break;
    const { error } = await admin.from("monotributo_tareas").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("cliente_id", clienteId).eq("anio", fila.anio as number).eq("mes", fila.mes as number);
    if (error) break;
    ids.push(...(await registrarHistorial(admin, Object.keys(patch).map((k) => ({
      cliente_id: clienteId, anio: fila.anio as number, mes: fila.mes as number, entidad: "tarea" as const, campo: k,
      valor_anterior: fila[k] ?? null, valor_nuevo: patch[k], usuario_id: yoId, nota: `Pasa desde ${String(mes).padStart(2, "0")}/${anio}`,
    })))));
  }
  return ids;
}

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
  if (typeof updates.deuda_nota === "string") updates.deuda_nota = updates.deuda_nota.trim().slice(0, 1000) || null;

  const admin = createAdminClient();
  const ahora = new Date().toISOString();

  const { data: previa } = await admin
    .from("monotributo_tareas")
    .select("*")
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

  const fila = { cliente_id: clienteId, anio, mes, ...arrastre, ...updates, ...extra, updated_at: ahora };
  let { error } = await admin.from("monotributo_tareas").upsert(fila, { onConflict: "cliente_id,anio,mes" });
  // Si todavía no se corrió add_monotributo_deuda_nota.sql, se guarda todo menos la nota (no se pierde el resto).
  if (error && /deuda_nota/.test(error.message)) {
    const { deuda_nota: _sinNota, ...resto } = fila as Record<string, unknown>;
    void _sinNota;
    delete updates.deuda_nota;
    ({ error } = await admin.from("monotributo_tareas").upsert(resto, { onConflict: "cliente_id,anio,mes" }));
  }
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

  // Historial (para Deshacer / Revertir): un registro por campo que cambió.
  // Si la fila no existía, el "antes" son los valores por defecto de la tabla (así Revertir no deja NULL donde no se puede).
  const antes = (previa as Record<string, unknown> | null) ?? {
    cuota_estado: "pendiente", deuda_estado: "sin_verificar", deuda_aviso: false, deuda_resuelta: false,
    recategorizacion: "no_corresponde", ...arrastre,
  };
  const historialIds = await registrarHistorial(
    admin,
    diferencias({ cliente_id: clienteId, anio, mes, entidad: "tarea", usuario_id: yoId }, antes, updates as Record<string, unknown>, CAMPOS_TAREA)
  );
  historialIds.push(...(await propagarAMesesSiguientes(admin, clienteId, anio, mes, antes, updates as Record<string, unknown>, yoId)));

  revalidatePath("/", "layout");
  return { ok: true, estado_cambiado_en: cambiaEstado ? ahora : null, historialIds };
}
