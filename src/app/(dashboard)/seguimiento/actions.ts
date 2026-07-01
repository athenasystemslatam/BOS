"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { Periodo, Tarea } from "@/types";
import { scanClientesForMonth } from "@/lib/drive";
import type { CampoManual } from "@/lib/drive";
export type { CampoManual } from "@/lib/drive";

const CAMPOS_DRIVE = [
  "rec_q1",
  "recibos",
  "f931",
  "bol_sind",
  "rub_lsd",
  "sac",
] as const;

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

export type SyncDriveResult = {
  archivosDetectados: number;
  clientesConArchivos: number;
  clientesSinCarpeta: number;
  error?: string;
};

export async function syncDrive(
  periodoId: string,
  mes: number,
  anio: number
): Promise<SyncDriveResult> {
  const supabase = createAdminClient();

  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("estado", "activo");

  if (clientesError || !clientes) {
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      clientesSinCarpeta: 0,
      error: clientesError?.message ?? "No se pudieron cargar los clientes",
    };
  }

  let results;
  try {
    results = await scanClientesForMonth(clientes, mes, anio);
  } catch (e: unknown) {
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      clientesSinCarpeta: 0,
      error: e instanceof Error ? e.message : "Error al conectar con Google Drive",
    };
  }

  let archivosDetectados = 0;
  let clientesConArchivos = 0;
  let clientesSinCarpeta = 0;

  const tareaUpserts: Record<string, unknown>[] = [];
  const driveLogRows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const result of results) {
    if (result.errorCode) {
      clientesSinCarpeta++;
    }

    const updates: Record<string, boolean> = {};
    for (const campo of CAMPOS_DRIVE) {
      updates[`${campo}_drive`] = result.encontrados.has(campo);
    }

    tareaUpserts.push({
      cliente_id: result.clienteId,
      periodo_id: periodoId,
      ...updates,
    });

    if (result.encontrados.size > 0) {
      clientesConArchivos++;
      result.encontrados.forEach((file, campo) => {
        archivosDetectados++;
        driveLogRows.push({
          cliente_id: result.clienteId,
          periodo_id: periodoId,
          archivo_nombre: file.name,
          archivo_url: file.url,
          tarea_detectada: campo,
          fecha_deteccion: now,
        });
      });
    }
  }

  // Upsert tareas in batches of 100
  for (let i = 0; i < tareaUpserts.length; i += 100) {
    await supabase
      .from("tareas")
      .upsert(tareaUpserts.slice(i, i + 100), {
        onConflict: "cliente_id,periodo_id",
      });
  }

  // Insert drive_logs
  if (driveLogRows.length > 0) {
    for (let i = 0; i < driveLogRows.length; i += 100) {
      await supabase.from("drive_logs").insert(driveLogRows.slice(i, i + 100));
    }
  }

  return { archivosDetectados, clientesConArchivos, clientesSinCarpeta };
}
