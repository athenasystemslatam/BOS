import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BACKUPS, esBackupModuloValido } from "@/lib/backups";

// Backup crudo de un tablero: un sheet por tabla, todas las columnas tal
// cual están en la base, sin formatear — para restaurar info si se pierde
// algo, no para leer prolijo (eso ya lo cubre /api/exportar).

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

// PostgREST corta en 1000 filas por defecto — tablas como tareas o
// libros_movimientos ya lo superan.
async function traerTodas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: ReturnType<typeof createAdminClient>,
  tabla: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas: Record<string, any>[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from(tabla).select("*").order("id").range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

// jsonb/array/objetos no entran directo en una celda — se guardan como texto
// para no perder el dato (ej. claves_acceso, emails_contacto).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function celda(valor: any) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return valor;
}

export async function GET(req: NextRequest, { params }: { params: { modulo: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const { modulo } = params;
  if (!esBackupModuloValido(modulo)) {
    return NextResponse.json({ error: "Tablero desconocido." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { label, tablas } = BACKUPS[modulo];
  const ahora = new Date();

  const wb = new ExcelJS.Workbook();

  const wsInfo = wb.addWorksheet("Info");
  wsInfo.columns = [{ width: 50 }];
  wsInfo.getCell("A1").value = `Backup — ${label}`;
  wsInfo.getCell("A1").font = { bold: true, size: 13 };
  wsInfo.getCell("A2").value = `Generado: ${ahora.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
  wsInfo.getCell("A2").font = { italic: true, color: { argb: "FF888888" } };
  wsInfo.getCell("A3").value = `Tablas incluidas: ${tablas.join(", ")}`;
  wsInfo.getCell("A3").alignment = { wrapText: true };

  for (const tabla of tablas) {
    const filas = await traerTodas(admin, tabla);
    // Nombre de sheet: máximo 31 caracteres, sin caracteres inválidos de Excel.
    const ws = wb.addWorksheet(tabla.slice(0, 31));

    if (filas.length === 0) {
      ws.getCell("A1").value = "(sin datos)";
      ws.getCell("A1").font = { italic: true, color: { argb: "FF888888" } };
      continue;
    }

    const columnas = Object.keys(filas[0]);
    ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 2, 12), 40) }));
    ws.getRow(1).font = { bold: true };

    for (const fila of filas) {
      const valores: Record<string, unknown> = {};
      for (const c of columnas) valores[c] = celda(fila[c]);
      ws.addRow(valores);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombreArchivo = `backup-${modulo}_${stampArchivo(ahora)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
