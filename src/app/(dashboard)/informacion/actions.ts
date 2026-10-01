"use server";

import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContactoNota } from "@/types";

function leerContactos(formData: FormData): ContactoNota[] {
  try {
    const raw = JSON.parse((formData.get("contactos") as string) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map((c) => ({
        nombre: String(c?.nombre ?? "").trim(),
        corresponde: String(c?.corresponde ?? "").trim(),
        observaciones: String(c?.observaciones ?? "").trim(),
      }))
      .filter((c) => c.nombre || c.corresponde || c.observaciones);
  } catch {
    return [];
  }
}

export async function crearNota(formData: FormData) {
  const yo = await requireAreaOrAdmin("sueldos");
  const admin = createAdminClient();

  const tema = (formData.get("tema") as string)?.trim();
  if (!tema) return { error: "El tema es obligatorio." };

  const { error } = await admin.from("sueldos_notas").insert({
    tema,
    contactos: leerContactos(formData),
    contenido: (formData.get("contenido") as string) ?? "",
    importante: formData.get("importante") === "true",
    creado_por: yo.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/informacion");
  return {};
}

export async function editarNota(formData: FormData) {
  await requireAreaOrAdmin("sueldos");
  const admin = createAdminClient();

  const id = formData.get("id") as string;
  const tema = (formData.get("tema") as string)?.trim();
  if (!id || !tema) return { error: "El tema es obligatorio." };

  const { error } = await admin
    .from("sueldos_notas")
    .update({
      tema,
      contactos: leerContactos(formData),
      contenido: (formData.get("contenido") as string) ?? "",
      importante: formData.get("importante") === "true",
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/informacion");
  return {};
}

export async function borrarNota(id: string) {
  await requireAreaOrAdmin("sueldos");
  const admin = createAdminClient();

  const { error } = await admin.from("sueldos_notas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/informacion");
  return {};
}
