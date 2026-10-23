"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getContextoVencimientos } from "@/lib/vencimientosContablesServer";
import {
  basesPermitidas,
  LABEL_VTO,
  TIPOS_VTO,
  type Prorroga,
  type ReglasVto,
  type TipoVto,
  type VtosBalance,
} from "@/lib/vencimientosContables";

export async function guardarObjetivoArea(area: "sueldos" | "contable", config: Record<string, unknown>) {
  let yo;
  try {
    yo = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  // Se mezcla con lo que ya hay: las reglas de vencimiento (ítem 91) se
  // guardan desde otra tarjeta y no se tienen que pisar entre sí.
  const { data: actual } = await admin.from("objetivos_area").select("config").eq("area", area).maybeSingle();
  const { error } = await admin
    .from("objetivos_area")
    .upsert({
      area,
      config: { ...((actual?.config as Record<string, unknown>) ?? {}), ...config },
      updated_at: new Date().toISOString(),
      updated_by: yo.id,
    });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Ítem 91: reglas de vencimiento de Contable ──────────────────────────

function esFecha(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function guardarReglasVto(reglas: ReglasVto) {
  for (const tipo of TIPOS_VTO) {
    const r = reglas[tipo];
    if (!r || !basesPermitidas(tipo).includes(r.base) || !Number.isInteger(r.dias)) {
      return { error: `Regla inválida para ${LABEL_VTO[tipo]}.` };
    }
  }
  // Los dos números viejos se mantienen en espejo: los usa la excepción en
  // días por cliente (ítem 67) y cualquier lectura que todavía no pase por
  // resolverReglas.
  return guardarObjetivoArea("contable", {
    reglas_vto: reglas,
    balance_dias_vto: reglas.balance.dias,
    f855_dias_vto_extra: reglas.f855.dias,
  });
}

export async function crearProrroga(p: {
  tipo: TipoVto;
  cierre_desde: string;
  cierre_hasta: string;
  fecha: string;
  motivo: string;
}) {
  let yo;
  try {
    yo = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (!TIPOS_VTO.includes(p.tipo)) return { error: "Vencimiento inválido." };
  if (!esFecha(p.cierre_desde) || !esFecha(p.cierre_hasta) || !esFecha(p.fecha)) {
    return { error: "Completá las tres fechas." };
  }
  if (p.cierre_desde > p.cierre_hasta) return { error: "El cierre 'desde' tiene que ser anterior al 'hasta'." };
  if (!p.motivo.trim()) return { error: "El motivo es obligatorio." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contable_vto_prorrogas")
    .insert({ ...p, motivo: p.motivo.trim(), creado_por: yo.id })
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, prorroga: data as Prorroga };
}

export async function eliminarProrroga(id: string) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("contable_vto_prorrogas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function guardarVtoManual(m: { balance_id: string; tipo: TipoVto; fecha: string; motivo: string }) {
  let yo;
  try {
    yo = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (!TIPOS_VTO.includes(m.tipo)) return { error: "Vencimiento inválido." };
  if (!esFecha(m.fecha)) return { error: "Elegí la fecha." };
  if (!m.motivo.trim()) return { error: "El motivo es obligatorio." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("contable_vto_manual")
    .upsert(
      { ...m, motivo: m.motivo.trim(), creado_por: yo.id, creado_en: new Date().toISOString() },
      { onConflict: "balance_id,tipo" }
    );
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function eliminarVtoManual(id: string) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("contable_vto_manual").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export type BalanceParaManual = {
  id: string;
  anio_fiscal: number;
  fecha_cierre: string;
  cliente: string;
  vtos: VtosBalance;
};

export async function buscarBalancesParaManual(query: string): Promise<BalanceParaManual[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }
  if (query.trim().length < 2) return [];

  const admin = createAdminClient();
  const [{ data }, contexto] = await Promise.all([
    admin
      .from("balances")
      .select("id, cliente_id, anio_fiscal, fecha_cierre, clientes!inner(nombre)")
      .ilike("clientes.nombre", `%${query.trim()}%`)
      .order("anio_fiscal", { ascending: false })
      .limit(15),
    getContextoVencimientos(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []).map((b) => ({
    id: b.id,
    anio_fiscal: b.anio_fiscal,
    fecha_cierre: b.fecha_cierre,
    cliente: b.clientes?.nombre ?? "—",
    vtos: contexto.resolver(b),
  }));
}

export async function guardarExcepcionCliente(
  clienteId: string,
  area: string,
  config: Record<string, unknown>
) {
  let yo;
  try {
    yo = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("objetivos_excepcion_cliente")
    .upsert(
      { cliente_id: clienteId, area, config, creado_por: yo.id },
      { onConflict: "cliente_id,area" }
    );
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function eliminarExcepcionCliente(clienteId: string, area: string) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("objetivos_excepcion_cliente")
    .delete()
    .eq("cliente_id", clienteId)
    .eq("area", area);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function buscarClientesParaExcepcion(query: string) {
  try {
    await requireAdmin();
  } catch {
    return [];
  }
  if (query.trim().length < 2) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("clientes")
    .select("id, nombre")
    .ilike("nombre", `%${query.trim()}%`)
    .eq("estado", "activo")
    .order("nombre")
    .limit(10);
  return data ?? [];
}
