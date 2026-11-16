import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { contarTodasLasTablas, compararYGuardarFoto, type Anomalia } from "@/lib/monitoreoCrecimiento";

// Chequeo semanal de crecimiento de la base: cuenta filas por tabla,
// compara contra la foto de la semana anterior y manda un mail SOLO si
// algo creció o cayó de forma rara (ver umbrales en monitoreoCrecimiento.ts)
// — si todo está dentro de lo esperado, no manda nada, para no generar
// ruido semana a semana.
export const maxDuration = 60;

function formatearAnomalia(a: Anomalia): string {
  const signo = a.cambioPct >= 0 ? "+" : "";
  const pct = `${signo}${(a.cambioPct * 100).toFixed(0)}%`;
  const icono = a.tipo === "crecimiento" ? "📈" : "📉";
  return `${icono} <strong>${a.tabla}</strong>: ${a.anterior} → ${a.actual} filas (${pct})`;
}

async function avisarFalla(motivo: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!process.env.RESEND_API_KEY || !adminEmail) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "bos@kmaconsultores.com.ar",
      to: adminEmail,
      subject: "⚠ Chequeo de crecimiento BOS — falló",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
          <h2 style="font-size:16px;color:#c0392b">BOS — el chequeo de crecimiento falló</h2>
          <p style="font-size:14px">${motivo}</p>
        </div>
      `,
    });
  } catch {
    // Sin más red de contención acá — queda el aviso del workflow de GitHub Actions.
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: tablasRaw, error } = await admin.rpc("listar_tablas_backup");
    if (error) throw new Error(`No se pudo listar tablas: ${error.message}`);

    const tablas = ((tablasRaw ?? []) as { tablename: string }[])
      .map((t) => t.tablename)
      // El log de monitoreo no se monitorea a sí mismo — crece todas las
      // semanas por diseño (una fila por tabla cada corrida).
      .filter((t) => t !== "monitoreo_crecimiento");

    const conteos = await contarTodasLasTablas(admin, tablas);
    const anomalias = await compararYGuardarFoto(admin, conteos);

    if (anomalias.length > 0) {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (process.env.RESEND_API_KEY && adminEmail) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "bos@kmaconsultores.com.ar",
          to: adminEmail,
          subject: `⚠ BOS — crecimiento inusual en ${anomalias.length} tabla${anomalias.length === 1 ? "" : "s"}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
              <h2 style="font-size:16px">BOS — chequeo semanal de crecimiento</h2>
              <p style="font-size:14px">Comparado con la semana pasada, estas tablas cambiaron más de lo esperado:</p>
              <ul style="font-size:13px;line-height:1.6">
                ${anomalias.map((a) => `<li>${formatearAnomalia(a)}</li>`).join("")}
              </ul>
              <p style="font-size:12px;color:#888">No significa necesariamente un problema — puede ser una carga masiva esperada. Es solo para que lo tengas en el radar.</p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ ok: true, tablas: tablas.length, anomalias: anomalias.length });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Error desconocido";
    await avisarFalla(motivo);
    return NextResponse.json({ error: motivo }, { status: 500 });
  }
}
