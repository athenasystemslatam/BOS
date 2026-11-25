"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { esSubtipoImpuesto } from "@/lib/impuestos";

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

  if (!esSubtipoImpuesto(subtipo)) return { error: "Impuesto desconocido." };
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
  if (error) {
    if (subtipo === "sicore" && error.message.includes("subtipo_check")) {
      return { error: "Falta correr supabase/add_impuestos_modulo_v2.sql en Supabase para cargar SICORE." };
    }
    return { error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
