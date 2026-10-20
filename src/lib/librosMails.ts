import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { configLibros } from "@/lib/librosAutomaticos";
import { FECHA_BASE, armarSnapshot, calcularAtraso, type Snapshot } from "@/lib/librosTablero";
import {
  DEFINICION_PRIORIDAD,
  diasHasta,
  fmtFecha,
  prioridadSugerida,
  vencimientoFinal,
  type DatosMandato,
} from "@/lib/libros";
import type { PrioridadLibro } from "@/types";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "bos@kmaconsultores.com.ar";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "giulianatignanelli15@gmail.com";
const URL_BOS = "https://bos-plum.vercel.app";

type Admin = ReturnType<typeof createAdminClient>;
type Persona = { id: string; nombre: string; email: string };
export type ResultadoMails = { enviados: number; omitidos: number; detalle: string[]; error?: string };

/** Fecha y día de la semana en Argentina (UTC-3): el cron corre en UTC. */
function hoyArgentina(): { fecha: string; dia: number } {
  const d = new Date(Date.now() - 3 * 3600_000);
  return { fecha: d.toISOString().slice(0, 10), dia: d.getUTCDay() === 0 ? 7 : d.getUTCDay() };
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function seccion(titulo: string, filas: string[][]): string {
  if (filas.length === 0) return "";
  return `
    <h3 style="font-size:14px;font-weight:600;color:#17141A;margin:22px 0 6px">${titulo}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tbody>${filas
        .map((cols) => `<tr>${cols.map((c) => `<td style="padding:5px 10px;border-bottom:1px solid #EFEBE4">${c}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>`;
}

function plantilla(titulo: string, intro: string, cuerpo: string, link: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:680px;margin:0 auto;color:#17141A">
      <h2 style="font-size:17px;margin-bottom:4px">${titulo}</h2>
      <p style="font-size:13px;color:#605954;margin-top:0">${intro}</p>
      ${cuerpo}
      <p style="margin-top:24px"><a href="${link}" style="color:#7D1C2E;font-weight:600">Abrir en BOS</a></p>
      <p style="font-size:12px;color:#7C756E;margin-top:24px">BOS · KMA Consultores · Se configura en Libros → Configuración.</p>
    </div>`;
}

const rojo = (s: string) => `<span style="color:#B91C1C">${s}</span>`;
const naranja = (s: string) => `<span style="color:#C2410C">${s}</span>`;

// ── Destinatarios ────────────────────────────────────────────────────────────

async function personas(admin: Admin): Promise<{ equipoLibros: Persona[]; admins: Persona[]; todas: Map<string, Persona> }> {
  const [{ data: lista }, { data: modulos }] = await Promise.all([
    admin.from("liquidadoras").select("id, nombre, email, rol, activa").eq("activa", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "libros"),
  ]);
  const enLibros = new Set((modulos ?? []).map((m) => m.equipo_id as string));
  const conMail = ((lista ?? []) as { id: string; nombre: string; email: string | null; rol: string }[]).filter((p) => !!p.email);
  const aPersona = (p: { id: string; nombre: string; email: string | null }) => ({ id: p.id, nombre: p.nombre, email: p.email! });
  return {
    equipoLibros: conMail.filter((p) => enLibros.has(p.id)).map(aPersona),
    admins: conMail.filter((p) => p.rol === "admin").map(aPersona),
    todas: new Map(conMail.map((p) => [p.id, aPersona(p)])),
  };
}

// ── Mail diario: a cada responsable, lo de sus clientes ──────────────────────

type Item = { clienteId: string; responsableId: string | null; fila: string[] };

async function mailDiario(admin: Admin, hoy: string): Promise<ResultadoMails> {
  const config = await configLibros(admin);
  const gente = await personas(admin);
  const excluidos = new Set(config.mailDiarioExcluidos);
  let destinatarios = gente.equipoLibros.filter((p) => !excluidos.has(p.id));
  const sinEquipo = destinatarios.length === 0;
  // Si nadie del equipo de Libros lo recibe, que no se pierdan los avisos.
  if (sinEquipo) destinatarios = gente.admins.length ? gente.admins : [{ id: "", nombre: "Administración", email: ADMIN_EMAIL }];

  const [{ data: servicios }, { data: pedidosRaw }, { data: societariosRaw }, { data: enviadosRaw, error: errEnviados }, { data: librosRaw }, { data: catalogoRaw }, { data: presupuestosRaw }] =
    await Promise.all([
      admin.from("servicios_cliente").select("cliente_id, responsable_id, clientes(nombre)").eq("servicio", "libros").eq("estado", true),
      admin
        .from("libros_pedidos")
        .select("cliente_id, tipo, descripcion, proximo_seguimiento, responsable_id")
        .lt("proximo_seguimiento", hoy)
        .in("estado", ["abierto", "esperando_cliente", "esperando_tercero"]),
      admin.from("clientes_societario").select("*"),
      admin.from("libros_avisos_mandato").select("cliente_id, mandato_vence, umbral"),
      admin.from("libros").select("id, cliente_id, catalogo_id, tomo, folios_totales, folios_usados, estado").eq("estado", "activo"),
      admin.from("libros_catalogo").select("id, nombre"),
      admin
        .from("libros_pedidos")
        .select("libro_id")
        .eq("tipo", "presupuesto_tomo_nuevo")
        .in("estado", ["abierto", "esperando_cliente", "esperando_tercero"]),
    ]);

  const clientes = new Map(
    ((servicios ?? []) as unknown as { cliente_id: string; responsable_id: string | null; clientes: { nombre: string } | null }[])
      .filter((s) => s.clientes)
      .map((s) => [s.cliente_id, { nombre: s.clientes!.nombre, responsableId: s.responsable_id }])
  );
  const responsableDe = (clienteId: string) => clientes.get(clienteId)?.responsableId ?? null;

  // Seguimientos vencidos: del responsable del pedido, si no del de Libros del cliente.
  const seguimientos: Item[] = ((pedidosRaw ?? []) as {
    cliente_id: string; tipo: string; descripcion: string | null; proximo_seguimiento: string; responsable_id: string | null;
  }[])
    .filter((p) => clientes.has(p.cliente_id))
    .map((p) => ({
      clienteId: p.cliente_id,
      responsableId: p.responsable_id ?? responsableDe(p.cliente_id),
      fila: [esc(clientes.get(p.cliente_id)!.nombre), p.tipo.replace(/_/g, " "), esc(p.descripcion ?? "—"), rojo(`Debía: ${fmtFecha(p.proximo_seguimiento)}`)],
    }));

  // Mandatos: cada umbral (90/60/30 o vencido) sale una sola vez por mandato.
  const yaEnviados = new Set(
    ((enviadosRaw ?? []) as { cliente_id: string; mandato_vence: string; umbral: number }[]).map(
      (a) => `${a.cliente_id}|${a.mandato_vence}|${a.umbral}`
    )
  );
  const avisosARegistrar: { cliente_id: string; mandato_vence: string; umbral: number }[] = [];
  const mandatos: (Item & { dias: number })[] = [];
  for (const s of (societariosRaw ?? []) as (DatosMandato & { cliente_id: string })[]) {
    const vence = vencimientoFinal(s);
    if (!vence || !clientes.has(s.cliente_id)) continue;
    const dias = diasHasta(vence);
    const cruzados = config.avisosMandato.filter((t) => dias <= t);
    if (cruzados.length === 0) continue;
    const umbral = dias < 0 ? 0 : Math.min(...cruzados);
    const corresponde = errEnviados ? dias === -1 || config.avisosMandato.includes(dias) : !yaEnviados.has(`${s.cliente_id}|${vence}|${umbral}`);
    if (!corresponde) continue;
    mandatos.push({
      clienteId: s.cliente_id,
      responsableId: responsableDe(s.cliente_id),
      dias,
      fila: [esc(clientes.get(s.cliente_id)!.nombre), dias < 0 ? rojo(`Venció el ${fmtFecha(vence)}`) : naranja(`Vence el ${fmtFecha(vence)} (en ${dias} días)`)],
    });
    avisosARegistrar.push({ cliente_id: s.cliente_id, mandato_vence: vence, umbral });
  }
  mandatos.sort((a, b) => a.dias - b.dias);

  // Folios críticos sin pedido de tomo nuevo abierto (normalmente el pedido se crea solo).
  const conPresupuesto = new Set(((presupuestosRaw ?? []) as { libro_id: string | null }[]).map((p) => p.libro_id));
  const nombreLibro = new Map(((catalogoRaw ?? []) as { id: string; nombre: string }[]).map((k) => [k.id, k.nombre]));
  const folios: Item[] = [];
  for (const l of (librosRaw ?? []) as { id: string; cliente_id: string; catalogo_id: string; tomo: number; folios_totales: number | null; folios_usados: number }[]) {
    if (l.folios_totales == null || !clientes.has(l.cliente_id) || conPresupuesto.has(l.id)) continue;
    const libres = l.folios_totales - l.folios_usados;
    if (libres > config.umbralFolios) continue;
    folios.push({
      clienteId: l.cliente_id,
      responsableId: responsableDe(l.cliente_id),
      fila: [esc(clientes.get(l.cliente_id)!.nombre), `${esc(nombreLibro.get(l.catalogo_id) ?? "Libro")} tomo ${l.tomo}`, naranja(`${libres} folios libres`)],
    });
  }

  // A cada persona: lo de sus clientes + lo que no tiene responsable. Si el
  // mail va a administración (nadie del equipo), va todo.
  const delDestinatario = (p: Persona, items: Item[]) =>
    sinEquipo ? items : items.filter((i) => !i.responsableId || i.responsableId === p.id || !destinatarios.some((d) => d.id === i.responsableId));

  const detalle: string[] = [];
  let enviados = 0;
  let omitidos = 0;
  for (const p of destinatarios) {
    const s = delDestinatario(p, seguimientos);
    const m = delDestinatario(p, mandatos);
    const f = delDestinatario(p, folios);
    const total = s.length + m.length + f.length;
    if (total === 0) {
      detalle.push(`[sin novedades] ${p.email}`);
      continue;
    }
    const cuerpo =
      seccion(`Seguimientos vencidos (${s.length})`, s.map((i) => i.fila)) +
      seccion(`Mandatos: nuevos avisos de vencimiento (${m.length})`, m.map((i) => i.fila)) +
      seccion(`Libros con pocos folios sin pedido de tomo nuevo (${f.length})`, f.map((i) => i.fila));
    const { error } = await resend.emails.send({
      from: FROM,
      to: p.email,
      subject: `Libros — ${total} aviso${total !== 1 ? "s" : ""} al ${fmtFecha(hoy)}`,
      html: plantilla(`Libros · avisos del día`, `Hola ${esc(p.nombre)}: esto es lo de tus clientes de Libros para hoy.`, cuerpo, `${URL_BOS}/libros`),
    });
    if (error) {
      omitidos++;
      detalle.push(`[omitido] ${p.email}: ${error.message}`);
    } else {
      enviados++;
      detalle.push(`Diario Libros → ${p.email} (${total})`);
    }
  }
  // Recién con algún mail enviado: si fallan todos, el aviso sale al día siguiente.
  if (enviados > 0 && avisosARegistrar.length > 0 && !errEnviados) {
    await admin.from("libros_avisos_mandato").upsert(avisosARegistrar, { ignoreDuplicates: true });
  }
  return { enviados, omitidos, detalle };
}

// ── Resumen semanal: lo del Dashboard, en corto ──────────────────────────────

async function resumenSemanal(admin: Admin, hoy: string): Promise<ResultadoMails> {
  const config = await configLibros(admin);
  const gente = await personas(admin);
  const destinatarios = config.mailSemanalIds
    ? config.mailSemanalIds.map((id) => gente.todas.get(id)).filter((p): p is Persona => !!p)
    : gente.admins.length
      ? gente.admins
      : [{ id: "", nombre: "Administración", email: ADMIN_EMAIL }];
  if (destinatarios.length === 0) return { enviados: 0, omitidos: 0, detalle: ["Resumen semanal: sin destinatarios"] };

  const hace7 = restarDias(hoy, 7);
  const [atraso, { data: snapshotsRaw }, { data: tareasRaw }, { data: estadosRaw }, { data: balancesRaw }, { data: pedidosRaw }, { data: societariosRaw }, { data: servicios }] =
    await Promise.all([
      calcularAtraso(admin, hoy),
      admin.from("libros_snapshot").select("*").order("fecha"),
      admin
        .from("libros_tareas")
        .select("cliente_id, origen, balance_id, pedido_id, fecha_limite, material_listo, prioridad_manual, estado_id, fecha_fin, observaciones"),
      admin.from("libros_estados").select("id, es_final"),
      admin.from("balances").select("id, estado"),
      admin.from("libros_pedidos").select("id, fecha_limite, tipo, mandato_vence"),
      admin.from("clientes_societario").select("*"),
      admin.from("servicios_cliente").select("cliente_id, responsable_id").eq("servicio", "libros").eq("estado", true),
    ]);

  const hoySnap = armarSnapshot(hoy, atraso);
  const snapshots = (snapshotsRaw ?? []) as Snapshot[];
  const base = snapshots.find((s) => s.es_base) ?? null;
  const ref = [...snapshots].reverse().find((s) => !s.es_base && s.fecha <= hace7) ?? base;
  const puestos = (r: Snapshot | null) =>
    r ? Object.entries(hoySnap.por_libro).filter(([id, v]) => v === 0 && r.por_libro[id] !== undefined && r.por_libro[id] !== 0).length : null;
  const empresasAtrasadas = new Set(atraso.libros.filter((l) => l.estado === "atrasado").map((l) => l.clienteId)).size;

  const finales = new Set((estadosRaw ?? []).filter((e) => e.es_final).map((e) => e.id as string));
  const tareas = (tareasRaw ?? []) as {
    cliente_id: string; origen: string; balance_id: string | null; pedido_id: string | null; fecha_limite: string | null;
    material_listo: boolean; prioridad_manual: PrioridadLibro | null; estado_id: string; fecha_fin: string | null; observaciones: string | null;
  }[];
  const copiadosSemana = tareas.filter(
    (t) => finales.has(t.estado_id) && t.fecha_fin && t.fecha_fin >= hace7 && !(t.observaciones ?? "").startsWith("Importado del historial")
  );
  const enviosSemana = copiadosSemana.filter((t) => t.origen === "balance").length;

  const balanceEstado = new Map((balancesRaw ?? []).map((b) => [b.id as string, b.estado as string]));
  const pedidos = (pedidosRaw ?? []) as { id: string; fecha_limite: string | null; tipo: string; mandato_vence: string | null }[];
  const conFecha = new Set(pedidos.filter((p) => p.fecha_limite).map((p) => p.id));
  const renovVencida = new Set(pedidos.filter((p) => p.tipo === "renovacion_autoridades" && p.mandato_vence && p.mandato_vence < hoy).map((p) => p.id));
  const porPrioridad: Record<PrioridadLibro, number> = { P1: 0, P2: 0, P3: 0 };
  for (const t of tareas.filter((x) => !finales.has(x.estado_id))) {
    const p =
      t.prioridad_manual ??
      prioridadSugerida(t as never, {
        pedidoConFecha: !!t.pedido_id && conFecha.has(t.pedido_id),
        balanceEstado: t.balance_id ? balanceEstado.get(t.balance_id) ?? null : null,
        renovacionVencida: !!t.pedido_id && renovVencida.has(t.pedido_id),
      }).prioridad;
    porPrioridad[p]++;
  }

  const responsables = new Map(
    ((servicios ?? []) as { cliente_id: string; responsable_id: string | null }[]).map((s) => [s.cliente_id, s.responsable_id])
  );
  let vencidos = 0;
  let porVencer = 0;
  const primerAviso = config.avisosMandato[0] ?? 90;
  for (const s of (societariosRaw ?? []) as (DatosMandato & { cliente_id: string })[]) {
    if (!responsables.has(s.cliente_id)) continue;
    const vence = vencimientoFinal(s);
    if (!vence) continue;
    const d = diasHasta(vence);
    if (d < 0) vencidos++;
    else if (d <= primerAviso) porVencer++;
  }

  // Por responsable: libros atrasados de sus clientes y copiados de la semana.
  const filasResp = new Map<string, { nombre: string; atrasados: number; copiados: number }>();
  const nombre = (id: string | null) => (id ? gente.todas.get(id)?.nombre ?? "Otra persona" : "Sin responsable");
  for (const l of atraso.libros.filter((x) => x.estado === "atrasado")) {
    const k = l.responsableId ?? "";
    const f = filasResp.get(k) ?? { nombre: l.responsableNombre ?? nombre(l.responsableId), atrasados: 0, copiados: 0 };
    f.atrasados++;
    filasResp.set(k, f);
  }
  for (const t of copiadosSemana) {
    const id = responsables.get(t.cliente_id) ?? null;
    const k = id ?? "";
    const f = filasResp.get(k) ?? { nombre: nombre(id), atrasados: 0, copiados: 0 };
    f.copiados++;
    filasResp.set(k, f);
  }

  const libro = (n: number | null) => (n == null ? "—" : String(n));
  const cuerpo =
    seccion("Puesta al día", [
      ["Libros atrasados", `${hoySnap.libros_atrasados} (en ${empresasAtrasadas} empresas)`],
      ["Hace una semana", ref ? `${ref.libros_atrasados}${ref.es_base ? ` (línea base ${fmtFecha(FECHA_BASE)})` : ""}` : "—"],
      ["Libros puestos al día en la semana", libro(puestos(ref))],
      ["Desde la línea base", libro(puestos(base))],
      ["Sin dato (relevar) · sin libro (presupuesto)", `${hoySnap.libros_sin_dato} · ${hoySnap.libros_sin_libro}`],
      ...(config.fechaMeta ? [["Fecha meta", fmtFecha(config.fechaMeta)]] : []),
    ]) +
    seccion("Mantenimiento", [
      ["Clientes con el envío del último balance completo", `${atraso.envios.filter((e) => e.faltan === 0).length} de ${atraso.envios.length}`],
      ["Envíos anuales copiados en la semana", String(enviosSemana)],
      ["Copiados registrados en BOS en la semana", String(copiadosSemana.length)],
    ]) +
    seccion("Tareas abiertas", (["P1", "P2", "P3"] as const).map((p) => [DEFINICION_PRIORIDAD[p].split(":")[0] + ` (${p})`, String(porPrioridad[p])])) +
    seccion("Mandatos", [
      ["Vencidos", vencidos ? rojo(String(vencidos)) : "0"],
      [`Vencen en ${primerAviso} días`, String(porVencer)],
    ]) +
    seccion(
      "Por responsable",
      Array.from(filasResp.values())
        .sort((a, b) => b.atrasados - a.atrasados)
        .map((f) => [esc(f.nombre), `${f.atrasados} libros atrasados`, `${f.copiados} copiados en la semana`])
    );

  const detalle: string[] = [];
  let enviados = 0;
  let omitidos = 0;
  for (const p of destinatarios) {
    const { error } = await resend.emails.send({
      from: FROM,
      to: p.email,
      subject: `Libros — resumen de la semana al ${fmtFecha(hoy)}`,
      html: plantilla("Libros · resumen semanal", `Cómo viene el módulo Libros al ${fmtFecha(hoy)}.`, cuerpo, `${URL_BOS}/libros/dashboard`),
    });
    if (error) {
      omitidos++;
      detalle.push(`[omitido] ${p.email}: ${error.message}`);
    } else {
      enviados++;
      detalle.push(`Resumen semanal Libros → ${p.email}`);
    }
  }
  return { enviados, omitidos, detalle };
}

/**
 * Lo llama el cron diario (/api/alertas/libros). De lunes a viernes manda el
 * diario a cada responsable; el día configurado, además, el resumen semanal.
 */
export async function enviarMailsLibros(): Promise<ResultadoMails> {
  if (!process.env.RESEND_API_KEY) return { enviados: 0, omitidos: 0, detalle: [], error: "RESEND_API_KEY no configurada" };
  const admin = createAdminClient();
  const { fecha, dia } = hoyArgentina();
  const config = await configLibros(admin);
  const resultados: ResultadoMails[] = [];
  if (dia <= 5) resultados.push(await mailDiario(admin, fecha));
  if (dia === config.mailSemanalDia) resultados.push(await resumenSemanal(admin, fecha));
  return {
    enviados: resultados.reduce((n, r) => n + r.enviados, 0),
    omitidos: resultados.reduce((n, r) => n + r.omitidos, 0),
    detalle: resultados.length ? resultados.flatMap((r) => r.detalle) : ["Fin de semana: no se manda nada"],
  };
}
