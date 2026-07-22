import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { ReporteData, ReportePDF } from "@/lib/pdf-reporte";

const REPORTE_EMAIL = "estudiokma@gmail.com";
const FROM = "onboarding@resend.dev";

export async function GET(req: NextRequest) {
  console.log("[Reporte] endpoint llamado");
  try {
    const auth = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });
    }

    const { mes: mesActivo, anio: anioActivo } = getMesTrabajoActual();
    const mes = mesActivo === 1 ? 12 : mesActivo - 1;
    const anio = mesActivo === 1 ? anioActivo - 1 : anioActivo;
    const mesNombre = MESES_NOMBRES[mes];
    const nombrePeriodo = `${mesNombre} ${anio}`;
    console.log(`[Reporte] período: ${nombrePeriodo}`);

    const admin = createAdminClient();

    const { data: periodo } = await admin
      .from("periodos")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes)
      .maybeSingle();

    if (!periodo) {
      return NextResponse.json({ error: `No existe el período ${nombrePeriodo}` }, { status: 404 });
    }

    const { data: clientes } = await admin
      .from("clientes")
      .select("id, nombre, liquidador_id")
      .eq("estado", "activo")
      .order("nombre");

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ error: "No hay clientes activos" }, { status: 500 });
    }

    const { data: tareas } = await admin
      .from("tareas")
      .select("*")
      .eq("periodo_id", periodo.id);

    const { data: liquidadoras } = await admin
      .from("liquidadoras")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre");

    const tareasMap = new Map((tareas ?? []).map((t) => [t.cliente_id, t]));
    const liqMap = new Map((liquidadoras ?? []).map((l) => [l.id, l.nombre]));

    const total = clientes.length;
    let completadas = 0;
    let enProceso = 0;

    type PendEmpresa = { nombre: string; falta: string[] };
    const empresasPendientes: PendEmpresa[] = [];

    type LiqStats = { nombre: string; total: number; recibosOk: number; f931Ok: number; pendientes: number };
    const porLiqMap = new Map<string, LiqStats>();

    for (const cliente of clientes) {
      const tarea = tareasMap.get(cliente.id);
      const liqId = cliente.liquidador_id ?? "sin-asignar";
      const liqNombre = (cliente.liquidador_id ? liqMap.get(cliente.liquidador_id) : null) ?? "Sin asignar";

      if (!porLiqMap.has(liqId)) {
        porLiqMap.set(liqId, { nombre: liqNombre, total: 0, recibosOk: 0, f931Ok: 0, pendientes: 0 });
      }
      const liqStats = porLiqMap.get(liqId)!;
      liqStats.total++;

      const tieneRecibos = Boolean(tarea?.recibos || tarea?.recibos_drive);
      const tieneF931 = Boolean(tarea?.f931 || tarea?.f931_drive);

      if (tieneRecibos) liqStats.recibosOk++;
      if (tieneF931) liqStats.f931Ok++;

      const completa = tieneRecibos && tieneF931;
      const tieneAlgo = tieneRecibos || tieneF931;

      if (completa) {
        completadas++;
      } else if (tieneAlgo) {
        enProceso++;
      }

      if (!completa) {
        liqStats.pendientes++;
        const falta: string[] = [];
        if (!tieneRecibos) falta.push("Recibos");
        if (!tieneF931) falta.push("F.931");
        empresasPendientes.push({ nombre: cliente.nombre, falta });
      }
    }

    const pendientes = total - completadas;
    const avance = total > 0 ? Math.round((completadas / total) * 100) : 0;
    const porLiquidadora = Array.from(porLiqMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    const ahora = new Date();
    const generadoEn = ahora.toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const reporteData: ReporteData = {
      periodo: { nombre_mes: nombrePeriodo },
      total,
      completadas,
      enProceso,
      pendientes,
      avance,
      porLiquidadora,
      empresasPendientes,
      generadoEn,
    };

    console.log(`[Reporte] generando PDF — ${total} clientes, ${completadas} completadas`);
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { createElement } = await import("react");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(createElement(ReportePDF, { data: reporteData }) as any);
    console.log(`[Reporte] PDF generado — ${pdfBuffer.length} bytes`);

    const filename = `Reporte-Liquidaciones-${mesNombre}-${anio}.pdf`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: FROM,
      to: REPORTE_EMAIL,
      subject: `Reporte de liquidaciones — ${nombrePeriodo}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
          <h2 style="font-size:16px;color:#7A2B2B">KMA Consultores — Reporte ${nombrePeriodo}</h2>
          <p style="font-size:14px">
            Adjunto encontrás el reporte de liquidaciones de <strong>${nombrePeriodo}</strong>
            generado automáticamente por BOS.
          </p>
          <p style="font-size:14px">
            📁 Por favor guardarlo en Drive:<br>
            <strong>Recursos Humanos → Reportes BOS → ${anio} → ${mesNombre}</strong>
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;background:#f9fafb;border-radius:6px">
            <tr>
              <td style="padding:8px 12px;color:#666">Total empresas</td>
              <td style="padding:8px 12px;font-weight:bold">${total}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#666">Completadas</td>
              <td style="padding:8px 12px;font-weight:bold;color:#16a34a">${completadas}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#666">Pendientes</td>
              <td style="padding:8px 12px;font-weight:bold;color:${pendientes > 0 ? "#dc2626" : "#16a34a"}">${pendientes}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#666">Avance</td>
              <td style="padding:8px 12px;font-weight:bold">${avance}%</td>
            </tr>
          </table>
          <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · Sistema de seguimiento de liquidaciones</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    });

    if (emailError) {
      console.error("[Reporte] error enviando email:", emailError);
      return NextResponse.json({ error: emailError.message }, { status: 500 });
    }

    console.log(`[Reporte] email enviado a ${REPORTE_EMAIL}`);
    return NextResponse.json({ ok: true, periodo: nombrePeriodo, total, completadas, avance, email: REPORTE_EMAIL });
  } catch (err) {
    console.error("[Reporte] ERROR:", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
