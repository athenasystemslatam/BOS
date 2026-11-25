"use server";

import { refrescarMonotributo } from "@/lib/monotributoServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { reabrirAlertaResuelta, reabrirMarca, requireEditorMonotributo, sincronizarRevisionesCliente } from "@/lib/monotributoServer";
import { registrarHistorial, type EntidadHistorial } from "@/lib/monotributoHistorial";
import { revertirResponsableMonotributo } from "@/lib/asignacionesServicio";
import { revertirFacturacion } from "@/lib/monotributoFacturacionServer";
import { columnasContacto, emailsDeCliente, limpiarEmails, limpiarTelefonos, telefonosDeCliente } from "@/lib/contactos";

type Admin = ReturnType<typeof createAdminClient>;

export interface EntradaHistorialVista {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  mes: number | null;
  entidad: EntidadHistorial;
  campo: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  usuario: string | null;
  creado_en: string;
  revierte_id: string | null;
  ref_id: string | null;
  revertida: boolean;
  nota: string | null;
}

// Campos que se pueden revertir por entidad (lista cerrada: nunca se escribe una columna que venga del navegador).
const CAMPOS_TAREA = new Set([
  "cuota_estado", "cuota_fecha", "recategorizacion", "categoria", "deuda_estado", "deuda_periodos", "deuda_monto",
  "deuda_aviso", "deuda_aviso_fecha", "deuda_resuelta", "deuda_resuelta_fecha", "intimacion_estado", "intimacion_fecha", "observaciones", "deuda_nota",
]);
const CAMPOS_FICHA = new Set([
  "forma_pago", "paga_desde_cliente_id", "paga_desde_texto", "avisa", "envia_vep", "medio", "destinatario", "mails",
  "whatsapp", "empresa_grupo", "saldo_a_favor", "resolucion_arba", "observaciones",
]);
const CAMPOS_CALENDARIO = new Set(["fecha_vencimiento_cuota", "fecha_limite_recategorizacion", "recategoriza_desde", "nota"]);
const NO_NULOS: Record<string, unknown> = { cuota_estado: "pendiente", deuda_estado: "sin_verificar", deuda_aviso: false, deuda_resuelta: false, recategorizacion: "no_corresponde", avisa: false, envia_vep: false, mails: [] };

const iguales = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Historial de un cliente (de a 50, lo más nuevo primero), para la ficha. */
export async function obtenerHistorialCliente(clienteId: string, desde = 0): Promise<{ entradas: EntradaHistorialVista[]; disponible: boolean }> {
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || (!yo.isAdmin && !areas.includes("monotributo"))) return { entradas: [], disponible: true };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("monotributo_historial")
    .select("*, liquidadoras(nombre)")
    .eq("cliente_id", clienteId)
    .order("creado_en", { ascending: false })
    .range(desde, desde + 49);
  if (error) return { entradas: [], disponible: false };
  const filas = (data ?? []) as (Omit<EntradaHistorialVista, "usuario" | "revertida"> & { liquidadoras: { nombre: string } | null })[];
  // Cuáles de estas ya fueron revertidas (una consulta para todas).
  const { data: rev } = await admin.from("monotributo_historial").select("revierte_id").in("revierte_id", filas.map((f) => f.id));
  const revertidas = new Set(((rev ?? []) as { revierte_id: string }[]).map((r) => r.revierte_id));
  // Cambios de responsable: mostrar el nombre en vez del id (una consulta para todos).
  const idsPersonas = Array.from(new Set(filas.filter((f) => f.entidad === "responsable")
    .flatMap((f) => [f.valor_anterior, f.valor_nuevo]).filter((v): v is string => typeof v === "string")));
  const nombrePersona = new Map<string, string>();
  if (idsPersonas.length) {
    const { data: pers } = await admin.from("liquidadoras").select("id, nombre").in("id", idsPersonas);
    for (const p of (pers ?? []) as { id: string; nombre: string }[]) nombrePersona.set(p.id, p.nombre);
  }
  const nombre = (v: unknown) => (typeof v === "string" ? (nombrePersona.get(v) ?? v) : v);
  return {
    disponible: true,
    entradas: filas.map(({ liquidadoras, ...f }) => ({
      ...f,
      ...(f.entidad === "responsable" ? { valor_anterior: nombre(f.valor_anterior), valor_nuevo: nombre(f.valor_nuevo) } : {}),
      usuario: liquidadoras?.nombre ?? null,
      revertida: revertidas.has(f.id),
    })),
  };
}

