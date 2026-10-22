import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BACKUPS, esBackupModuloValido, armarWorkbookBackup, stampArchivoBackup } from "@/lib/backups";

// Backup crudo de un tablero puntual: un sheet por tabla, todas las columnas
// tal cual están en la base, sin formatear — para restaurar info si se
// pierde algo, no para leer prolijo (eso ya lo cubre /api/exportar). Para
// todo el sistema junto, ver /api/backup/completo.

export const maxDuration = 60;

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

  const wb = await armarWorkbookBackup(admin, label, tablas);
  const buffer = await wb.xlsx.writeBuffer();
  const nombreArchivo = `backup-${modulo}_${stampArchivoBackup(ahora)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
