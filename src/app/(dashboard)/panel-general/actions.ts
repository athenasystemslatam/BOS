"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

function parseCuit(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return { digits, terminacion: parseInt(digits[10]) };
}

export async function crearClienteConServicios(formData: FormData) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const nombre = (formData.get("nombre") as string)?.trim();
  const cuitRaw = (formData.get("cuit") as string)?.trim();
  const tipo_contribuyente = (formData.get("tipo_contribuyente") as string) ?? "empresa";

  if (!nombre || !cuitRaw) {
    return { error: "Nombre y CUIT son obligatorios." };
  }

  const parsed = parseCuit(cuitRaw);
  if (!parsed) return { error: "El CUIT debe tener 11 dígitos (ej: 20-12345678-9)." };

  let servicios: { servicio: string; subtipo: string; responsable_id: string | null }[] = [];
  try {
    servicios = JSON.parse((formData.get("servicios") as string) || "[]");
  } catch {
    return { error: "Error al procesar los servicios." };
  }

  const { data: cliente, error: clienteError } = await supabase
    .from("clientes")
    .insert({ nombre, cuit: parsed.digits, terminacion_cuit: parsed.terminacion, tipo_contribuyente })
    .select("id")
    .single();

  if (clienteError) {
    if (clienteError.code === "23505") return { error: "Ya existe una empresa con ese CUIT." };
    return { error: clienteError.message };
  }

  if (servicios.length > 0) {
    const { error: svcError } = await supabase.from("servicios_cliente").insert(
      servicios.map((s) => ({
        cliente_id: cliente.id,
        servicio: s.servicio,
        subtipo: s.subtipo,
        responsable_id: s.responsable_id || null,
      }))
    );
    if (svcError) return { error: svcError.message };
  }

  revalidatePath("/panel-general");
  revalidatePath("/empresas");
  revalidatePath("/seguimiento");
  return { success: true };
}

export async function darDeBajaServicio(clienteId: string, servicio: string, subtipo: string) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("servicios_cliente")
    .update({ estado: false })
    .eq("cliente_id", clienteId)
    .eq("servicio", servicio)
    .eq("subtipo", subtipo);

  if (error) return { error: error.message };

  revalidatePath("/panel-general");
  return { success: true };
}

export async function darDeBajaCliente(clienteId: string) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("clientes")
    .update({ estado: "inactivo", fecha_modificacion: new Date().toISOString() })
    .eq("id", clienteId);

  if (error) return { error: error.message };

  revalidatePath("/panel-general");
  revalidatePath("/empresas");
  revalidatePath("/seguimiento");
  return { success: true };
}
