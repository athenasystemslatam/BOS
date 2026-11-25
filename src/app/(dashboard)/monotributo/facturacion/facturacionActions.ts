"use server";

import { refrescarMonotributo } from "@/lib/monotributoServer";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { requireEditorMonotributo } from "@/lib/monotributoServer";
import { registrarHistorial, type EntradaHistorial } from "@/lib/monotributoHistorial";
import { borrarVersion, crearVersion, faltaSql } from "@/lib/monotributoFacturacionServer";
import { leerFecha } from "@/lib/calendarioArcaUtil";
import { CATEGORIAS_MONO, validarCategorias, type FilaCategoria } from "@/lib/monotributoFacturacion";

type Resultado = { error: string } | { ok: true; historialIds: string[] };

async function editor(): Promise<{ id: string } | { error: string }> {
  try {
    return { id: (await requireEditorMonotributo()).id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
}

const SIN_SQL = "Falta correr el SQL de Facturación (add_monotributo_facturacion.sql).";

// ── Carga por cliente y control ──

export interface CambiosCarga {
  total_facturado?: number | null;
  ficha_enviada?: boolean;
  ficha_enviada_fecha?: string | null;
  nota?: string | null;
}

export async function guardarCarga(clienteId: string, controlId: string, cambios: CambiosCarga): Promise<Resultado> {
  const yo = await editor();
  if ("error" in yo) return yo;

  const limpio: Record<string, unknown> = {};
  if ("total_facturado" in cambios) {
    const t = cambios.total_facturado;
    if (t !== null && (typeof t !== "number" || !Number.isFinite(t) || t < 0)) return { error: "El total tiene que ser un importe (ej. 12.480.000,00)." };
    limpio.total_facturado = t === null ? null : Math.round(t * 100) / 100;
  }
  if ("ficha_enviada" in cambios) limpio.ficha_enviada = !!cambios.ficha_enviada;
  if ("ficha_enviada_fecha" in cambios) {
    const f = cambios.ficha_enviada_fecha ? leerFecha(cambios.ficha_enviada_fecha) : null;
    if (cambios.ficha_enviada_fecha && !f) return { error: "La fecha de envío no es válida." };
    limpio.ficha_enviada_fecha = f;
  }
  if ("nota" in cambios) limpio.nota = (cambios.nota ?? "").trim() || null;
  if (!Object.keys(limpio).length) return { ok: true, historialIds: [] };

  const admin = createAdminClient();
  const [{ data: servicio }, { data: control }, { data: antes, error: errLeer }] = await Promise.all([
    admin.from("servicios_cliente").select("cliente_id").eq("cliente_id", clienteId).eq("servicio", "monotributo").eq("estado", true).maybeSingle(),
    admin.from("monotributo_controles").select("anio, mes").eq("id", controlId).maybeSingle(),
    admin.from("monotributo_facturacion").select("*").eq("cliente_id", clienteId).eq("control_id", controlId).maybeSingle(),
  ]);
  if (errLeer) return { error: faltaSql(errLeer) ? SIN_SQL : errLeer.message };
  if (!servicio) return { error: "El cliente no tiene Monotributo activo." };
  if (!control) return { error: "Ese control ya no existe." };

  const { data: fila, error } = await admin.from("monotributo_facturacion")
    .upsert({ cliente_id: clienteId, control_id: controlId, ...limpio, updated_at: new Date().toISOString(), updated_por: yo.id }, { onConflict: "cliente_id,control_id" })
    .select("id").single();
  if (error) return { error: error.message };

  const prev = (antes ?? {}) as Record<string, unknown>;
  const { anio, mes } = control as { anio: number; mes: number };
  const historial: EntradaHistorial[] = Object.entries(limpio)
    .filter(([k, v]) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(v ?? null) && !(k === "ficha_enviada" && !prev[k] && !v))
    .map(([k, v]) => ({
      cliente_id: clienteId, anio, mes, entidad: "facturacion", campo: k,
      valor_anterior: k === "total_facturado" && prev[k] !== undefined && prev[k] !== null ? Number(prev[k]) : (prev[k] ?? null),
      valor_nuevo: v, usuario_id: yo.id, ref_id: (fila as { id: string }).id,
    }));
  const historialIds = await registrarHistorial(admin, historial);
  revalidatePath("/monotributo/facturacion");
  return { ok: true, historialIds };
}

// ── Tabla de categorías (versiones) ──

export async function guardarVersionCategorias(vigenteDesde: string, filas: FilaCategoria[], fuente: string | null, nota: string | null): Promise<Resultado> {
  const yo = await editor();
  if ("error" in yo) return yo;
  const fecha = leerFecha(vigenteDesde);
  if (!fecha) return { error: "Falta la fecha \"vigente desde\" (o no es válida)." };
  const limpias: FilaCategoria[] = [];
  for (const f of filas) {
    if (!CATEGORIAS_MONO.includes(f.categoria)) return { error: `Categoría inválida: ${f.categoria}.` };
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const fila = { categoria: f.categoria, tope_anual: Number(f.tope_anual), cuota_servicios: n(f.cuota_servicios), cuota_venta: n(f.cuota_venta) };
    if (!Number.isFinite(fila.tope_anual) || [fila.cuota_servicios, fila.cuota_venta].some((c) => c !== null && !(Number.isFinite(c) && c >= 0))) {
      return { error: `Categoría ${f.categoria}: hay un importe inválido.` };
    }
    limpias.push(fila);
  }
  const errores = validarCategorias(limpias);
  if (errores.length) return { error: errores.join(" ") };

  const admin = createAdminClient();
  const r = await crearVersion(admin, fecha, limpias, (fuente ?? "").trim() || null, (nota ?? "").trim() || null, yo.id);
  if ("error" in r) return { error: /monotributo_categorias/.test(r.error) ? SIN_SQL : r.error };
  refrescarMonotributo();
  return { ok: true, historialIds: r.historialIds };
}

/** Borrar una versión completa: solo administradores (queda en el historial y se puede restaurar). */
export async function borrarVersionCategorias(id: string): Promise<Resultado> {
  let yoId: string;
  try {
    yoId = (await requireAdmin()).id;
  } catch {
    return { error: "Borrar una versión de la tabla de categorías queda solo para administradores." };
  }
  const r = await borrarVersion(createAdminClient(), id, yoId);
  if ("ok" in r) refrescarMonotributo();
  return r;
}

// ── Controles de facturación ──

export interface FilaControlEdit {
  id: string | null; // null = nuevo
  mes: number;
  fecha_corte: string;
  es_cierre_semestre: boolean;
  nota: string | null;
}

export async function guardarControles(anio: number, filas: FilaControlEdit[]): Promise<Resultado> {
  const yo = await editor();
  if ("error" in yo) return yo;
  if (!(anio >= 2020 && anio <= 2100)) return { error: "Año inválido." };
  if (new Set(filas.map((f) => f.mes)).size !== filas.length) return { error: "Hay dos controles en el mismo mes." };

  const admin = createAdminClient();
  const { data: actuales, error: errLeer } = await admin.from("monotributo_controles").select("*").eq("anio", anio);
  if (errLeer) return { error: faltaSql(errLeer) ? SIN_SQL : errLeer.message };
  const porId = new Map(((actuales ?? []) as (FilaControlEdit & { id: string })[]).map((c) => [c.id, c]));

  const historial: EntradaHistorial[] = [];
  const ahora = new Date().toISOString();
  for (const f of filas) {
    if (!(f.mes >= 1 && f.mes <= 12)) return { error: "Mes inválido." };
    const corte = leerFecha(f.fecha_corte);
    if (!corte) return { error: `Control de ${f.mes}/${anio}: la fecha de corte no es válida.` };
    const nueva = { fecha_corte: corte, es_cierre_semestre: !!f.es_cierre_semestre, nota: (f.nota ?? "").trim() || null };
    if (!f.id) {
      const { data, error } = await admin.from("monotributo_controles")
        .insert({ anio, mes: f.mes, ...nueva, updated_por: yo.id }).select("id").single();
      if (error) return { error: error.code === "23505" ? `Ya hay un control en ${f.mes}/${anio}.` : error.message };
      historial.push({ cliente_id: null, anio, mes: f.mes, entidad: "control", campo: "alta", valor_anterior: null, valor_nuevo: { anio, mes: f.mes, ...nueva }, usuario_id: yo.id, ref_id: (data as { id: string }).id });
      continue;
    }
    const a = porId.get(f.id);
    if (!a) return { error: "Un control ya no existe: recargá la página." };
    const cambios = (Object.keys(nueva) as (keyof typeof nueva)[]).filter((k) => (a[k] ?? null) !== nueva[k]);
    if (!cambios.length) continue;
    const { error } = await admin.from("monotributo_controles").update({ ...nueva, updated_at: ahora, updated_por: yo.id }).eq("id", f.id);
    if (error) return { error: error.message };
    for (const k of cambios) {
      historial.push({ cliente_id: null, anio, mes: f.mes, entidad: "control", campo: k, valor_anterior: a[k] ?? null, valor_nuevo: nueva[k], usuario_id: yo.id, ref_id: f.id });
    }
  }
  const historialIds = await registrarHistorial(admin, historial);
  refrescarMonotributo();
  return { ok: true, historialIds };
}

/** Saca un control. Si ya tiene datos cargados, solo un administrador (y se avisa antes en pantalla). */
export async function borrarControl(id: string): Promise<Resultado> {
  const yo = await editor();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const [{ data: c }, { count }] = await Promise.all([
    admin.from("monotributo_controles").select("*").eq("id", id).maybeSingle(),
    admin.from("monotributo_facturacion").select("id", { count: "exact", head: true }).eq("control_id", id),
  ]);
  if (!c) return { error: "Ese control ya no existe." };
  if ((count ?? 0) > 0) {
    try {
      await requireAdmin();
    } catch {
      return { error: `Ese control tiene ${count} carga(s): solo un administrador lo puede sacar.` };
    }
  }
  const ctrl = c as { anio: number; mes: number; fecha_corte: string; es_cierre_semestre: boolean; nota: string | null };
  // Las cargas se borran con el control (FK): se guardan en el historial para poder restaurarlas.
  const { data: cargas } = count
    ? await admin.from("monotributo_facturacion").select("cliente_id, total_facturado, origen, ficha_enviada, ficha_enviada_fecha, nota").eq("control_id", id)
    : { data: [] };
  const { error } = await admin.from("monotributo_controles").delete().eq("id", id);
  if (error) return { error: error.message };
  const historialIds = await registrarHistorial(admin, [{
    cliente_id: null, anio: ctrl.anio, mes: ctrl.mes, entidad: "control", campo: "baja",
    valor_anterior: { anio: ctrl.anio, mes: ctrl.mes, fecha_corte: ctrl.fecha_corte, es_cierre_semestre: ctrl.es_cierre_semestre, nota: ctrl.nota, cargas: cargas ?? [] },
    valor_nuevo: null, usuario_id: yo.id, ref_id: id, nota: count ? `Tenía ${count} carga(s), borradas con el control` : null,
  }]);
  refrescarMonotributo();
  return { ok: true, historialIds };
}

/** Umbral de "cerca del tope" (amarillo), en % del tope. */
export async function guardarUmbral(umbral: number): Promise<Resultado> {
  const yo = await editor();
  if ("error" in yo) return yo;
  if (!(Number.isFinite(umbral) && umbral >= 50 && umbral < 100)) return { error: "El umbral tiene que estar entre 50 y 99 %." };
  const admin = createAdminClient();
  const { data: antes, error: errLeer } = await admin.from("monotributo_config").select("valor").eq("clave", "umbral_amarillo").maybeSingle();
  if (errLeer) return { error: faltaSql(errLeer) ? SIN_SQL : errLeer.message };
  const anterior = (antes as { valor: unknown } | null)?.valor ?? null;
  if (Number(anterior) === umbral) return { ok: true, historialIds: [] };
  const { error } = await admin.from("monotributo_config").upsert({ clave: "umbral_amarillo", valor: umbral, updated_at: new Date().toISOString(), updated_por: yo.id });
  if (error) return { error: error.message };
  const historialIds = await registrarHistorial(admin, [{ cliente_id: null, entidad: "config", campo: "umbral_amarillo", valor_anterior: anterior, valor_nuevo: umbral, usuario_id: yo.id }]);
  refrescarMonotributo();
  return { ok: true, historialIds };
}
