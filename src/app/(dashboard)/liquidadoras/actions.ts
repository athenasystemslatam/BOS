"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function crearLiquidadora(formData: FormData) {
  const supabase = createAdminClient();

  const nombre = (formData.get("nombre") as string)?.trim();
  const emailRaw = (formData.get("email") as string)?.trim().toLowerCase();
  const email = emailRaw || null;
  const rol = formData.get("rol") as string;

  if (!nombre || !rol) return { error: "El nombre es obligatorio." };

  const { error } = await supabase.from("liquidadoras").insert({ nombre, email, rol });

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una liquidadora con ese email." };
    return { error: error.message };
  }

  revalidatePath("/liquidadoras");
  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function editarLiquidadora(formData: FormData) {
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const emailRaw = (formData.get("email") as string)?.trim().toLowerCase();
  const email = emailRaw || null;
  const rol = formData.get("rol") as string;
  const activa = formData.get("activa") !== "false";
  const fecha_baja_raw = (formData.get("fecha_baja") as string)?.trim() || null;

  if (!id || !nombre || !rol) return { error: "El nombre es obligatorio." };

  const update: Record<string, unknown> = {
    nombre,
    email,
    rol,
    activa,
    fecha_baja: activa ? null : fecha_baja_raw,
  };

  const { error } = await supabase.from("liquidadoras").update(update).eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una liquidadora con ese email." };
    if (error.message.includes("fecha_baja")) {
      // Reintentar sin fecha_baja si la columna no existe aún
      const { error: e2 } = await supabase
        .from("liquidadoras")
        .update({ nombre, email, rol, activa })
        .eq("id", id);
      if (e2) return { error: e2.message };
    } else {
      return { error: error.message };
    }
  }

  revalidatePath("/liquidadoras");
  revalidatePath("/dashboard");
  return { success: true };
}
