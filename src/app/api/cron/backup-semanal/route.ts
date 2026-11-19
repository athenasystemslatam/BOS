import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarWorkbookBackup, limpiarBackupsViejos, stampArchivoBackup, subirBackupAStorage } from "@/lib/backups";

export const maxDuration = 60;

// Si algo de lo de abajo tira (listar tablas, armar el Excel, subirlo a
// Storage, limpiar los viejos, mandar el mail), este catch avisa por mail
// de que el backup semanal falló — además de que el workflow de GitHub
// Actions abre un issue si el curl devuelve error (ver backup-semanal.yml).
// Sin esto, un error a mitad de camino quedaba en el log de Vercel nada más
// y nadie se enteraba hasta buscarlo.
async function avisarFalla(motivo: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!process.env.RESEND_API_KEY || !adminEmail) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "bos@kmaconsultores.com.ar",
      to: adminEmail,
      subject: "⚠ Backup semanal BOS — falló",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
          <h2 style="font-size:16px;color:#c0392b">BOS — el backup semanal falló</h2>
          <p style="font-size:14px">${motivo}</p>
          <p style="font-size:12px;color:#888">Revisar el log en Vercel (Functions → /api/cron/backup-semanal) o reintentar manualmente desde GitHub Actions → Backup Semanal → Run workflow.</p>
        </div>
      `,
    });
  } catch {
    // Si ni esto se puede mandar, no hay más red de contención acá —
    // queda en pie el aviso del workflow de GitHub Actions.
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!process.env.RESEND_API_KEY || !adminEmail) {
    return NextResponse.json({ error: "RESEND_API_KEY o ADMIN_EMAIL no configurados" }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    const { data: tablasRaw, error } = await admin.rpc("listar_tablas_backup");
    if (error) throw new Error(`No se pudo listar tablas: ${error.message}`);

    const tablas = ((tablasRaw ?? []) as { tablename: string }[]).map((t) => t.tablename);
    const ahora = new Date();
    const wb = await armarWorkbookBackup(admin, "Sistema completo (BOS)", tablas);
    const buffer = await wb.xlsx.writeBuffer();
    const totalFilas = Object.values(wb.filasPorTabla).reduce((a, b) => a + b, 0);
    const nombreArchivo = `backup-completo_${stampArchivoBackup(ahora)}.xlsx`;

    // Copia durable en Storage (no depende de que alguien archive el mail)
    // + se borran las más viejas para no acumular para siempre.
    await subirBackupAStorage(admin, nombreArchivo, buffer);
    await limpiarBackupsViejos(admin);

    const fechaLegible = ahora.toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: "bos@kmaconsultores.com.ar",
      to: adminEmail,
      subject: `Backup semanal BOS — ${fechaLegible}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
          <h2 style="font-size:16px">BOS — Backup semanal automático</h2>
          <p style="font-size:14px">Backup completo generado el <strong>${fechaLegible}</strong>. Adjunto el Excel con todas las tablas del sistema.</p>
          <p style="font-size:12px;color:#888">Llega todos los domingos a las 7 AM (hora Argentina). Además queda guardado en Supabase Storage (bucket "backups"), que conserva automáticamente las últimas 12 copias — no hace falta archivar este mail a mano.</p>
          <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
        </div>
      `,
      attachments: [{ filename: nombreArchivo, content: Buffer.from(buffer) }],
    });

    if (emailError) throw new Error(emailError.message);

    // Tablas que no se pudieron copiar: el archivo igual se guardó, pero el cron tiene que fallar y avisar.
    if (wb.errores.length) {
      throw new Error(`El backup se guardó (${nombreArchivo}) pero ${wb.errores.length} tabla(s) no se pudieron copiar: ${wb.errores.join(" · ")}`);
    }

    return NextResponse.json({ ok: true, archivo: nombreArchivo, tablas: tablas.length, filas: totalFilas, destinatario: adminEmail });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Error desconocido";
    await avisarFalla(motivo);
    return NextResponse.json({ error: motivo }, { status: 500 });
  }
}
