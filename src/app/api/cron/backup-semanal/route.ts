import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarWorkbookBackup, stampArchivoBackup } from "@/lib/backups";

export const maxDuration = 60;

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

  const admin = createAdminClient();
  const { data: tablasRaw, error } = await admin.rpc("listar_tablas_backup");
  if (error) {
    return NextResponse.json({ error: `No se pudo listar tablas: ${error.message}` }, { status: 500 });
  }

  const tablas = ((tablasRaw ?? []) as { tablename: string }[]).map((t) => t.tablename);
  const ahora = new Date();
  const wb = await armarWorkbookBackup(admin, "Sistema completo (BOS)", tablas);
  const buffer = await wb.xlsx.writeBuffer();
  const nombreArchivo = `backup-completo_${stampArchivoBackup(ahora)}.xlsx`;

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
        <p style="font-size:12px;color:#888">Llega todos los domingos a las 7 AM (hora Argentina). Guardá los últimos 8 para tener 2 meses de historial.</p>
        <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
      </div>
    `,
    attachments: [{ filename: nombreArchivo, content: Buffer.from(buffer) }],
  });

  if (emailError) {
    return NextResponse.json({ error: emailError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, archivo: nombreArchivo, tablas: tablas.length, destinatario: adminEmail });
}