async function valorActual(admin: Admin, e: EntradaHistorialVista): Promise<{ valor: unknown; existe: boolean }> {
  if (e.entidad === "tarea") {
    const { data } = await admin.from("monotributo_tareas").select(e.campo).eq("cliente_id", e.cliente_id!).eq("anio", e.anio!).eq("mes", e.mes!).maybeSingle();
    return { valor: (data as Record<string, unknown> | null)?.[e.campo] ?? null, existe: !!data };
  }
  if (e.entidad === "ficha") {
    const { data } = await admin.from("monotributo_clientes").select(e.campo).eq("cliente_id", e.cliente_id!).maybeSingle();
    return { valor: (data as Record<string, unknown> | null)?.[e.campo] ?? null, existe: !!data };
  }
  const { data } = await admin.from("calendario_arca").select(e.campo).eq("anio", e.anio!).eq("mes", e.mes!).maybeSingle();
  return { valor: (data as Record<string, unknown> | null)?.[e.campo] ?? null, existe: !!data };
}

/** Revertir un cambio: vuelve al valor anterior y deja una entrada nueva en el historial
 * (nunca borra). Si el campo cambió después, devuelve `conflicto` para avisar antes. */
export async function revertirCambio(
  id: string,
  forzar = false
): Promise<{ error: string } | { conflicto: true; actual: unknown } | { ok: true; historialIds: string[] }> {
  let yo;
  try {
    yo = await requireEditorMonotributo();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  const { data, error: errLeer } = await admin.from("monotributo_historial").select("*").eq("id", id).maybeSingle();
  if (errLeer) return { error: "Falta correr el SQL del historial (add_monotributo_historial.sql)." };
  const e = data as EntradaHistorialVista | null;
  if (!e) return { error: "No se encontró el cambio." };

  if (e.entidad === "responsable") return revertirResponsableMonotributo(e.id);
  // Mails y teléfonos: viven en clientes (la lista general de contactos), no en la ficha de Monotributo.
  if (e.entidad === "ficha" && (e.campo === "emails_contacto_detalle" || e.campo === "telefonos_detalle")) {
    const { data: c } = await admin.from("clientes").select("*").eq("id", e.cliente_id!).maybeSingle();
    if (!c) return { error: "No se encontró el cliente." };
    const emails = emailsDeCliente(c);
    const tels = telefonosDeCliente(c);
    const actual = e.campo === "emails_contacto_detalle" ? emails : tels;
    if (!iguales(actual, e.valor_nuevo) && !forzar) return { conflicto: true, actual };
    const nuevo = Array.isArray(e.valor_anterior) ? e.valor_anterior : [];
    const cols = e.campo === "emails_contacto_detalle"
      ? columnasContacto(limpiarEmails(nuevo), tels)
      : columnasContacto(emails, limpiarTelefonos(nuevo));
    const { error } = await admin.from("clientes").update({ ...cols, fecha_modificacion: new Date().toISOString() }).eq("id", e.cliente_id!);
    if (error) return { error: error.message };
    await sincronizarRevisionesCliente(admin, e.cliente_id!, yo.id).catch(() => undefined);
    const historialIds = await registrarHistorial(admin, [{
      cliente_id: e.cliente_id, entidad: "ficha", campo: e.campo, valor_anterior: actual, valor_nuevo: nuevo,
      usuario_id: yo.id, revierte_id: e.id, nota: "Revertido",
    }]);
    refrescarMonotributo("/");
    return { ok: true, historialIds };
  }
  if (e.entidad === "facturacion" || e.entidad === "control" || e.entidad === "categorias" || e.entidad === "config") {
    const r = await revertirFacturacion(admin, e, { id: yo.id, isAdmin: yo.isAdmin }, forzar);
    if ("ok" in r) refrescarMonotributo();
    return r;
  }
  // Marca o alerta resuelta: revertir = reabrirla (vuelve a pendiente, queda en el historial).
  if (e.entidad === "revision" || e.entidad === "alerta") {
    const nuevoEstado = (e.valor_nuevo as { estado?: string } | null)?.estado;
    if (nuevoEstado !== "resuelta" || !e.ref_id) return { error: "Eso ya está pendiente: no hay nada que reabrir." };
    const r = e.entidad === "revision" ? await reabrirMarca(admin, e.ref_id, yo.id) : await reabrirAlertaResuelta(admin, e.ref_id, yo.id);
    if ("error" in r) return r;
    refrescarMonotributo();
    return { ok: true, historialIds: r.historialIds };
  }
  const permitidos = e.entidad === "tarea" ? CAMPOS_TAREA : e.entidad === "ficha" ? CAMPOS_FICHA : CAMPOS_CALENDARIO;
  if (!permitidos.has(e.campo)) return { error: "Ese cambio no se puede revertir desde acá." };

  const { valor: actual } = await valorActual(admin, e);
  if (!iguales(actual, e.valor_nuevo) && !forzar) return { conflicto: true, actual };

  const nuevo = e.valor_anterior ?? NO_NULOS[e.campo] ?? null;
  const ahora = new Date().toISOString();
  let errorEscritura: string | null = null;
  if (e.entidad === "tarea") {
    const cambios: Record<string, unknown> = { [e.campo]: nuevo, updated_at: ahora };
    if (e.campo === "cuota_estado") Object.assign(cambios, { estado_cambiado_en: ahora, estado_cambiado_por: yo.id, origen: "manual" });
    const { error } = await admin.from("monotributo_tareas").update(cambios).eq("cliente_id", e.cliente_id!).eq("anio", e.anio!).eq("mes", e.mes!);
    errorEscritura = error?.message ?? null;
    if (!errorEscritura && e.campo === "cuota_estado") {
      await admin.from("monotributo_eventos").insert({
        cliente_id: e.cliente_id, anio: e.anio, mes: e.mes, estado_anterior: actual, estado_nuevo: nuevo,
        origen: "manual", creado_por: yo.id, nota: "Revertido",
      });
    }
  } else if (e.entidad === "ficha") {
    const { error } = await admin.from("monotributo_clientes").update({ [e.campo]: nuevo, updated_at: ahora, updated_por: yo.id }).eq("cliente_id", e.cliente_id!);
    errorEscritura = error?.message ?? null;
    if (!errorEscritura) await sincronizarRevisionesCliente(admin, e.cliente_id!, yo.id).catch(() => undefined);
  } else {
    const { error } = await admin.from("calendario_arca").update({ [e.campo]: nuevo, updated_at: ahora, updated_por: yo.id }).eq("anio", e.anio!).eq("mes", e.mes!);
    errorEscritura = error?.message ?? null;
  }
  if (errorEscritura) return { error: errorEscritura };

  const historialIds = await registrarHistorial(admin, [{
    cliente_id: e.cliente_id, anio: e.anio, mes: e.mes, entidad: e.entidad, campo: e.campo,
    valor_anterior: actual, valor_nuevo: nuevo, usuario_id: yo.id, revierte_id: e.id, nota: "Revertido",
  }]);
  refrescarMonotributo();
  return { ok: true, historialIds };
}

/** "Deshacer" del aviso que aparece después de un cambio: revierte esas entradas (de la última a la primera). */
export async function deshacerCambios(ids: string[]): Promise<{ error: string } | { ok: true }> {
  for (const id of [...ids].reverse()) {
    const r = await revertirCambio(id, true);
    if ("error" in r) return { error: r.error };
  }
  return { ok: true };
}
