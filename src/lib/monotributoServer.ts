import { createAdminClient } from "@/lib/supabase/admin";
import { requireAreaOrAdmin } from "@/lib/auth";
import { registrarHistorial } from "@/lib/monotributoHistorial";
import {
  DATOS_VACIOS,
  evaluarReglasCliente,
  hoyArgentina,
  valorCampo,
  type CampoRevision,
  type DatosMonotributoCliente,
  type Revision,
} from "@/lib/monotributo";
import { emailsDeCliente, telefonoWhatsapp, telefonosDeCliente } from "@/lib/contactos";
import type { EmailContacto, TelefonoContacto } from "@/types";

type Admin = ReturnType<typeof createAdminClient>;

export type ContactoMono = { mails: string[]; whatsapp: string | null };

/** Mails y teléfono para WhatsApp de cada cliente, de la lista general de contactos (tabla clientes):
 * la misma que se edita en Panel General, Clientes, Seguimiento de Sueldos y la ficha. */
export async function leerContactos(admin: Admin, ids: string[]): Promise<Map<string, ContactoMono>> {
  type Fila = { id: string; emails_contacto: string[] | null; emails_contacto_detalle: EmailContacto[] | null; telefono: string | null; telefonos_detalle?: TelefonoContacto[] | null };
  const out = new Map<string, ContactoMono>();
  for (const tanda of enTandas(Array.from(new Set(ids)))) {
    let { data, error }: { data: unknown[] | null; error: { message: string } | null } = await admin.from("clientes")
      .select("id, emails_contacto, emails_contacto_detalle, telefono, telefonos_detalle").in("id", tanda);
    // Sin el SQL de contactos todavía: se lee el teléfono viejo.
    if (error) ({ data, error } = await admin.from("clientes").select("id, emails_contacto, emails_contacto_detalle, telefono").in("id", tanda));
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as Fila[]) {
      out.set(c.id, { mails: emailsDeCliente(c).map((e) => e.email), whatsapp: telefonoWhatsapp(telefonosDeCliente(c)) });
    }
  }
  return out;
}

/** Datos de Monotributo del cliente con los contactos de la lista general. */
export function conContacto<T extends DatosMonotributoCliente>(d: T, c: ContactoMono | undefined): T {
  return { ...d, mails: c?.mails ?? [], whatsapp: c?.whatsapp ?? null };
}

/** Trae todas las filas de a 1000 (PostgREST corta ahí, ítem 78). */
export async function traerPaginado<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

export async function leerDatosCliente(admin: Admin, clienteId: string): Promise<DatosMonotributoCliente> {
  const { data } = await admin
    .from("monotributo_clientes")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const contacto = (await leerContactos(admin, [clienteId])).get(clienteId);
  return conContacto({ ...DATOS_VACIOS, ...(data ?? {}) } as DatosMonotributoCliente, contacto);
}

const CAMPOS_REGLA_CLIENTE = ["responsable", "forma_pago", "medio_contacto"] as const;

/** Crea o resuelve las marcas de los datos fijos del cliente según las reglas.
 * - Hay problema y no hay marca pendiente → crea una (salvo que se haya
 *   confirmado "Está bien así" con este mismo valor).
 * - No hay problema y hay marca pendiente → se resuelve sola como "corregido".
 * Solo aplica a clientes con Monotributo activo. Una marca nunca bloquea nada. */
