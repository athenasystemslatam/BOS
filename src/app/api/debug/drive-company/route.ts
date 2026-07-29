import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nombre = req.nextUrl.searchParams.get("nombre") ?? "";
  if (!nombre) {
    return NextResponse.json({ error: "Param 'nombre' requerido" }, { status: 400 });
  }

  const mes = parseInt(req.nextUrl.searchParams.get("mes") ?? "0");
  const anio = parseInt(req.nextUrl.searchParams.get("anio") ?? "0");
  if (!mes || !anio) {
    return NextResponse.json({ error: "Params 'mes' y 'anio' requeridos" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: clientes } = await admin
    .from("clientes")
    .select("id, nombre, drive_folder_id")
    .ilike("nombre", `%${nombre}%`)
    .limit(5);

  if (!clientes || clientes.length === 0) {
    return NextResponse.json({ error: `No se encontró empresa con nombre '${nombre}'` }, { status: 404 });
  }

  const { scanClientesForMonth } = await import("@/lib/drive");

  const results = [];
  for (const c of clientes) {
    const [result] = await scanClientesForMonth([c], mes, anio);
    results.push({
      id: c.id,
      nombre: c.nombre,
      drive_folder_id: c.drive_folder_id,
      errorCode: result.errorCode ?? null,
      encontrados: Object.fromEntries(result.encontrados),
      extras: Object.fromEntries(result.extras ?? new Map()),
    });
  }

  return NextResponse.json({ mes, anio, results }, { status: 200 });
}
