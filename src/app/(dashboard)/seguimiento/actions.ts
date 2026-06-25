"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type CampoManual =
  | "rec_q1"
  | "recibos"
  | "f931"
  | "bol_sind"
  | "rub_lsd"
  | "sac";

export async function toggleManual(
  clienteId: string,
  periodoId: string,
  campo: CampoManual,
  valor: boolean
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tareas")
    .upsert(
      {
        cliente_id: clienteId,
        periodo_id: periodoId,
        [`${campo}_manual`]: valor,
      },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}

export async function updateLegajos(
  clienteId: string,
  periodoId: string,
  cantidad: number
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tareas")
    .upsert(
      { cliente_id: clienteId, periodo_id: periodoId, legajos_cantidad: cantidad },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}

export async function updateObservaciones(
  clienteId: string,
  periodoId: string,
  observaciones: string
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tareas")
    .upsert(
      { cliente_id: clienteId, periodo_id: periodoId, observaciones },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}
