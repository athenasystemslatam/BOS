import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Solo lectura: no escribe en Drive ni en la base. Temporal — borrar cuando termine la auditoría.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const liquidadora = req.nextUrl.searchParams.get("liquidadora") ?? "";
  const nombre = req.nextUrl.searchParams.get("nombre") ?? "";
  if (!liquidadora && !nombre) {
    return NextResponse.json({ error: "Indicá 'liquidadora' o 'nombre'" }, { status: 400 });
  }

  const mes = parseInt(req.nextUrl.searchParams.get("mes") ?? "0");
  const anio = parseInt(req.nextUrl.searchParams.get("anio") ?? "0");
  if (!mes || !anio) {
    return NextResponse.json({ error: "Params 'mes' y 'anio' requeridos" }, { status: 400 });
  }

  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "12") || 12, 1), 25);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") ?? "0") || 0, 0);

  const admin = createAdminClient();

  let query = admin
    .from("clientes")
    .select("id, nombre, drive_folder_id", { count: "exact" })
    .eq("estado", "activo")
    .order("nombre");

  if (liquidadora) {
    const { data: liqs } = await admin.from("liquidadoras").select("id").ilike("nombre", `%${liquidadora}%`);
    const ids = (liqs ?? []).map((l) => l.id);
    if (ids.length === 0) {
      return NextResponse.json({ error: `No se encontró liquidadora '${liquidadora}'` }, { status: 404 });
    }
    query = query.in("liquidador_id", ids);
  }
  if (nombre) query = query.ilike("nombre", `%${nombre}%`);

  const { data: clientes, count } = await query.range(offset, offset + limit - 1);
  if (!clientes || clientes.length === 0) {
    return NextResponse.json({ error: "Sin clientes para ese filtro", total: count ?? 0 }, { status: 404 });
  }

  const { auditarClientes } = await import("@/lib/drive");
  const resultados = await auditarClientes(clientes, mes, anio);

  const resumen: Record<string, number> = {};
  for (const r of resultados) {
    const k = r.errorCode ?? "ok";
    resumen[k] = (resumen[k] ?? 0) + 1;
  }

  const total = count ?? clientes.length;
  const siguiente = offset + limit < total ? offset + limit : null;

  return NextResponse.json({ mes, anio, total, offset, siguienteOffset: siguiente, resumen, resultados }, { status: 200 });
}
