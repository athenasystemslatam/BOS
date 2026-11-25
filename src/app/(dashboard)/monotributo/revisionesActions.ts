"use server";

import { refrescarMonotributo } from "@/lib/monotributoServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { DATOS_VACIOS, valorCampo, type DatosMonotributoCliente, type Revision } from "@/lib/monotributo";
import { conContacto, enTandas, leerContactos, reabrirMarca, requireEditorMonotributo } from "@/lib/monotributoServer";
import { registrarHistorial, type EntradaHistorial } from "@/lib/monotributoHistorial";

type Admin = ReturnType<typeof createAdminClient>;
type Resultado = { error: string } | { ok: true; resueltas: number; historialIds: string[] };

function limpiarNota(nota: string | null | undefined): string | null {
  const t = (nota ?? "").trim();
  return t === "" ? null : t.slice(0, 500);
}

async function marcasPendientes(admin: Admin, ids: string[]) {
  const out: Revision[] = [];
  for (const tanda of enTandas(Array.from(new Set(ids)))) {
    const { data, error } = await admin.from("monotributo_revisiones").select("*").in("id", tanda).eq("estado", "pendiente");
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Revision[]));
  }
  return out;
}

/** Valor que queda "confirmado así" por marca (mientras no cambie, la regla no vuelve a marcar).
 * Todo en lote: una consulta por tabla, no una por marca. */
async function valoresActuales(admin: Admin, marcas: Revision[]): Promise<Map<string, string>> {
  const clientes = Array.from(new Set(marcas
    .filter((r) => r.campo === "responsable" || r.campo === "forma_pago" || r.campo === "medio_contacto")
    .map((r) => r.cliente_id)));
  const datos = new Map<string, DatosMonotributoCliente>();
  const resp = new Map<string, string | null>();
  for (const tanda of enTandas(clientes)) {
    const [{ data: fichas }, { data: servs }, contactos] = await Promise.all([
      admin.from("monotributo_clientes").select("*").in("cliente_id", tanda),
      admin.from("servicios_cliente").select("cliente_id, responsable_id").in("cliente_id", tanda)
        .eq("servicio", "monotributo").eq("subtipo", "general"),
      leerContactos(admin, tanda),
    ]);
    for (const f of (fichas ?? []) as (DatosMonotributoCliente & { cliente_id: string })[]) {
      datos.set(f.cliente_id, conContacto({ ...DATOS_VACIOS, ...f }, contactos.get(f.cliente_id)));
    }
    for (const s of (servs ?? []) as { cliente_id: string; responsable_id: string | null }[]) resp.set(s.cliente_id, s.responsable_id);
  }
  const out = new Map<string, string>();
  for (const r of marcas) {
    if (r.campo === "responsable" || r.campo === "forma_pago" || r.campo === "medio_contacto") {
      out.set(r.id, valorCampo(r.campo, datos.get(r.cliente_id) ?? { ...DATOS_VACIOS, mails: [] }, resp.get(r.cliente_id) ?? null));
    } else out.set(r.id, r.campo === "pago" ? "enviado" : r.campo === "deuda" ? "sin_verificar" : "confirmado");
  }
  return out;
}

const entradaRevision = (r: Revision, usuario: string | null, despues: Record<string, unknown>, nota: string | null): EntradaHistorial => ({
  cliente_id: r.cliente_id, anio: r.anio, mes: r.mes, entidad: "revision", campo: r.campo,
  valor_anterior: { estado: "pendiente", motivo: r.motivo }, valor_nuevo: { ...despues, motivo: r.motivo },
  usuario_id: usuario, ref_id: r.id, nota,
});