export async function sincronizarRevisionesCliente(
  admin: Admin,
  clienteId: string,
  resueltaPor: string | null
): Promise<void> {
  const [{ data: servicio }, datos, { data: revsRaw }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("responsable_id")
      .eq("cliente_id", clienteId)
      .eq("servicio", "monotributo")
      .eq("estado", true)
      .maybeSingle(),
    leerDatosCliente(admin, clienteId),
    admin
      .from("monotributo_revisiones")
      .select("*")
      .eq("cliente_id", clienteId)
      .in("campo", [...CAMPOS_REGLA_CLIENTE])
      .order("detectada_at", { ascending: false }),
  ]);
  if (!servicio) return;

  const responsableId = (servicio as { responsable_id: string | null }).responsable_id;
  const revs = (revsRaw ?? []) as Revision[];
  const hallazgos = evaluarReglasCliente(datos, responsableId);
  const ahora = new Date().toISOString();

  for (const campo of CAMPOS_REGLA_CLIENTE) {
    const hallazgo = hallazgos.find((h) => h.campo === campo);
    const pendiente = revs.find((r) => r.campo === campo && r.estado === "pendiente");

    if (!hallazgo) {
      if (pendiente) {
        await admin
          .from("monotributo_revisiones")
          .update({ estado: "resuelta", resolucion: "corregido", resuelta_por: resueltaPor, resuelta_at: ahora })
          .eq("id", pendiente.id);
      }
      continue;
    }

    const valor = valorCampo(campo, datos, responsableId);
    if (pendiente) {
      if (pendiente.motivo !== hallazgo.motivo) {
        await admin.from("monotributo_revisiones").update({ motivo: hallazgo.motivo }).eq("id", pendiente.id);
      }
      continue;
    }
    const confirmadoAsi = revs.some(
      (r) => r.campo === campo && r.resolucion === "confirmado" && r.valor_confirmado === valor
    );
    if (confirmadoAsi) continue;

    await admin.from("monotributo_revisiones").insert({
      cliente_id: clienteId,
      campo,
      motivo: hallazgo.motivo,
      gravedad: hallazgo.gravedad,
      origen: "regla_automatica",
    });
  }
}

