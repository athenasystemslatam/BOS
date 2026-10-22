import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarWorkbookBackup, stampArchivoBackup } from "@/lib/backups";

// Backup crudo de TODA la base, tabla por tabla — para poder recuperar todo
// y retomar el trabajo si algo se pierde (Seguimiento, Equipo, Productividad
// y cualquier otra cosa quedan adentro porque son vistas de las mismas
// tablas que ya cubre esto, no hace falta un botón aparte por pantalla).
//
// La lista de tablas se resuelve en el momento contra la base (función SQL
// listar_tablas_backup, ver supabase/add_listar_tablas_backup.sql) en vez de
// estar hardcodeada, para no desactualizarse si se renombra o borra una
// tabla (como pasó con "equipo" → "liquidadoras").

export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: tablasRaw, error } = await admin.rpc("listar_tablas_backup");
  if (error) {
    return NextResponse.json(
      {
        error:
          "No se pudo listar las tablas de la base. Falta correr supabase/add_listar_tablas_backup.sql en el SQL Editor de Supabase. " +
          error.message,
      },
      { status: 500 }
    );
  }

  const tablas = ((tablasRaw ?? []) as { tablename: string }[]).map((t) => t.tablename);
  const ahora = new Date();

  const wb = await armarWorkbookBackup(admin, "Sistema completo (BOS)", tablas);
  const buffer = await wb.xlsx.writeBuffer();
  const nombreArchivo = `backup-completo_${stampArchivoBackup(ahora)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
