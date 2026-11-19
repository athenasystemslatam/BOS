import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BACKUPS,
  esBackupModuloValido,
  armarWorkbookBackup,
  stampArchivoBackup,
  subirBackupManualAStorage,
  limpiarBackupsManualesViejos,
  registrarTamanioBackup,
} from "@/lib/backups";

// Hermano de /api/backup/[modulo]: en vez de devolver el Excel para
// descargar, sube la misma copia a Supabase Storage (carpeta "manual/" del
// bucket "backups") — botón "Guardar copia" de BackupButton.

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { modulo: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const { modulo } = params;
  if (!esBackupModuloValido(modulo)) {
    return NextResponse.json({ error: "Tablero desconocido." }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const { label, tablas } = BACKUPS[modulo];
    const ahora = new Date();

    const wb = await armarWorkbookBackup(admin, label, tablas);
    const buffer = await wb.xlsx.writeBuffer();
    const nombreArchivo = `backup-${modulo}_${stampArchivoBackup(ahora)}.xlsx`;

    await subirBackupManualAStorage(admin, nombreArchivo, buffer);
    await limpiarBackupsManualesViejos(admin);
    // No tiene que reportar error si el backup ya se guardó bien y solo
    // falla el registro del tamaño (ej. todavía no se corrió la migración).
    registrarTamanioBackup(admin, "manual", modulo, buffer.byteLength).catch(() => {});

    return NextResponse.json({ ok: true, archivo: nombreArchivo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
