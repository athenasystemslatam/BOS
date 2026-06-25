"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { Periodo, Tarea } from "@/types";

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

export async function fetchPeriodo(
  anio: number,
  mes: number
): Promise<Periodo | null> {
  const supabase = createAdminClient();
  let { data } = await supabase
    .from("periodos")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();
  if (!data) {
    const { data: nuevo } = await supabase
      .from("periodos")
      .upsert(
        { anio, mes, nombre_mes: `${MESES_NOMBRES[mes]} ${anio}` },
        { onConflict: "anio,mes" }
      )
      .select()
      .single();
    data = nuevo;
  }
  return data as Periodo | null;
}

export async function fetchTareas(periodoId: string): Promise<Tarea[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tareas")
    .select("*")
    .eq("periodo_id", periodoId);
  return (data as Tarea[]) ?? [];
}
