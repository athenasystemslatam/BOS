"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export async function guardarObjetivoArea(area: "sueldos" | "contable", config: Record<string, unknown>) {
  let yo;
  try {
    yo = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("objetivos_area")
    .upsert({ area, config, updated_at: new Date().toISOString(), updated_by: yo.id });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
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