/** Parte una lista en tandas (los filtros `.in()` van en la URL: no mandar cientos de ids juntos). */
export function enTandas<T>(lista: T[], tam = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

/** Pasa las reglas automáticas sobre todo el módulo, leyendo solo lo necesario
 * (no todo el historial de meses, para que siga rápido con el tiempo):
 * - datos del cliente (responsable, forma de pago, medio de contacto): crea o resuelve
 * - "verificar pago": ya no se crean marcas (vive en Alertas); las pendientes que
 *   quedan se resuelven solas cuando ese mes deja de estar en Enviado
 * - deuda: la marca "sin verificar" se resuelve sola cuando el último mes tiene Sí/No
 * No vuelve a marcar lo confirmado "Está bien así" con el mismo valor. Solo clientes
 * con Monotributo activo. Lo que se resuelve solo queda en el historial. */
export async function sincronizarRevisionesModulo(admin: Admin): Promise<{ creadas: number; resueltas: number }> {
  type Serv = { cliente_id: string; responsable_id: string | null; estado: boolean };
  type RevMin = Pick<Revision, "id" | "cliente_id" | "anio" | "mes" | "campo" | "motivo">;
  const CAMPOS_REGLA = ["responsable", "forma_pago", "medio_contacto"] as const;

  const [servicios, datosRows, pendientesRows] = await Promise.all([
    traerPaginado<Serv>((d, h) =>
      admin.from("servicios_cliente").select("cliente_id, responsable_id, estado")
        .eq("servicio", "monotributo").eq("subtipo", "general").order("id").range(d, h)
    ),
    traerPaginado<DatosMonotributoCliente & { cliente_id: string }>((d, h) =>
      admin.from("monotributo_clientes").select("cliente_id, forma_pago, medio").order("id").range(d, h)
    ),
    traerPaginado<RevMin>((d, h) =>
      admin.from("monotributo_revisiones").select("id, cliente_id, anio, mes, campo, motivo")
        .eq("estado", "pendiente").order("id").range(d, h)
    ),
  ]);

  const activos = new Map(servicios.filter((s) => s.estado).map((s) => [s.cliente_id, s.responsable_id]));
  const contactos = await leerContactos(admin, servicios.filter((s) => s.estado).map((s) => s.cliente_id));
  const datosPor = new Map(datosRows.map((r) => [r.cliente_id, conContacto({ ...DATOS_VACIOS, ...r }, contactos.get(r.cliente_id))]));
  const clave = (c: string, campo: string, anio: number | null, mes: number | null) => `${c}|${campo}|${anio ?? 0}|${mes ?? 0}`;
  const pendientes = new Map(pendientesRows.map((r) => [clave(r.cliente_id, r.campo, r.anio, r.mes), r]));

  // Reglas de datos del cliente
  const hallazgos = new Map<string, { cliente_id: string; campo: CampoRevision; motivo: string; gravedad: "rojo" | "amarillo"; valor: string }>();
  activos.forEach((responsableId, clienteId) => {
    const datos = datosPor.get(clienteId) ?? conContacto({ ...DATOS_VACIOS }, contactos.get(clienteId));
    for (const h of evaluarReglasCliente(datos, responsableId)) {
      const campo = h.campo as (typeof CAMPOS_REGLA)[number];
      hallazgos.set(clave(clienteId, campo, null, null), {
        cliente_id: clienteId, campo, motivo: h.motivo, gravedad: h.gravedad, valor: valorCampo(campo, datos, responsableId),
      });
    }
  });

  // Solo los meses/clientes que tienen marcas de pago o deuda pendientes (no todo el historial).
  const pago = pendientesRows.filter((r) => r.campo === "pago" && r.anio && r.mes && activos.has(r.cliente_id));
  const deuda = pendientesRows.filter((r) => r.campo === "deuda" && activos.has(r.cliente_id));
  const estadoPago = new Map<string, string>();
  const ultimaDeuda = new Map<string, { orden: number; deuda_estado: string }>();
  const clientesConsulta = Array.from(new Set([...pago, ...deuda].map((r) => r.cliente_id)));
  const desdeAnio = Math.min(...pago.map((r) => r.anio as number), Number(hoyArgentina().slice(0, 4)) - 1);
  for (const tanda of enTandas(clientesConsulta)) {
    const { data } = await admin.from("monotributo_tareas")
      .select("cliente_id, anio, mes, cuota_estado, deuda_estado").in("cliente_id", tanda).gte("anio", desdeAnio);
    for (const t of (data ?? []) as { cliente_id: string; anio: number; mes: number; cuota_estado: string; deuda_estado: string }[]) {
      estadoPago.set(clave(t.cliente_id, "pago", t.anio, t.mes), t.cuota_estado);
      const u = ultimaDeuda.get(t.cliente_id);
      if (!u || t.anio * 100 + t.mes > u.orden) ultimaDeuda.set(t.cliente_id, { orden: t.anio * 100 + t.mes, deuda_estado: t.deuda_estado });
    }
  }

  // Resolver las pendientes que ya no corresponden (solo de clientes activos)
  const aResolver: RevMin[] = [];
  pendientes.forEach((r, k) => {
    if (!activos.has(r.cliente_id)) return;
    if ((CAMPOS_REGLA as readonly string[]).includes(r.campo)) {
      if (!hallazgos.has(k)) aResolver.push(r);
    } else if (r.campo === "pago") {
      const est = estadoPago.get(k);
      if (est && est !== "enviado") aResolver.push(r);
    } else if (r.campo === "deuda") {
      const u = ultimaDeuda.get(r.cliente_id);
      if (u && u.deuda_estado !== "sin_verificar") aResolver.push(r);
    }
  });

  // Crear las que faltan, salvo lo confirmado "Está bien así" con el mismo valor
  // (las confirmadas se leen solo para estos clientes, no todas).
  const candidatos = Array.from(hallazgos.entries()).filter(([k]) => !pendientes.has(k));
  const confirmadas = new Set<string>();
  for (const tanda of enTandas(Array.from(new Set(candidatos.map(([, h]) => h.cliente_id))))) {
    const { data } = await admin.from("monotributo_revisiones").select("cliente_id, campo, valor_confirmado")
      .in("cliente_id", tanda).in("campo", [...CAMPOS_REGLA]).eq("resolucion", "confirmado");
    for (const c of (data ?? []) as { cliente_id: string; campo: string; valor_confirmado: string | null }[]) {
      confirmadas.add(`${clave(c.cliente_id, c.campo, null, null)}=${c.valor_confirmado ?? ""}`);
    }
  }
  const aCrear = candidatos
    .filter(([k, h]) => !confirmadas.has(`${k}=${h.valor}`))
    .map(([, h]) => ({ cliente_id: h.cliente_id, campo: h.campo, motivo: h.motivo, gravedad: h.gravedad, origen: "regla_automatica" }));

  const ahora = new Date().toISOString();
  for (const tanda of enTandas(aResolver.map((r) => r.id))) {
    await admin.from("monotributo_revisiones")
      .update({ estado: "resuelta", resolucion: "corregido", resuelta_at: ahora })
      .in("id", tanda).eq("estado", "pendiente");
  }
  await registrarHistorial(admin, aResolver.map((r) => ({
    cliente_id: r.cliente_id, anio: r.anio, mes: r.mes, entidad: "revision" as const, campo: r.campo,
    valor_anterior: { estado: "pendiente", motivo: r.motivo }, valor_nuevo: { estado: "resuelta", resolucion: "corregido", motivo: r.motivo },
    usuario_id: null, ref_id: r.id, nota: "Se resolvió sola: el dato cambió",
  })));
  for (const filas of enTandas(aCrear, 200)) {
    await admin.from("monotributo_revisiones").insert(filas);
  }
  return { creadas: aCrear.length, resueltas: aResolver.length };
}

/** Edita Monotributo: equipo del módulo o admin. "Solo lectura" (viewer),
 * Cobranzas y Administrativo consultan pero no editan, ni confirman ni
 * resuelven marcas (requireAreaOrAdmin ya rechaza a los dos últimos). */
export async function requireEditorMonotributo() {
  const yo = await requireAreaOrAdmin("monotributo");
  if (yo.rol === "viewer") throw new Error("No tenés permiso para editar — tu rol es de solo lectura.");
  return yo;
}

/** Datos que pasan de un mes al siguiente (como legajos en Sueldos): la deuda,
 * la intimación y la categoría siguen valiendo hasta que alguien las cambie.
 * El estado de la cuota NO se arrastra: cada mes arranca en Pendiente. */
export const CAMPOS_ARRASTRE = [
  "categoria",
  "deuda_estado",
  "deuda_periodos",
  "deuda_texto_original",
  "deuda_monto",
  "deuda_aviso",
  "deuda_aviso_fecha",
  "deuda_resuelta",
  "deuda_resuelta_fecha",
  "intimacion_estado",
  "intimacion_fecha",
  "deuda_nota",
] as const;

type FilaArrastre = { [K in (typeof CAMPOS_ARRASTRE)[number]]?: unknown } & { cliente_id: string; anio: number; mes: number };

/** Lo que se copia de la fila anterior, o null si no hay nada que valga la pena arrastrar. */
export function arrastreDesde(prev: FilaArrastre | null | undefined): Record<string, unknown> | null {
  if (!prev) return null;
  const tieneAlgo = !!prev.categoria || (prev.deuda_estado && prev.deuda_estado !== "sin_verificar") || !!prev.intimacion_estado;
  if (!tieneAlgo) return null;
  // Solo los campos que existen en la fila (deuda_nota puede no existir si falta su SQL).
  const copia: Record<string, unknown> = Object.fromEntries(CAMPOS_ARRASTRE.filter((k) => k in prev).map((k) => [k, prev[k] ?? null]));
  // Columnas NOT NULL de la tabla
  copia.deuda_estado = prev.deuda_estado ?? "sin_verificar";
  copia.deuda_aviso = !!prev.deuda_aviso;
  copia.deuda_resuelta = !!prev.deuda_resuelta;
  return copia;
}

/** Última fila anterior a (anio, mes) de cada cliente pedido. */
export async function ultimaFilaAnterior(admin: Admin, clienteIds: string[], anio: number, mes: number) {
  const ultima = new Map<string, FilaArrastre>();
  for (const tanda of enTandas(clienteIds)) {
    const { data, error } = await admin
      .from("monotributo_tareas")
      .select("*")
      .in("cliente_id", tanda)
      .or(`anio.lt.${anio},and(anio.eq.${anio},mes.lt.${mes})`);
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as unknown as FilaArrastre[]) {
      const u = ultima.get(f.cliente_id);
      if (!u || f.anio * 100 + f.mes > u.anio * 100 + u.mes) ultima.set(f.cliente_id, f);
    }
  }
  return ultima;
}

