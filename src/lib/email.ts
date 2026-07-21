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
  label: string;   // "CUITs 0–3"
  fecha: Date;
  dias: number;    // negative = ya venció
  empresas: EmpresaPendiente[];
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getEmpresasPendientesF931(): Promise<{
  grupos: GrupoPendiente[];
  periodoNombre: string;
}> {
  const admin = createAdminClient();
  const { mes, anio } = getMesTrabajoActual();

  // Obtener período actual
  const { data: periodo } = await admin
    .from("periodos")
    .select("id, nombre_mes")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  if (!periodo) {
    return { grupos: [], periodoNombre: `${MESES_NOMBRES[mes]} ${anio}` };
  }

  // Empresas sin F.931 (ni manual ni drive)
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

  const grupos: GrupoPendiente[] = GRUPOS_CUIT.map((g) => {
    const fecha = getVencimientoF931(g.min, anio, mes);
    const dias = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    const empresasGrupo = empresas.filter(
      (e) => e.terminacion_cuit >= g.min && e.terminacion_cuit <= g.max
    );
    return { label: g.label, fecha, dias, empresas: empresasGrupo };
  });

  return { grupos, periodoNombre: periodo.nombre_mes };
}

// ─── Email builders ───────────────────────────────────────────────────────────

function buildEmailLiquidadora(
  liquidadoraNombre: string,
  empresas: EmpresaPendiente[],
  fecha: Date,
  dias: number,
  periodoNombre: string
): { subject: string; html: string } {
  const fechaStr = fecha.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const urgente = dias <= 0;
  const diasLabel =
    dias > 0 ? `en ${dias} día${dias !== 1 ? "s" : ""}` : dias === 0 ? "HOY" : "VENCIDO";

  const subject = urgente
    ? `🚨 URGENTE — F.931 ${diasLabel} — ${empresas.map((e) => e.nombre).join(", ")}`
    : `⚠ F.931 vence ${diasLabel} — ${empresas.map((e) => e.nombre).join(", ")}`;

  const listaEmpresas = empresas
    .map(
      (e) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${e.nombre}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#666">CUIT termina en ${e.terminacion_cuit}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      <p style="font-size:15px">Hola ${liquidadoraNombre},</p>
      <p style="font-size:15px">
        Las siguientes empresas tienen el <strong>F.931 de ${periodoNombre}</strong> pendiente.<br>
        Vencimiento: <strong>${fechaStr}</strong> (${diasLabel}).
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 12px;text-align:left">Empresa</th>
            <th style="padding:8px 12px;text-align:left">CUIT</th>
          </tr>
        </thead>
        <tbody>${listaEmpresas}</tbody>
      </table>
      <p style="font-size:13px;color:#888">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

function buildEmailAdmin(
  grupos: GrupoPendiente[],
  periodoNombre: string
): { subject: string; html: string } {
  const pendientesTotal = grupos.reduce((acc, g) => acc + g.empresas.length, 0);
  const subject = `Resumen F.931 — ${pendientesTotal} empresa${pendientesTotal !== 1 ? "s" : ""} pendiente${pendientesTotal !== 1 ? "s" : ""} al ${new Date().toLocaleDateString("es-AR")}`;

  const bloques = grupos
    .filter((g) => g.empresas.length > 0)
    .map((g) => {
      const fechaStr = g.fecha.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
      });
      const diasLabel =
        g.dias > 0
          ? `vence en ${g.dias}d (${fechaStr})`
          : g.dias === 0
          ? `vence HOY`
          : `VENCIDO el ${fechaStr}`;

      // Agrupar por liquidadora
      const porLiq = new Map<string, EmpresaPendiente[]>();
      for (const e of g.empresas) {
        const key = e.liquidadora_nombre;
        if (!porLiq.has(key)) porLiq.set(key, []);
        porLiq.get(key)!.push(e);
      }

      const filas = Array.from(porLiq.entries())
        .map(([liq, emps]) =>
          emps
            .map(
              (e) =>
                `<tr>
                  <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0">${e.nombre}</td>
                  <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#666">${liq}</td>
                </tr>`
            )
            .join("")
        )
        .join("");

      return `
        <h3 style="margin:20px 0 6px;font-size:14px;color:#555">${g.label} — ${diasLabel}</h3>
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
    })
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222">
      <h2 style="font-size:16px">F.931 ${periodoNombre} — ${pendientesTotal} pendiente${pendientesTotal !== 1 ? "s" : ""}</h2>
      ${bloques || "<p style='color:#888'>Todas las empresas están al día.</p>"}
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

  const to = ADMIN_EMAIL;
  const { error } = await resend.emails.send({
    from: FROM,
    to,
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

  return { enviados: 1, omitidos: 0, detalle: [`Test → ${to}`] };
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

  const { grupos, periodoNombre } = await getEmpresasPendientesF931();
  const enviados: string[] = [];
  const omitidos: string[] = [];

  // Grupos relevantes: 7d, 3d, 0d (hoy), -1d (día siguiente al vencimiento)
  const gruposRelevantes = grupos.filter(
    (g) => g.dias === 7 || g.dias === 3 || g.dias === 0 || g.dias === -1
  );

  if (gruposRelevantes.length === 0) {
    return { enviados: 0, omitidos: 0, detalle: ["Sin vencimientos relevantes hoy"] };
  }

  const enviarAdminResumen = gruposRelevantes.some((g) => g.dias <= 3);
  let adminResumenEnviado = false;

  for (const grupo of gruposRelevantes) {
    if (grupo.empresas.length === 0) {
      omitidos.push(`${grupo.label}: sin pendientes`);
      continue;
    }

    if (grupo.dias === -1) {
      // Día posterior: solo resumen a admin
      continue;
    }

    // Agrupar por liquidadora para enviar un email por liquidadora
    const porLiq = new Map<string, EmpresaPendiente[]>();
    for (const e of grupo.empresas) {
      if (!e.liquidadora_email) continue;
      if (!porLiq.has(e.liquidadora_email)) porLiq.set(e.liquidadora_email, []);
      porLiq.get(e.liquidadora_email)!.push(e);
    }

    for (const [email, empresas] of Array.from(porLiq.entries())) {
      const { subject, html } = buildEmailLiquidadora(
        empresas[0].liquidadora_nombre,
        empresas,
        grupo.fecha,
        grupo.dias,
        periodoNombre
      );

      const { error } = await resend.emails.send({
        from: FROM,
        to: email,
        ...(grupo.dias <= 3 ? { cc: ADMIN_EMAIL } : {}),
        subject,
        html,
      });

      if (error) {
        omitidos.push(`${email}: ${error.message}`);
      } else {
        enviados.push(`${empresas[0].liquidadora_nombre} → ${email} (${empresas.length} empresas)`);
      }
    }
  }

  // Resumen a admin cuando hay vencimientos en ≤3 días o ya vencidos
  if (enviarAdminResumen && !adminResumenEnviado) {
    const { subject, html } = buildEmailAdmin(grupos, periodoNombre);
    const { error } = await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject,
      html,
    });
    if (error) {
      omitidos.push(`Admin resumen: ${error.message}`);
    } else {
      enviados.push(`Admin resumen → ${ADMIN_EMAIL}`);
      adminResumenEnviado = true;
    }
  }

  return {
    enviados: enviados.length,
    omitidos: omitidos.length,
    detalle: [...enviados, ...omitidos.map((o) => `[omitido] ${o}`)],
  };
}
