"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";

export async function updateBalance(
  id: string,
  updates: Record<string, unknown>
) {
  try {
    await requireAreaOrAdmin("contable");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("balances")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contable");
  return { ok: true };
}

export async function crearBalance(data: {
  cliente_id: string;
  anio_fiscal: number;
  fecha_cierre: string;
  responsable_id: string | null;
  responsable2_id: string | null;
}) {
  try {
    await requireAreaOrAdmin("contable");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("balances").insert({
    ...data,
    estado: data.responsable_id ? "asignado" : "sin_asignar",
  });
  if (error) return { error: error.message };
  revalidatePath("/contable");
  return { ok: true };
}
