"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function upsertMonotributoTarea(
  clienteId: string,
  anio: number,
  mes: number,
  updates: {
    cuota_estado?: "pendiente" | "pagado";
    cuota_fecha?: string | null;
    recategorizacion?: "no_corresponde" | "pendiente" | "realizada";
    categoria?: string | null;
    observaciones?: string | null;
  }
) {
  const admin = createAdminClient();
  const { error } = await admin.from("monotributo_tareas").upsert(
    {
      cliente_id: clienteId,
      anio,
      mes,
      ...updates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,anio,mes" }
  );
  if (error) return { error: error.message };
  revalidatePath("/monotributo");
  return { ok: true };
}
