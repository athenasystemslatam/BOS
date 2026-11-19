import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  armarWorkbookBackup,
  stampArchivoBackup,
  subirBackupManualAStorage,
  limpiarBackupsManualesViejos,
  registrarTamanioBackup,
} from "@/lib/backups";

// Hermano de /api/backup/completo: en vez de devolver el Excel para
// descargar, sube la misma copia a Supabase Storage (carpeta "manual/" del
// bucket "backups") — botón "Guardar copia" de BackupButton.

export const maxDuration = 60;

export async function POST() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: tablasRaw, error } = await admin.rpc("listar_tablas_backup");
    if (error) throw new Error(`No se pudo listar tablas: ${error.message}`);

    const tablas = ((tablasRaw ?? []) as { tablename: string }[]).map((t) => t.tablename);
    const ahora = new Date();

    const wb = await armarWorkbookBackup(admin, "Sistema completo (BOS)", tablas);
    const buffer = await wb.xlsx.writeBuffer();
    const nombreArchivo = `backup-completo_${stampArchivoBackup(ahora)}.xlsx`;

    await subirBackupManualAStorage(admin, nombreArchivo, buffer);
    await limpiarBackupsManualesViejos(admin);
    // No tiene que reportar error si el backup ya se guardó bien y solo
    // falla el registro del tamaño (ej. todavía no se corrió la migración).
    registrarTamanioBackup(admin, "manual", "completo", buffer.byteLength).catch(() => {});

    return NextResponse.json({ ok: true, archivo: nombreArchivo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
