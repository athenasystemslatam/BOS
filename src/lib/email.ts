import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { configLibros } from "@/lib/librosAutomaticos";
import { vencimientoFinal, type DatosMandato } from "@/lib/libros";
import {
  getVencimientoF931,
  getMesTrabajoActual,
  MESES_NOMBRES,
  GRUPOS_CUIT,
} from "@/lib/vencimientos";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "bos@kmaconsultores.com.ar";
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
        Los siguientes clientes tienen el <strong>F.931 de ${periodoNombre}</strong> pendiente
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
        Los siguientes clientes todavía no tienen la presentación registrada:
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
              <th style="padding:6px 10px;text-align:left">Cliente</th>
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
      ${bloques || "<p style='color:#888'>Todos los clientes están al día. ✓</p>"}
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

// ─── Traspaso de cartera ────────────────────────────────────────────────────

function buildEmailTraspaso(
  liquidadoraNombre: string,
  empresas: string[],
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null
): { subject: string; html: string } {
  const mesNombre = MESES_NOMBRES[desdeMes] ?? String(desdeMes);
  const cantidad = empresas.length;
  const subject = `Se te asignaron ${cantidad} cliente${cantidad !== 1 ? "s" : ""} de Sueldos`;

  const filas = empresas
    .map((n) => `<tr><td style="padding:5px 12px;border-bottom:1px solid #f0f0f0">${n}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      <p style="font-size:15px">Hola ${liquidadoraNombre},</p>
      <p style="font-size:15px">
        Se te asignaron <strong>${cantidad}</strong> cliente${cantidad !== 1 ? "s" : ""} de Sueldos,
        a partir de <strong>${mesNombre} ${desdeAnio}</strong>:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${filas}</tbody></table>
      ${motivo ? `<p style="font-size:13px;color:#888;margin-top:12px">Motivo: ${motivo}</p>` : ""}
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

// ─── Asignación de servicio ─────────────────────────────────────────────────

function buildEmailAsignacionServicio(
  responsableNombre: string,
  clienteNombre: string,
  servicioLabel: string,
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null
): { subject: string; html: string } {
  const mesNombre = MESES_NOMBRES[desdeMes] ?? String(desdeMes);
  const subject = `Se te asignó ${clienteNombre} — ${servicioLabel}`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      <p style="font-size:15px">Hola ${responsableNombre},</p>
      <p style="font-size:15px">
        Se te asignó como responsable de <strong>${servicioLabel}</strong> para
        <strong>${clienteNombre}</strong>, a partir de <strong>${mesNombre} ${desdeAnio}</strong>.
      </p>
      ${motivo ? `<p style="font-size:13px;color:#888;margin-top:12px">Motivo: ${motivo}</p>` : ""}
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

/** Avisa por mail a quien queda como nuevo responsable de un servicio (ver
 * crearAsignacionServicio en asignacionesServicio.ts) qué cliente, servicio
 * y fecha de inicio le corresponden. No corta la asignación si falla — es
 * un aviso, no parte de la operación. */
export async function sendEmailAsignacionServicio(
  responsableNombre: string,
  responsableEmail: string,
  clienteNombre: string,
  servicioLabel: string,
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null
): Promise<{ error?: string }> {
  if (!process.env.RESEND_API_KEY) return { error: "RESEND_API_KEY no configurada" };
  if (!responsableEmail) return {};

  const { subject, html } = buildEmailAsignacionServicio(
    responsableNombre, clienteNombre, servicioLabel, desdeAnio, desdeMes, motivo
  );
  const { error } = await resend.emails.send({ from: FROM, to: responsableEmail, subject, html });
  if (error) return { error: error.message };
  return {};
}

// ─── Baja de servicio ────────────────────────────────────────────────────────

function buildEmailBajaServicio(
  responsableNombre: string,
  clienteNombre: string,
  servicioLabel: string,
  fechaBaja: Date
): { subject: string; html: string } {
  const fechaStr = fechaBaja.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const subject = `Se dio de baja ${servicioLabel} — ${clienteNombre}`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      <p style="font-size:15px">Hola ${responsableNombre},</p>
      <p style="font-size:15px">
        Se dio de baja el servicio <strong>${servicioLabel}</strong> de
        <strong>${clienteNombre}</strong>, con fecha <strong>${fechaStr}</strong>.
      </p>
      <p style="font-size:12px;color:#aaa;margin-top:24px">BOS · KMA Consultores</p>
    </div>
  `;

  return { subject, html };
}

/** Avisa por mail al responsable de un servicio que se dio de baja (ver
 * darDeBajaServicio en panel-general/actions.ts), con la fecha de baja.
 * No corta la baja si falla — es un aviso, no parte de la operación. */
export async function sendEmailBajaServicio(
  responsableNombre: string,
  responsableEmail: string,
  clienteNombre: string,
  servicioLabel: string,
  fechaBaja: Date
): Promise<{ error?: string }> {
  if (!process.env.RESEND_API_KEY) return { error: "RESEND_API_KEY no configurada" };
  if (!responsableEmail) return {};

  const { subject, html } = buildEmailBajaServicio(responsableNombre, clienteNombre, servicioLabel, fechaBaja);
  const { error } = await resend.emails.send({ from: FROM, to: responsableEmail, subject, html });
  if (error) return { error: error.message };
  return {};
}

/** Avisa por mail a quien recibe una cartera transferida (ver
 * transferirCartera en empresas/actions.ts) qué empresas se le asignaron.
 * No corta el traspaso si falla — es un aviso, no parte de la operación. */
export async function sendEmailTraspaso(
  liquidadoraNombre: string,
  liquidadoraEmail: string,
  empresas: string[],
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null
): Promise<{ error?: string }> {
  if (!process.env.RESEND_API_KEY) return { error: "RESEND_API_KEY no configurada" };
  if (!liquidadoraEmail || empresas.length === 0) return {};

  const { subject, html } = buildEmailTraspaso(liquidadoraNombre, empresas, desdeAnio, desdeMes, motivo);
  const { error } = await resend.emails.send({ from: FROM, to: liquidadoraEmail, subject, html });
  if (error) return { error: error.message };
  return {};
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

// ─── Alertas Libros ───────────────────────────────────────────────────────────

type AlertaLibrosData = {
  seguimientosVencidos: { clienteNombre: string; tipo: string; descripcion: string | null; proximo: string; responsable: string | null }[];
  mandatosVencidos: { clienteNombre: string; vence: string; diasRestantes: number }[];
  foliosCriticos: { clienteNombre: string; libroNombre: string; libres: number }[];
};

function buildEmailAlertasLibros(data: AlertaLibrosData): { subject: string; html: string } | null {
  const { seguimientosVencidos, mandatosVencidos, foliosCriticos } = data;
  const total = seguimientosVencidos.length + mandatosVencidos.length + foliosCriticos.length;
  if (total === 0) return null;

  const hoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const subject = `Alertas Libros — ${total} ítem${total !== 1 ? "s" : ""} al ${hoy}`;

  function seccion(titulo: string, filas: string): string {
    return `
      <h3 style="font-size:14px;font-weight:600;color:#444;margin:20px 0 6px">${titulo}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>${filas}</tbody>
      </table>`;
  }

  function fila(cols: string[]): string {
    return `<tr>${cols.map((c) => `<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0">${c}</td>`).join("")}</tr>`;
  }

  let body = "";

  if (seguimientosVencidos.length > 0) {
    const filas = seguimientosVencidos.map((s) =>
      fila([
        s.clienteNombre,
        s.tipo,
        s.descripcion ?? "—",
        `<span style="color:#dc2626">Debía: ${s.proximo}</span>`,
        s.responsable ?? "Sin asignar",
      ])
    ).join("");
    body += seccion(`📋 Seguimientos vencidos (${seguimientosVencidos.length})`, filas);
  }

  if (mandatosVencidos.length > 0) {
    const filas = mandatosVencidos.map((m) =>
      fila([
        m.clienteNombre,
        m.diasRestantes <= 0
          ? `<span style="color:#dc2626">Venció: ${m.vence}</span>`
          : `<span style="color:#d97706">Vence: ${m.vence} (${m.diasRestantes} días)</span>`,
      ])
    ).join("");
    body += seccion(`⚠️ Mandatos: nuevos avisos de vencimiento (${mandatosVencidos.length})`, filas);
  }

  if (foliosCriticos.length > 0) {
    const filas = foliosCriticos.map((f) =>
      fila([f.clienteNombre, f.libroNombre, `${f.libres} folios libres`])
    ).join("");
    body += seccion(`📚 Libros con folios críticos sin presupuesto (${foliosCriticos.length})`, filas);
  }

  const html = `
    <div style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#222">
      <h2 style="font-size:16px;margin-bottom:4px">Alertas Libros — ${hoy}</h2>
      <p style="font-size:13px;color:#888;margin-top:0">Resumen automático generado por BOS.</p>
      ${body}
      <p style="font-size:12px;color:#aaa;margin-top:28px">BOS · KMA Consultores</p>
    </div>`;

  return { subject, html };
}

export type AlertaLibrosResult = { enviados: number; omitidos: number; detalle: string[]; error?: string };

export async function sendAlertasLibros(): Promise<AlertaLibrosResult> {
  if (!process.env.RESEND_API_KEY) {
    return { enviados: 0, omitidos: 0, detalle: [], error: "RESEND_API_KEY no configurada" };
  }

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  // 1. Umbral de folios
  const { data: cfgRaw } = await admin.from("libros_config").select("umbral_folios").maybeSingle();
  const umbral = (cfgRaw as { umbral_folios: number } | null)?.umbral_folios ?? 10;

  // 2. Pedidos con seguimiento vencido
  const { data: pedidosRaw } = await admin
    .from("libros_pedidos")
    .select("tipo, descripcion, proximo_seguimiento, clientes!inner(nombre), responsable:liquidadoras!libros_pedidos_responsable_id_fkey(nombre)")
    .lt("proximo_seguimiento", hoy)
    .in("estado", ["abierto", "esperando_cliente", "esperando_tercero"]);

  const seguimientosVencidos = ((pedidosRaw ?? []) as unknown as {
    tipo: string; descripcion: string | null; proximo_seguimiento: string;
    clientes: { nombre: string }; responsable: { nombre: string } | null;
  }[]).map((p) => ({
    clienteNombre: p.clientes.nombre,
    tipo: p.tipo.replace(/_/g, " "),
    descripcion: p.descripcion,
    proximo: new Date(p.proximo_seguimiento + "T00:00:00").toLocaleDateString("es-AR"),
    responsable: p.responsable?.nombre ?? null,
  }));

  // 3. Mandatos que cruzaron un umbral de aviso (90/60/30 por defecto) o
  //    vencieron (umbral 0). Cada umbral sale una sola vez por mandato: lo
  //    enviado queda en libros_avisos_mandato.
  const { avisosMandato } = await configLibros(admin);
  const { data: societariosRaw } = await admin
    .from("clientes_societario")
    .select("*");
  const { data: enviadosRaw, error: errEnviados } = await admin
    .from("libros_avisos_mandato")
    .select("cliente_id, mandato_vence, umbral");
  const yaEnviados = new Set(
    ((enviadosRaw ?? []) as { cliente_id: string; mandato_vence: string; umbral: number }[]).map(
      (a) => `${a.cliente_id}|${a.mandato_vence}|${a.umbral}`
    )
  );
  const avisosARegistrar: { cliente_id: string; mandato_vence: string; umbral: number }[] = [];
  const { data: clientesRaw } = await admin
    .from("servicios_cliente")
    .select("cliente_id, clientes(nombre)")
    .eq("servicio", "libros")
    .eq("estado", true);

  const clienteNombrePorId = new Map(
    ((clientesRaw ?? []) as unknown as { cliente_id: string; clientes: { nombre: string } | null }[])
      .filter((s) => s.clientes)
      .map((s) => [s.cliente_id, s.clientes!.nombre])
  );

  const mandatosVencidos: AlertaLibrosData["mandatosVencidos"] = [];

  for (const s of (societariosRaw ?? []) as (DatosMandato & { cliente_id: string })[]) {
    const venceStr = vencimientoFinal(s);
    if (!venceStr) continue;
    const diasRestantes = Math.round((new Date(venceStr + "T00:00:00").getTime() - new Date(hoy + "T00:00:00").getTime()) / 86_400_000);
    const cruzados = avisosMandato.filter((t) => diasRestantes <= t);
    if (cruzados.length === 0) continue;
    const umbral = diasRestantes < 0 ? 0 : Math.min(...cruzados);
    // Sin la tabla (etapa 6 sin correr) se avisa solo el día exacto del umbral.
    const corresponde = errEnviados
      ? diasRestantes === -1 || avisosMandato.includes(diasRestantes)
      : !yaEnviados.has(`${s.cliente_id}|${venceStr}|${umbral}`);
    if (!corresponde) continue;
    const clienteNombre = clienteNombrePorId.get(s.cliente_id);
    if (!clienteNombre) continue;
    mandatosVencidos.push({
      clienteNombre,
      vence: new Date(venceStr + "T00:00:00").toLocaleDateString("es-AR"),
      diasRestantes,
    });
    avisosARegistrar.push({ cliente_id: s.cliente_id, mandato_vence: venceStr, umbral });
  }
  mandatosVencidos.sort((a, b) => a.diasRestantes - b.diasRestantes);

  // 4. Libros con folios críticos sin presupuesto abierto
  const { data: librosRaw } = await admin
    .from("libros")
    .select("id, cliente_id, catalogo_id, tomo, folios_totales, folios_usados, estado")
    .neq("estado", "sin_libro");

  const { data: catalogoRaw } = await admin.from("libros_catalogo").select("id, nombre");
  const catalogoPorId = new Map(((catalogoRaw ?? []) as { id: string; nombre: string }[]).map((k) => [k.id, k]));

  // Pedidos de presupuesto tomo nuevo abiertos
  const { data: presupuestosRaw } = await admin
    .from("libros_pedidos")
    .select("libro_id")
    .eq("tipo", "presupuesto_tomo_nuevo")
    .in("estado", ["abierto", "esperando_cliente", "esperando_tercero"]);
  const librosConPresupuesto = new Set(((presupuestosRaw ?? []) as { libro_id: string | null }[]).map((p) => p.libro_id).filter(Boolean));

  const foliosCriticos: AlertaLibrosData["foliosCriticos"] = [];
  for (const l of (librosRaw ?? []) as { id: string; cliente_id: string; catalogo_id: string; tomo: number; folios_totales: number | null; folios_usados: number }[]) {
    if (l.folios_totales == null) continue;
    const libres = l.folios_totales - l.folios_usados;
    if (libres > umbral) continue;
    if (librosConPresupuesto.has(l.id)) continue;
    const clienteNombre = clienteNombrePorId.get(l.cliente_id);
    if (!clienteNombre) continue;
    const catNombre = catalogoPorId.get(l.catalogo_id)?.nombre ?? "Libro";
    foliosCriticos.push({ clienteNombre, libroNombre: `${catNombre} T.${l.tomo}`, libres });
  }
  foliosCriticos.sort((a, b) => a.libres - b.libres);

  const emailData = buildEmailAlertasLibros({ seguimientosVencidos, mandatosVencidos, foliosCriticos });
  if (!emailData) return { enviados: 0, omitidos: 0, detalle: ["Sin alertas hoy"] };

  const { error } = await resend.emails.send({ from: FROM, to: ADMIN_EMAIL, subject: emailData.subject, html: emailData.html });
  if (error) return { enviados: 0, omitidos: 1, detalle: [`[omitido] ${error.message}`], error: error.message };
  // Recién con el mail enviado: si falla, el aviso sale al día siguiente.
  if (avisosARegistrar.length > 0 && !errEnviados) {
    await admin.from("libros_avisos_mandato").upsert(avisosARegistrar, { ignoreDuplicates: true });
  }
  return { enviados: 1, omitidos: 0, detalle: [`Alertas Libros → ${ADMIN_EMAIL}`] };
}
