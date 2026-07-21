import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, getVencimientoF931 } from "@/lib/vencimientos";
import { fetchPeriodo } from "@/app/(dashboard)/seguimiento/actions";

const CAMPOS_DRIVE = ["rec_q1", "recibos", "f931", "bol_sind", "rub_lsd", "sac"] as const;

function dentroDeVentanaTransicion(): boolean {
  const { mes, anio } = getMesTrabajoActual();
  const mesPrev = mes === 1 ? 12 : mes - 1;
  const anioPrev = mes === 1 ? anio - 1 : anio;
  const ultimoVenc = getVencimientoF931(9, anioPrev, mesPrev);
  const transicion = new Date(ultimoVenc);
  transicion.setDate(transicion.getDate() + 3);
  transicion.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoy.getTime() - transicion.getTime()) / (1000 * 60 * 60 * 24));
  return dias >= 0 && dias < 5;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const tanda = parseInt(params.get("tanda") ?? "0");
  const total = parseInt(params.get("total") ?? "1");
  const mesParam = params.get("mes") ?? "activo";

  if (mesParam === "anterior" && !dentroDeVentanaTransicion()) {
    return NextResponse.json({ skipped: true, motivo: "Fuera de ventana de transición" });
  }

  const admin = createAdminClient();

  const { data: todos } = await admin
    .from("clientes")
    .select("id, nombre, drive_folder_id")
    .eq("estado", "activo")
    .order("id");

  if (!todos || todos.length === 0) {
    return NextResponse.json({ error: "No hay clientes activos" }, { status: 500 });
  }

  const n = todos.length;
  const inicio = Math.floor((n * tanda) / total);
  const fin = Math.floor((n * (tanda + 1)) / total);
  const clientes = todos.slice(inicio, fin);

  const { mes: mesActivo, anio: anioActivo } = getMesTrabajoActual();
  const mes = mesParam === "anterior" ? (mesActivo === 1 ? 12 : mesActivo - 1) : mesActivo;
  const anio = mesParam === "anterior" ? (mesActivo === 1 ? anioActivo - 1 : anioActivo) : anioActivo;

  const periodo = await fetchPeriodo(anio, mes);
  if (!periodo) {
    return NextResponse.json({ error: "No se pudo obtener el período" }, { status: 500 });
  }

  const { scanClientesForMonth } = await import("@/lib/drive");
  const results = await scanClientesForMonth(clientes, mes, anio);

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
    tareaUpserts.push({ cliente_id: result.clienteId, periodo_id: periodo.id, ...updates });

    if (result.encontrados.size > 0) {
      clientesConArchivos++;
      result.encontrados.forEach((file, campo) => {
        archivosDetectados++;
        driveLogRows.push({
          cliente_id: result.clienteId,
          periodo_id: periodo.id,
          archivo_nombre: file.name,
          archivo_url: file.url,
          tarea_detectada: campo,
          fecha_deteccion: now,
        });
      });
    }
    result.extras?.forEach((file, campo) => {
      driveLogRows.push({
        cliente_id: result.clienteId,
        periodo_id: periodo.id,
        archivo_nombre: file.name,
        archivo_url: file.url,
        tarea_detectada: campo,
        fecha_deteccion: now,
      });
    });
  }

  for (let i = 0; i < tareaUpserts.length; i += 100) {
    await admin.from("tareas").upsert(tareaUpserts.slice(i, i + 100), { onConflict: "cliente_id,periodo_id" });
  }

  // Delete solo los clientes de esta tanda para no borrar lo que escribió la otra tanda
  const clienteIds = clientes.map((c) => c.id);
  await admin.from("drive_log").delete().eq("periodo_id", periodo.id).in("cliente_id", clienteIds);

  for (let i = 0; i < driveLogRows.length; i += 100) {
    await admin.from("drive_log").insert(driveLogRows.slice(i, i + 100));
  }

  return NextResponse.json({
    tanda,
    total,
    mes,
    anio,
    clientesDeTanda: clientes.length,
    archivosDetectados,
    clientesConArchivos,
    errorCodes,
  });
}
