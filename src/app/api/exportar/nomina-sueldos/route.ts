import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Exportación de nómina por empresa a Excel, para un período puntual — la
// pide Cobranzas (Andrea) para facturar, por eso el acceso no exige permiso
// de edición: alcanza con poder VER Sueldos (admin, área sueldos, o el rol
// Cobranzas, que ve todos los módulos sin poder tocar nada).

function generadoEn(d: Date) {
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function stampArchivo(d: Date) {
  return d
    .toLocaleString("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    })
    .replace(" ", "_")
    .replace(":", "-");
}

export async function GET(req: NextRequest) {
  const yo = await getCurrentLiquidadora();
  if (!yo) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!yo.isAdmin && !yo.esCobranzas) {
    const areas = await getAreasDelUsuario();
    if (!areas.includes("sueldos")) {
      return NextResponse.json({ error: "No tenés acceso a Sueldos." }, { status: 401 });
    }
  }

  const periodoId = req.nextUrl.searchParams.get("periodo_id");
  if (!periodoId) {
    return NextResponse.json({ error: "Falta el período." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: periodo, error: errPeriodo } = await admin
    .from("periodos")
    .select("anio, mes, nombre_mes")
    .eq("id", periodoId)
    .maybeSingle();

  if (errPeriodo || !periodo) {
    return NextResponse.json({ error: "No se encontró el período." }, { status: 404 });
  }

  const { data: serviciosSueldos } = await admin
    .from("servicios_cliente")
    .select("cliente_id")
    .eq("servicio", "sueldos")
    .eq("estado", true);
  const idsSueldos = (serviciosSueldos ?? []).map((s) => s.cliente_id);

  const [{ data: clientes }, { data: tareas }] = await Promise.all([
    idsSueldos.length > 0
      ? admin.from("clientes").select("id, nombre").eq("estado", "activo").in("id", idsSueldos).order("nombre")
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    idsSueldos.length > 0
      ? admin.from("tareas").select("cliente_id, legajos_cantidad").eq("periodo_id", periodoId)
      : Promise.resolve({ data: [] as { cliente_id: string; legajos_cantidad: number }[] }),
  ]);

  const legajosPorCliente = new Map((tareas ?? []).map((t) => [t.cliente_id, t.legajos_cantidad ?? 0]));

  const ahora = new Date();
  const tituloMes = `${periodo.nombre_mes} ${periodo.anio}`;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Nómina");
  ws.columns = [{ width: 40 }, { width: 14 }];

  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = `Nómina de Sueldos — ${tituloMes}`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.mergeCells("A2:B2");
  ws.getCell("A2").value = `Generado: ${generadoEn(ahora)}`;
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF888888" } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  const headerRow = ws.getRow(3);
  headerRow.values = ["Empresa", "Nómina"];
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center" };

  for (const c of clientes ?? []) {
    const fila = ws.addRow([c.nombre, legajosPorCliente.get(c.id) ?? 0]);
    fila.getCell(2).alignment = { horizontal: "center" };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombreArchivo = `nomina-sueldos_${periodo.anio}-${String(periodo.mes).padStart(2, "0")}_${stampArchivo(ahora)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
