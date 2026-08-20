"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";

export async function upsertImpuestoTarea(
  clienteId: string,
  subtipo: string,
  anio: number,
  mes: number,
  updates: {
    estado?: "pendiente" | "presentado";
    fecha_presentacion?: string | null;
    pago_estado?: string;
    observaciones?: string;
  }
) {
  try {
    await requireAreaOrAdmin("impuestos");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("impuestos_tareas").upsert(
    {
      cliente_id: clienteId,
      subtipo,
      anio,
      mes,
      ...updates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,subtipo,anio,mes" }
  );
  if (error) return { error: error.message };
  revalidatePath("/impuestos");
  return { ok: true };
}
