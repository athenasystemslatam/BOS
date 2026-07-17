"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

function parseCuit(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return { digits, terminacion: parseInt(digits[10]) };
}

export async function crearEmpresa(formData: FormData) {
  const supabase = await createClient();

  const nombre = (formData.get("nombre") as string)?.trim();
  const cuit = (formData.get("cuit") as string)?.trim();
  const cuil_arca = (formData.get("cuil_arca") as string)?.trim() || null;
  const liquidador_id = formData.get("liquidador_id") as string;
  const tipo_contribuyente = formData.get("tipo_contribuyente") as string;
  const es_quincenal = formData.get("es_quincenal") === "true";
  const tiene_sindicato = formData.get("tiene_sindicato") === "true";
  const sindicato_nombre = (formData.get("sindicato_nombre") as string)?.trim() || null;
  const tiene_rubrica_lsd = formData.get("tiene_rubrica_lsd") === "true";
  const jurisdiccion = (formData.get("jurisdiccion") as string)?.trim() || null;
  const art = (formData.get("art") as string)?.trim() || null;
  const red_bancaria = (formData.get("red_bancaria") as string)?.trim() || null;
  const fecha_alta_empleador = (formData.get("fecha_alta_empleador") as string)?.trim() || null;
  const observaciones = (formData.get("observaciones") as string)?.trim() || null;

  if (!nombre || !cuit || !liquidador_id || !tipo_contribuyente) {
    return { error: "Nombre, CUIT, tipo y liquidadora son obligatorios." };
  }

  const parsed = parseCuit(cuit);
  if (!parsed) return { error: "El CUIT debe tener 11 dígitos (ej: 20-12345678-9)." };

  const { error } = await supabase.from("clientes").insert({
    nombre,
    cuit: parsed.digits,
    terminacion_cuit: parsed.terminacion,
    cuil_arca,
    liquidador_id,
    tipo_contribuyente,
    es_quincenal,
    tiene_sindicato,
    sindicato_nombre: tiene_sindicato ? sindicato_nombre : null,
    tiene_rubrica_lsd,
    jurisdiccion,
    art,
    red_bancaria,
    fecha_alta_empleador,
    observaciones,
  });

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una empresa con ese CUIT." };
    return { error: error.message };
  }

  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  revalidatePath("/seguimiento");
  return { success: true };
}

export async function editarEmpresa(formData: FormData) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const cuit = (formData.get("cuit") as string)?.trim();
  const cuil_arca = (formData.get("cuil_arca") as string)?.trim() || null;
  const liquidador_id = formData.get("liquidador_id") as string;
  const tipo_contribuyente = formData.get("tipo_contribuyente") as string;
  const es_quincenal = formData.get("es_quincenal") === "true";
  const tiene_sindicato = formData.get("tiene_sindicato") === "true";
  const sindicato_nombre = (formData.get("sindicato_nombre") as string)?.trim() || null;
  const tiene_rubrica_lsd = formData.get("tiene_rubrica_lsd") === "true";
  const jurisdiccion = (formData.get("jurisdiccion") as string)?.trim() || null;
  const art = (formData.get("art") as string)?.trim() || null;
  const red_bancaria = (formData.get("red_bancaria") as string)?.trim() || null;
  const fecha_alta_empleador = (formData.get("fecha_alta_empleador") as string)?.trim() || null;
  const observaciones = (formData.get("observaciones") as string)?.trim() || null;
  const estado = formData.get("estado") as string;
  const claves_raw = (formData.get("claves_acceso") as string) || "[]";

  if (!id || !nombre || !cuit || !liquidador_id || !tipo_contribuyente) {
    return { error: "Nombre, CUIT, tipo y liquidadora son obligatorios." };
  }

  const parsed = parseCuit(cuit);
  if (!parsed) return { error: "El CUIT debe tener 11 dígitos." };

  let claves_acceso: unknown = [];
  try { claves_acceso = JSON.parse(claves_raw); } catch { /* keep [] */ }

  const { error } = await supabase.from("clientes").update({
    nombre,
    cuit: parsed.digits,
    terminacion_cuit: parsed.terminacion,
    cuil_arca,
    liquidador_id,
    tipo_contribuyente,
    es_quincenal,
    tiene_sindicato,
    sindicato_nombre: tiene_sindicato ? sindicato_nombre : null,
    tiene_rubrica_lsd,
    jurisdiccion,
    art,
    red_bancaria,
    fecha_alta_empleador,
    observaciones,
    estado,
    claves_acceso,
    fecha_modificacion: new Date().toISOString(),
  }).eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una empresa con ese CUIT." };
    if (error.message.includes("claves_acceso")) {
      return { error: 'Para guardar claves, ejecutá primero "alter_clientes_y_liquidadoras.sql" en Supabase.' };
    }
    return { error: error.message };
  }

  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  revalidatePath("/seguimiento");
  return { success: true };
}
