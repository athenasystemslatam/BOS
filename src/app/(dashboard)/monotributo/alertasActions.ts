"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { reabrirAlertaResuelta, requireEditorMonotributo } from "@/lib/monotributoServer";
import { registrarHistorial } from "@/lib/monotributoHistorial";
import { TIPOS_CON_RESUELTA, type TipoAlerta } from "@/lib/monotributoAlertasTipos";

/** "Resuelta" para alertas que no se cierran solas. Queda quién y cuándo (y en el
 * historial); si el valor que la disparó cambia, la alerta vuelve a aparecer. */
export async function marcarAlertaResuelta(
  items: { clienteId: string; tipo: TipoAlerta; valor: string | null }[],
  anio: number,
  mes: number,
  nota: string | null
): Promise<{ error: string } | { ok: true; historialIds: string[] }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const notaLimpia = (nota ?? "").trim().slice(0, 500) || null;
  const filas = items
    .filter((i) => TIPOS_CON_RESUELTA.includes(i.tipo))
    .map((i) => ({ cliente_id: i.clienteId, tipo: i.tipo, anio, mes, valor: i.valor, nota: notaLimpia, resuelta_por: yoId }));
  if (!filas.length) return { ok: true, historialIds: [] };

  const admin = createAdminClient();
  const { data, error } = await admin.from("monotributo_alertas_resueltas").insert(filas).select("id, cliente_id, tipo, valor");
  if (error) {
    return {
      error: /monotributo_alertas_resueltas/.test(error.message)
        ? "Falta correr el SQL de la etapa 7 (add_monotributo_etapa7.sql) para poder marcar Resuelta."
        : error.message,
    };
  }
  const historialIds = await registrarHistorial(admin, ((data ?? []) as { id: string; cliente_id: string; tipo: string; valor: string | null }[]).map((r) => ({
    cliente_id: r.cliente_id, anio, mes, entidad: "alerta" as const, campo: r.tipo,
    valor_anterior: { estado: "pendiente" }, valor_nuevo: { estado: "resuelta", valor: r.valor },
    usuario_id: yoId, ref_id: r.id, nota: notaLimpia,
  })));
  revalidatePath("/monotributo", "layout");
  return { ok: true, historialIds };
}

/** "Reabrir" una alerta marcada Resuelta por error. Queda en el historial. */
export async function reabrirAlerta(id: string): Promise<{ error: string } | { ok: true; historialIds: string[] }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const r = await reabrirAlertaResuelta(createAdminClient(), id, yoId);
  if ("error" in r) return r;
  revalidatePath("/monotributo", "layout");
  return { ok: true, historialIds: r.historialIds };
}