/** Resuelve marcas como "confirmado" en lote (agrupadas por valor: una actualización por grupo). */
async function confirmarMarcas(admin: Admin, marcas: Revision[], yoId: string, nota: string | null, valorFijo?: string) {
  const valores = valorFijo ? null : await valoresActuales(admin, marcas);
  const porValor = new Map<string, string[]>();
  for (const r of marcas) {
    const v = valorFijo ?? valores!.get(r.id)!;
    if (!porValor.has(v)) porValor.set(v, []);
    porValor.get(v)!.push(r.id);
  }
  const ahora = new Date().toISOString();
  for (const [valor, idsGrupo] of Array.from(porValor.entries())) {
    for (const tanda of enTandas(idsGrupo)) {
      const { error } = await admin.from("monotributo_revisiones")
        .update({ estado: "resuelta", resolucion: "confirmado", resuelta_por: yoId, resuelta_at: ahora, nota, valor_confirmado: valor })
        .in("id", tanda).eq("estado", "pendiente");
      if (error) throw new Error(error.message);
    }
  }
  return registrarHistorial(admin, marcas.map((r) => entradaRevision(r, yoId, { estado: "resuelta", resolucion: "confirmado" }, nota)));
}

/** "Está bien así": la marca sale de revisión con quién, cuándo y la nota. */
export async function confirmarRevisiones(ids: string[], nota: string | null): Promise<Resultado> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (!ids.length) return { ok: true, resueltas: 0, historialIds: [] };
  const admin = createAdminClient();
  try {
    const marcas = await marcasPendientes(admin, ids);
    const historialIds = await confirmarMarcas(admin, marcas, yoId, limpiarNota(nota));
    refrescarMonotributo();
    return { ok: true, resueltas: marcas.length, historialIds };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar." };
  }
}

/** "Confirmar sin deuda" (DEUDA vacía): carga Deuda = No en el último mes del
 * cliente y la marca sale de revisión, con quién y cuándo. */
export async function confirmarSinDeuda(ids: string[], nota: string | null): Promise<Resultado> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  try {
    const marcas = (await marcasPendientes(admin, ids)).filter((r) => r.campo === "deuda");
    if (!marcas.length) return { ok: true, resueltas: 0, historialIds: [] };
    const clientes = Array.from(new Set(marcas.map((r) => r.cliente_id)));

    const ultimas: { id: string; cliente_id: string; anio: number; mes: number }[] = [];
    for (const tanda of enTandas(clientes)) {
      const { data, error } = await admin.from("monotributo_tareas")
        .select("id, cliente_id, anio, mes, deuda_estado").in("cliente_id", tanda);
      if (error) return { error: error.message };
      const ultima = new Map<string, { id: string; cliente_id: string; anio: number; mes: number; deuda_estado: string }>();
      for (const t of (data ?? []) as { id: string; cliente_id: string; anio: number; mes: number; deuda_estado: string }[]) {
        const u = ultima.get(t.cliente_id);
        if (!u || t.anio * 100 + t.mes > u.anio * 100 + u.mes) ultima.set(t.cliente_id, t);
      }
      ultima.forEach((u) => { if (u.deuda_estado === "sin_verificar") ultimas.push(u); });
    }
    for (const tanda of enTandas(ultimas.map((u) => u.id))) {
      const { error } = await admin.from("monotributo_tareas")
        .update({ deuda_estado: "no", updated_at: new Date().toISOString() })
        .in("id", tanda).eq("deuda_estado", "sin_verificar");
      if (error) return { error: error.message };
    }
    const idsTareas = await registrarHistorial(admin, ultimas.map((u) => ({
      cliente_id: u.cliente_id, anio: u.anio, mes: u.mes, entidad: "tarea" as const, campo: "deuda_estado",
      valor_anterior: "sin_verificar", valor_nuevo: "no", usuario_id: yoId, nota: "Confirmar sin deuda",
    })));
    const idsMarcas = await confirmarMarcas(admin, marcas, yoId, limpiarNota(nota) ?? "Sin deuda", "no");
    refrescarMonotributo();
    return { ok: true, resueltas: marcas.length, historialIds: [...idsTareas, ...idsMarcas] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar." };
  }
}

