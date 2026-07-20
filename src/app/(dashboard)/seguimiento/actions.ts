"use server";

import { createAdminClient } from "@/lib/supabase/admin";

import { MESES_NOMBRES } from "@/lib/vencimientos";
import { Periodo, Tarea } from "@/types";
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
  const admin = createAdminClient();
  const { error } = await admin
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
  const admin = createAdminClient();
  const { error } = await admin
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
  const admin = createAdminClient();
  const { error } = await admin
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
  const admin = createAdminClient();
  let { data } = await admin
    .from("periodos")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  const isNew = !data;

  if (!data) {
    const { data: nuevo } = await admin
      .from("periodos")
      .upsert(
        { anio, mes, nombre_mes: `${MESES_NOMBRES[mes]} ${anio}` },
        { onConflict: "anio,mes" }
      )
      .select()
      .single();
    data = nuevo;
  }

  // Al crear un período nuevo, copiar legajos_cantidad del mes anterior
  if (isNew && data) {
    const mesPrev = mes === 1 ? 12 : mes - 1;
    const anioPrev = mes === 1 ? anio - 1 : anio;
    const { data: periodoAnterior } = await admin
      .from("periodos")
      .select("id")
      .eq("anio", anioPrev)
      .eq("mes", mesPrev)
      .maybeSingle();

    if (periodoAnterior) {
      const { data: tareasAnteriores } = await admin
        .from("tareas")
        .select("cliente_id, legajos_cantidad")
        .eq("periodo_id", periodoAnterior.id)
        .gt("legajos_cantidad", 0);

      if (tareasAnteriores && tareasAnteriores.length > 0) {
        const periodoId = (data as Periodo).id;
        await admin.from("tareas").upsert(
          tareasAnteriores.map((t) => ({
            cliente_id: t.cliente_id,
            periodo_id: periodoId,
            legajos_cantidad: t.legajos_cantidad,
          })),
          { onConflict: "cliente_id,periodo_id" }
        );
      }
    }
  }

  return data as Periodo | null;
}

export async function updateRecordatorio(
  clienteId: string,
  periodoId: string,
  recordatorio: string
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("tareas")
    .upsert(
      { cliente_id: clienteId, periodo_id: periodoId, recordatorio },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}

// Devuelve un mapa clienteId → recordatorio del período anterior al dado
export async function fetchRecordatoriosPrevios(
  periodoId: string
): Promise<Record<string, string>> {
  const admin = createAdminClient();

  const { data: periodo } = await admin
    .from("periodos")
    .select("mes, anio")
    .eq("id", periodoId)
    .single();

  if (!periodo) return {};

  const mesPrev = periodo.mes === 1 ? 12 : periodo.mes - 1;
  const anioPrev = periodo.mes === 1 ? periodo.anio - 1 : periodo.anio;

  const { data: periodoAnterior } = await admin
    .from("periodos")
    .select("id")
    .eq("anio", anioPrev)
    .eq("mes", mesPrev)
    .maybeSingle();

  if (!periodoAnterior) return {};

  const { data: tareas } = await admin
    .from("tareas")
    .select("cliente_id, recordatorio")
    .eq("periodo_id", periodoAnterior.id)
    .not("recordatorio", "is", null)
    .neq("recordatorio", "");

  if (!tareas) return {};
  return Object.fromEntries(
    tareas.map((t) => [t.cliente_id, t.recordatorio as string])
  );
}

export async function fetchTareas(periodoId: string): Promise<Tarea[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tareas")
    .select("*")
    .eq("periodo_id", periodoId);
  return (data as Tarea[]) ?? [];
}

export type SyncDriveResult = {
  archivosDetectados: number;
  clientesConArchivos: number;
  errorCodes: Record<string, number>;
  error?: string;
};

export async function syncDrive(
  periodoId: string,
  mes: number,
  anio: number
): Promise<SyncDriveResult> {
  console.log("[syncDrive] inicio — periodoId:", periodoId, "mes:", mes, "anio:", anio);
  console.log("[syncDrive] GOOGLE_SERVICE_ACCOUNT_JSON definida:", !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON, "longitud:", (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").length);

  const supabase = createAdminClient();

  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("estado", "activo");

  console.log("[syncDrive] clientes:", clientes?.length ?? 0, "error:", clientesError?.message ?? "ninguno");

  if (clientesError || !clientes) {
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      errorCodes: {},
      error: clientesError?.message ?? "No se pudieron cargar los clientes",
    };
  }

  let results;
  try {
    console.log("[syncDrive] importando drive module...");
    const { scanClientesForMonth } = await import("@/lib/drive");
    console.log("[syncDrive] llamando scanClientesForMonth...");
    results = await scanClientesForMonth(clientes, mes, anio);
    console.log("[syncDrive] scanClientesForMonth completó, resultados:", results.length);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[syncDrive] ERROR en scanClientesForMonth:", msg);
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      errorCodes: {},
      error: msg,
    };
  }

  let archivosDetectados = 0;
  let clientesConArchivos = 0;
  const errorCodes: Record<string, number> = {};

  const tareaUpserts: Record<string, unknown>[] = [];
  const driveLogRows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const result of results) {
    if (result.errorCode) {
      errorCodes[result.errorCode] = (errorCodes[result.errorCode] ?? 0) + 1;
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

  return { archivosDetectados, clientesConArchivos, errorCodes };
}