/** Crea la fila del mes (en Pendiente) a los clientes activos que no la tienen
 * y traen deuda/intimación/categoría del mes anterior. Solo hasta el mes
 * siguiente al actual: no se generan meses lejanos por mirar el selector. */
export async function arrastrarMes(admin: Admin, anio: number, mes: number, esRecategorizacion = false): Promise<number> {
  const [hy, hm] = hoyArgentina().split("-").map(Number);
  if (anio * 12 + mes > hy * 12 + hm + 1) return 0;

  const [servicios, delMes] = await Promise.all([
    traerPaginado<{ cliente_id: string }>((d, h) =>
      admin.from("servicios_cliente").select("cliente_id")
        .eq("servicio", "monotributo").eq("subtipo", "general").eq("estado", true).order("id").range(d, h)
    ),
    traerPaginado<{ cliente_id: string }>((d, h) =>
      admin.from("monotributo_tareas").select("cliente_id").eq("anio", anio).eq("mes", mes).order("id").range(d, h)
    ),
  ]);
  const conFila = new Set(delMes.map((t) => t.cliente_id));
  const faltan = servicios.map((s) => s.cliente_id).filter((id) => !conFila.has(id));
  if (!faltan.length) return 0;

  const previas = await ultimaFilaAnterior(admin, faltan, anio, mes);
  const nuevas: Record<string, unknown>[] = [];
  previas.forEach((prev, clienteId) => {
    const copia = arrastreDesde(prev);
    if (!copia) return;
    nuevas.push({
      cliente_id: clienteId, anio, mes, cuota_estado: "pendiente", origen: "automatico",
      recategorizacion: esRecategorizacion ? "pendiente" : "no_corresponde",
      ...copia,
    });
  });
  for (const tanda of enTandas(nuevas, 200)) {
    await admin.from("monotributo_tareas").upsert(tanda, { onConflict: "cliente_id,anio,mes", ignoreDuplicates: true });
  }
  return nuevas.length;
}