/** "Reabrir": una marca resuelta por error vuelve a pendiente. Queda en el historial. */
export async function reabrirRevision(id: string): Promise<{ error: string } | { ok: true; historialIds: string[] }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const r = await reabrirMarca(createAdminClient(), id, yoId);
  if ("error" in r) return r;
  refrescarMonotributo();
  return { ok: true, historialIds: r.historialIds };
}

export interface MarcaResuelta {
  id: string;
  cliente_id: string;
  cliente: string;
  campo: Revision["campo"];
  motivo: string;
  anio: number | null;
  mes: number | null;
  resolucion: Revision["resolucion"];
  nota: string | null;
  resuelta_at: string | null;
  resuelta_por: string | null;
}

/** Últimas marcas resueltas (de a 50), para "Reabrir" lo que se resolvió por error. */
export async function listarResueltas(desde: number): Promise<MarcaResuelta[]> {
  try {
    await requireEditorMonotributo();
  } catch {
    return [];
  }
  const admin = createAdminClient();
  const { data } = await admin.from("monotributo_revisiones")
    .select("id, cliente_id, campo, motivo, anio, mes, resolucion, nota, resuelta_at, resuelta_por, clientes(nombre)")
    .eq("estado", "resuelta")
    .order("resuelta_at", { ascending: false, nullsFirst: false })
    .range(desde, desde + 49);
  return ((data ?? []) as unknown as (Omit<MarcaResuelta, "cliente"> & { clientes: { nombre: string } | null })[])
    .map(({ clientes, ...r }) => ({ ...r, cliente: clientes?.nombre ?? "—" }));
}

export interface MarcaPendienteVista {
  id: string;
  cliente_id: string;
  cliente: string;
  campo: Revision["campo"];
  motivo: string;
  anio: number | null;
  mes: number | null;
}

/** Marcas pendientes de un grupo (campo + gravedad), para desplegar en A revisar sin traerlas todas al entrar. */
export async function listarPendientesGrupo(campo: Revision["campo"], gravedad: "rojo" | "amarillo"): Promise<MarcaPendienteVista[]> {
  try {
    await requireEditorMonotributo();
  } catch {
    // Consulta: solo lectura también puede ver el detalle.
  }
  const admin = createAdminClient();
  const filas: MarcaPendienteVista[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await admin.from("monotributo_revisiones")
      .select("id, cliente_id, campo, motivo, anio, mes, clientes(nombre)")
      .eq("estado", "pendiente").eq("campo", campo).eq("gravedad", gravedad)
      .order("id").range(desde, desde + 999);
    const lote = ((data ?? []) as unknown as (Omit<MarcaPendienteVista, "cliente"> & { clientes: { nombre: string } | null })[])
      .map(({ clientes, ...r }) => ({ ...r, cliente: clientes?.nombre ?? "—" }));
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas.sort((a, b) => a.cliente.localeCompare(b.cliente));
}

/** "Confirmar todas" de un grupo de amarillas (por campo), respetando el filtro de responsable.
 * modo "sin_deuda" carga además Deuda = No. Todo queda en el historial. */
export async function confirmarGrupo(
  campo: Revision["campo"],
  ids: string[],
  nota: string | null,
  modo: "confirmar" | "sin_deuda" = "confirmar"
): Promise<Resultado> {
  if (modo === "sin_deuda") return confirmarSinDeuda(ids, nota ?? "Sin deuda (confirmado en lote)");
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  try {
    const marcas = (await marcasPendientes(admin, ids)).filter((r) => r.campo === campo && r.gravedad === "amarillo");
    const historialIds = await confirmarMarcas(admin, marcas, yoId, limpiarNota(nota) ?? "Confirmadas en lote");
    refrescarMonotributo();
    return { ok: true, resueltas: marcas.length, historialIds };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar." };
  }
}
