import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getVencimientoF931,
  getMesTrabajoActual,
  MESES_NOMBRES,
  GRUPOS_CUIT,
} from "@/lib/vencimientos";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "onboarding@resend.dev";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "giulianatignanelli15@gmail.com";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmpresaPendiente = {
  nombre: string;
  terminacion_cuit: number;
  liquidadora_nombre: string;
  liquidadora_email: string;
};

type GrupoPendiente = {
  label: string;
  fecha: Date;
  dias: number;
  empresas: EmpresaPendiente[];
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getEmpresasPendientesF931(): Promise<{
  grupos: GrupoPendiente[];
  periodoNombre: string;
  diasAlUltimo: number;
}> {
  const admin = createAdminClient();
  const { mes, anio } = getMesTrabajoActual();

  const { data: periodo } = await admin
    .from("periodos")
    .select("id, nombre_mes")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  if (!periodo) {
    return { grupos: [], periodoNombre: `${MESES_NOMBRES[mes]} ${anio}`, diasAlUltimo: 999 };
  }

  const { data: tareasPendientes } = await admin
    .from("tareas")
    .select(`
      cliente_id,
      clientes!inner (
        nombre,
        terminacion_cuit,
        estado,
        liquidadoras!liquidador_id (
          nombre,
          email
        )
      )
    `)
    .eq("periodo_id", periodo.id)
    .eq("f931_manual", false)
    .eq("f931_drive", false);

  const empresas: EmpresaPendiente[] = (tareasPendientes ?? [])
    .filter((t: Record<string, unknown>) => {
      const c = t.clientes as Record<string, unknown> | null;
      return c && c.estado === "activo";
    })
    .map((t: Record<string, unknown>) => {
      const c = t.clientes as Record<string, unknown>;
      const liq = c.liquidadoras as Record<string, string> | null;
      return {
        nombre: c.nombre as string,
        terminacion_cuit: c.terminacion_cuit as number,
        liquidadora_nombre: liq?.nombre ?? "Sin asignar",
        liquidadora_email: liq?.email ?? "",
      };
    });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const grupos: GrupoPendiente[] = GRUPOS_CUIT.map((g) => {
    const fecha = getVencimientoF931(g.min, anio, mes);
    const dias = Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    const empresasGrupo = empresas.filter(
      (e) => e.terminacion_cuit >= g.min && e.terminacion_cuit <= g.max
    );
    return { label: g.label, fecha, dias, empresas: empresasGrupo };
  });

  // Días hasta el último vencimiento (CUITs 7-9, siempre el último)
  const diasAlUltimo = grupos[grupos.length - 1]?.dias ?? 999;

  return { grupos, periodoNombre: periodo.nombre_mes, diasAlUltimo };
}

// ─── Email builders ───────────────────────────────────────────────────────────

function buildEmailPrevio(
  liquidadoraNombre: string,
  gruposLiq: GrupoPendiente[],
  liquidadoraEmail: string,
  periodoNombre: string
): { subject: string; html: string } {
  const subject = `⚠ F.931 ${periodoNombre} — vencimientos próximos`;

  const bloques = gruposLiq.map((g) => {
    const fechaStr = g.fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    const diasLabel = g.dias === 1 ? "mañana" : `en ${g.dias} días`;
    const empresasDelGrupo = g.empresas.filter((e) => e.liquidadora_email === liquidadoraEmail);
    const filas = empresasDelGrupo
      .map((e) => `<tr><td style="padding:5px 12px;border-bottom:1px solid #f0f0f0">${e.nombre}</td></tr>`)
      .join("");
    return `
      <p style="font-size:13px;font-weight:600;color:#555;margin:16px 0 4px">
        ${g.label} — vence ${diasLabel} (${fechaStr})
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${filas}</tbody></table>
    `;
  }).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      <p style="font-size:15px">Hola ${liquidadoraNombre},</p>
      <p style="font-size:15px">
        Las siguientes empresas tienen el <strong>F.931 de ${periodoNombre}</strong> pendiente
        y sus vencimientos se aproximan:
      </p>
      ${bloques}
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

function buildEmailPost(
  liquidadoraNombre: string,
  empresas: EmpresaPendiente[],
  periodoNombre: string
): { subject: string; html: string } {
  const subject = `🚨 F.931 ${periodoNombre} — vencimientos superados, aún pendientes`;

  const filas = empresas
    .map((e) => `<tr><td style="padding:5px 12px;border-bottom:1px solid #f0f0f0">${e.nombre}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      <p style="font-size:15px">Hola ${liquidadoraNombre},</p>
      <p style="font-size:15px">
        Los vencimientos del <strong>F.931 de ${periodoNombre}</strong> ya pasaron.
        Las siguientes empresas todavía no tienen la presentación registrada:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${filas}</tbody></table>
      <p style="font-size:13px;color:#888;margin-top:16px">
        Si ya lo presentaste, marcalo como completado en el sistema.
      </p>
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

function buildEmailReporteFinal(
  grupos: GrupoPendiente[],
  periodoNombre: string,
  tipo: "post" | "final"
): { subject: string; html: string } {
  const pendientesTotal = grupos.reduce((acc, g) => acc + g.empresas.length, 0);
  const fechaHoy = new Date().toLocaleDateString("es-AR");

  const subject = tipo === "final"
    ? `Reporte final F.931 ${periodoNombre} — ${pendientesTotal} pendiente${pendientesTotal !== 1 ? "s" : ""}`
    : `Resumen post-vencimiento F.931 ${periodoNombre} — ${pendientesTotal} pendiente${pendientesTotal !== 1 ? "s" : ""} al ${fechaHoy}`;

  const bloques = grupos
    .filter((g) => g.empresas.length > 0)
    .map((g) => {
      const porLiq = new Map<string, EmpresaPendiente[]>();
      for (const e of g.empresas) {
        if (!porLiq.has(e.liquidadora_nombre)) porLiq.set(e.liquidadora_nombre, []);
        porLiq.get(e.liquidadora_nombre)!.push(e);
      }

      const filas = Array.from(porLiq.entries())
        .flatMap(([liq, emps]) =>
          emps.map((e) => `
            <tr>
              <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0">${e.nombre}</td>
              <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#666">${liq}</td>
            </tr>`)
        ).join("");

      return `
        <h3 style="margin:20px 0 6px;font-size:14px;color:#555">${g.label}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:6px 10px;text-align:left">Empresa</th>
              <th style="padding:6px 10px;text-align:left">Liquidadora</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      `;
    }).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222">
      <h2 style="font-size:16px">F.931 ${periodoNombre} — ${pendientesTotal} pendiente${pendientesTotal !== 1 ? "s" : ""}</h2>
      ${bloques || "<p style='color:#888'>Todas las empresas están al día. ✓</p>"}
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function sendTestEmail(): Promise<AlertaF931Result> {
  if (!process.env.RESEND_API_KEY) {
    return { enviados: 0, omitidos: 0, detalle: [], error: "RESEND_API_KEY no configurada" };
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: "Test BOS — sistema de alertas funcionando",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#222">
        <h2 style="font-size:16px">Sistema de alertas BOS ✓</h2>
        <p style="font-size:14px">Este es un email de prueba enviado desde la ruta <code>/api/alertas/f931?test=true</code>.</p>
        <p style="font-size:14px">Resend está configurado correctamente.</p>
        <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
      </div>
    `,
  });

  if (error) {
    return { enviados: 0, omitidos: 1, detalle: [`[omitido] ${error.message}`], error: error.message };
  }

  return { enviados: 1, omitidos: 0, detalle: [`Test → ${ADMIN_EMAIL}`] };
}

export type AlertaF931Result = {
  enviados: number;
  omitidos: number;
  detalle: string[];
  error?: string;
};

export async function sendAlertaF931(): Promise<AlertaF931Result> {
  if (!process.env.RESEND_API_KEY) {
    return { enviados: 0, omitidos: 0, detalle: [], error: "RESEND_API_KEY no configurada" };
  }

  const { grupos, periodoNombre, diasAlUltimo } = await getEmpresasPendientesF931();
  const enviados: string[] = [];
  const omitidos: string[] = [];

  // 3 emails por mes, anclados al último vencimiento del período (CUITs 7-9):
  //   +3 = previo      → liquidadoras (aviso anticipado)
  //   -1 = post        → liquidadoras + admin (ya venció, pendientes)
  //   -5 = final       → solo admin (reporte definitivo)
  const esPrevio = diasAlUltimo === 3;
  const esPost = diasAlUltimo === -1;
  const esFinal = diasAlUltimo === -5;

  if (!esPrevio && !esPost && !esFinal) {
    return { enviados: 0, omitidos: 0, detalle: ["Sin vencimientos relevantes hoy"] };
  }

  // Email previo: una liquidadora puede tener empresas en distintos grupos con distintas fechas
  if (esPrevio) {
    const porLiq = new Map<string, { nombre: string; grupos: GrupoPendiente[] }>();
    for (const grupo of grupos) {
      for (const e of grupo.empresas) {
        if (!e.liquidadora_email) continue;
        if (!porLiq.has(e.liquidadora_email)) {
          porLiq.set(e.liquidadora_email, { nombre: e.liquidadora_nombre, grupos: [] });
        }
        const entry = porLiq.get(e.liquidadora_email)!;
        if (!entry.grupos.includes(grupo)) entry.grupos.push(grupo);
      }
    }

    for (const [email, { nombre, grupos: gruposLiq }] of Array.from(porLiq.entries())) {
      const { subject, html } = buildEmailPrevio(nombre, gruposLiq, email, periodoNombre);
      const { error } = await resend.emails.send({ from: FROM, to: email, subject, html });
      if (error) omitidos.push(`[previo] ${nombre}: ${error.message}`);
      else enviados.push(`[previo] ${nombre} → ${email}`);
    }
  }

  // Email post: todo lo que sigue pendiente después del último vencimiento
  if (esPost) {
    const porLiq = new Map<string, { nombre: string; empresas: EmpresaPendiente[] }>();
    for (const grupo of grupos) {
      for (const e of grupo.empresas) {
        if (!e.liquidadora_email) continue;
        if (!porLiq.has(e.liquidadora_email)) {
          porLiq.set(e.liquidadora_email, { nombre: e.liquidadora_nombre, empresas: [] });
        }
        porLiq.get(e.liquidadora_email)!.empresas.push(e);
      }
    }

    for (const [email, { nombre, empresas }] of Array.from(porLiq.entries())) {
      const { subject, html } = buildEmailPost(nombre, empresas, periodoNombre);
      const { error } = await resend.emails.send({ from: FROM, to: email, cc: ADMIN_EMAIL, subject, html });
      if (error) omitidos.push(`[post] ${nombre}: ${error.message}`);
      else enviados.push(`[post] ${nombre} → ${email}`);
    }

    // Admin siempre recibe el resumen post aunque no haya pendientes
    const { subject, html } = buildEmailReporteFinal(grupos, periodoNombre, "post");
    const { error } = await resend.emails.send({ from: FROM, to: ADMIN_EMAIL, subject, html });
    if (error) omitidos.push(`[post] admin: ${error.message}`);
    else enviados.push(`[post] admin → ${ADMIN_EMAIL}`);
  }

  // Reporte final: solo admin, 5 días después del último vencimiento
  if (esFinal) {
    const { subject, html } = buildEmailReporteFinal(grupos, periodoNombre, "final");
    const { error } = await resend.emails.send({ from: FROM, to: ADMIN_EMAIL, subject, html });
    if (error) omitidos.push(`[final] admin: ${error.message}`);
    else enviados.push(`[final] admin → ${ADMIN_EMAIL}`);
  }

  return {
    enviados: enviados.length,
    omitidos: omitidos.length,
    detalle: [...enviados, ...omitidos.map((o) => `[omitido] ${o}`)],
  };
}
