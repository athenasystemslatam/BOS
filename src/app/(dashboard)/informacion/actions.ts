"use server";

import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ModuloNota } from "@/types";

const MODULOS_VALIDOS: ModuloNota[] = ["seguimiento", "clientes", "vencimientos", "equipo", "general"];

function leerModulo(formData: FormData): ModuloNota {
  const raw = (formData.get("modulo") as string) ?? "general";
  return (MODULOS_VALIDOS as string[]).includes(raw) ? (raw as ModuloNota) : "general";
}

export async function crearNota(formData: FormData) {
  const yo = await requireAreaOrAdmin("sueldos");
  const admin = createAdminClient();

  const tema = (formData.get("tema") as string)?.trim();
  if (!tema) return { error: "El tema es obligatorio." };

  const { error } = await admin.from("sueldos_notas").insert({
    tema,
    modulo: leerModulo(formData),
    contacto: (formData.get("contacto") as string)?.trim() || null,
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
      modulo: leerModulo(formData),
      contacto: (formData.get("contacto") as string)?.trim() || null,
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