/** Reabre una marca de revisión resuelta (vuelve a pendiente) y lo deja en el historial. */
export async function reabrirMarca(admin: Admin, id: string, usuarioId: string | null): Promise<{ error: string } | { historialIds: string[] }> {
  const { data } = await admin.from("monotributo_revisiones").select("*").eq("id", id).maybeSingle();
  const r = data as Revision | null;
  if (!r) return { error: "No se encontró la marca." };
  if (r.estado === "pendiente") return { historialIds: [] };
  const { error } = await admin.from("monotributo_revisiones")
    .update({ estado: "pendiente", resolucion: null, resuelta_por: null, resuelta_at: null, valor_confirmado: null })
    .eq("id", id);
  if (error) return { error: /unique|duplicate/i.test(error.message) ? "Ya hay una marca pendiente igual para ese cliente." : error.message };
  const historialIds = await registrarHistorial(admin, [{
    cliente_id: r.cliente_id, anio: r.anio, mes: r.mes, entidad: "revision", campo: r.campo,
    valor_anterior: { estado: "resuelta", resolucion: r.resolucion, motivo: r.motivo },
    valor_nuevo: { estado: "pendiente", motivo: r.motivo }, usuario_id: usuarioId, ref_id: r.id, nota: "Reabierta",
  }]);
  return { historialIds };
}

/** Reabre una alerta marcada "Resuelta" (no borra la fila: la marca reabierta) y lo deja en el historial. */
export async function reabrirAlertaResuelta(admin: Admin, id: string, usuarioId: string | null): Promise<{ error: string } | { historialIds: string[] }> {
  const { data, error: errLeer } = await admin.from("monotributo_alertas_resueltas").select("*").eq("id", id).maybeSingle();
  if (errLeer) return { error: errLeer.message };
  const a = data as { id: string; cliente_id: string; tipo: string; anio: number; mes: number; valor: string | null; reabierta_at?: string | null } | null;
  if (!a) return { error: "No se encontró la alerta." };
  if (a.reabierta_at) return { historialIds: [] };
  const { error } = await admin.from("monotributo_alertas_resueltas")
    .update({ reabierta_at: new Date().toISOString(), reabierta_por: usuarioId }).eq("id", id);
  if (error) {
    return { error: /reabierta/.test(error.message) ? "Falta correr el SQL del historial (add_monotributo_historial.sql)." : error.message };
  }
  const historialIds = await registrarHistorial(admin, [{
    cliente_id: a.cliente_id, anio: a.anio, mes: a.mes, entidad: "alerta", campo: a.tipo,
    valor_anterior: { estado: "resuelta", valor: a.valor }, valor_nuevo: { estado: "pendiente" }, usuario_id: usuarioId, ref_id: a.id, nota: "Reabierta",
  }]);
  return { historialIds };
}
