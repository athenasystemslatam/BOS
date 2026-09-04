"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

function parseCuit(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return { digits, terminacion: parseInt(digits[10]) };
}

function parseEmailsContacto(formData: FormData): string[] {
  try {
    const raw = JSON.parse((formData.get("emails_contacto") as string) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => String(e).trim()).filter(Boolean);
  } catch {
    return [];
  }
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
  const emails_contacto = parseEmailsContacto(formData);

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
    .insert({
      nombre,
      cuit: parsed.digits,
      terminacion_cuit: parsed.terminacion,
      tipo_contribuyente,
      emails_contacto,
    })
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

  // Si Sueldos está entre los servicios tildados, además de guardarlo en
  // servicios_cliente hay que reflejarlo en columnas propias de `clientes`
  // que Seguimiento/Dashboard/Productividad leen directo (servicios_cliente
  // no alcanza ahí, ver crearEmpresa en empresas/actions.ts):
  // - liquidador_id: de quién es la empresa para esas pantallas.
  // - es_quincenal / tiene_sindicato / tiene_rubrica_lsd (+jurisdiccion):
  //   de esto depende qué tareas le exige Seguimiento (Q1, Bol. Sind., LSD).
  // Sin esto, una empresa creada acá con Sueldos activo no aparecía en las
  // pantallas de su responsable, y aunque apareciera, entraba "vacía" —
  // Seguimiento no le pedía ninguna de esas tareas aunque correspondieran.
  const sueldos = servicios.find((s) => s.servicio === "sueldos");
  if (sueldos) {
    const es_quincenal = formData.get("sueldos_es_quincenal") === "true";
    const tiene_sindicato = formData.get("sueldos_tiene_sindicato") === "true";
    const sindicato_nombre = (formData.get("sueldos_sindicato_nombre") as string)?.trim() || null;
    const tiene_rubrica_lsd = formData.get("sueldos_tiene_rubrica_lsd") === "true";
    const jurisdiccion = (formData.get("sueldos_jurisdiccion") as string)?.trim() || null;
    // Mismos campos que Clientes → Editar (cuil_arca, art, red_bancaria,
    // fecha_alta_empleador, claves_acceso, observaciones, drive_folder_id) —
    // se completan acá directamente para no obligar a pasar por las dos
    // pantallas al dar de alta.
    const cuil_arca = (formData.get("sueldos_cuil_arca") as string)?.trim() || null;
    const art = (formData.get("sueldos_art") as string)?.trim() || null;
    const red_bancaria = (formData.get("sueldos_red_bancaria") as string)?.trim() || null;
    const fecha_alta_empleador = (formData.get("sueldos_fecha_alta_empleador") as string)?.trim() || null;
    let claves_acceso: unknown = [];
    try { claves_acceso = JSON.parse((formData.get("sueldos_claves_acceso") as string) || "[]"); } catch { /* keep [] */ }
    const observaciones = (formData.get("sueldos_observaciones") as string)?.trim() || null;
    // Mismo parseo que Clientes → Editar: acepta URL completa de Drive o ID directo.
    const driveFolderRaw = (formData.get("sueldos_drive_folder_id") as string)?.trim() || null;
    const drive_folder_id = driveFolderRaw
      ? (driveFolderRaw.match(/\/folders\/([-\w]+)/)?.[1] ?? driveFolderRaw)
      : null;

    const update: Record<string, unknown> = {
      es_quincenal,
      tiene_sindicato,
      sindicato_nombre: tiene_sindicato ? sindicato_nombre : null,
      tiene_rubrica_lsd,
      jurisdiccion: tiene_rubrica_lsd ? jurisdiccion : null,
      cuil_arca,
      art,
      red_bancaria,
      fecha_alta_empleador,
      claves_acceso,
      observaciones,
      drive_folder_id,
    };
    if (sueldos.responsable_id) update.liquidador_id = sueldos.responsable_id;

    await supabase.from("clientes").update(update).eq("id", cliente.id);
  }

  // Un cliente puede tener servicios de varios módulos a la vez (sueldos,
  // impuestos, contable, monotributo) — revalidar todo el sitio de una.
  revalidatePath("/", "layout");
  return { success: true };
}

/** Datos completos de una empresa (más allá de lo que trae vista_empresas,
 * que solo tiene nombres de responsable, no ids) para precargar el modal de
 * Editar: la fila de `clientes` entera + sus servicios con responsable_id. */
export async function getEmpresaCompleta(clienteId: string) {
  try {
    await requireAdmin();
  } catch {
    return null;
  }

  const supabase = createAdminClient();
  const [{ data: cliente }, { data: servicios }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle(),
    supabase
      .from("servicios_cliente")
      .select("servicio, subtipo, estado, responsable_id")
      .eq("cliente_id", clienteId),
  ]);

  if (!cliente) return null;
  return { cliente, servicios: servicios ?? [] };
}

export async function editarClienteConServicios(formData: FormData) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const cuitRaw = (formData.get("cuit") as string)?.trim();
  const tipo_contribuyente = (formData.get("tipo_contribuyente") as string) ?? "empresa";
  const emails_contacto = parseEmailsContacto(formData);

  if (!id || !nombre || !cuitRaw) {
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

  const { error: clienteError } = await supabase
    .from("clientes")
    .update({
      nombre,
      cuit: parsed.digits,
      terminacion_cuit: parsed.terminacion,
      tipo_contribuyente,
      emails_contacto,
      fecha_modificacion: new Date().toISOString(),
    })
    .eq("id", id);

  if (clienteError) {
    if (clienteError.code === "23505") return { error: "Ya existe una empresa con ese CUIT." };
    return { error: clienteError.message };
  }

  // Activar/actualizar responsable de los servicios tildados. Upsert (no
  // insert) porque el servicio puede ya existir dado de baja de antes — en
  // ese caso lo reactiva en vez de chocar con la restricción única
  // (cliente_id, servicio, subtipo).
  for (const s of servicios) {
    const { error: svcError } = await supabase.from("servicios_cliente").upsert(
      { cliente_id: id, servicio: s.servicio, subtipo: s.subtipo, estado: true, responsable_id: s.responsable_id || null },
      { onConflict: "cliente_id,servicio,subtipo" }
    );
    if (svcError) return { error: svcError.message };
  }

  // Dar de baja (sin borrar, mismo criterio que "Dar de baja" de la tabla)
  // los servicios que tenía activos y se destildaron acá.
  const activos = new Set(servicios.map((s) => `${s.servicio}:${s.subtipo}`));
  const { data: existentes } = await supabase
    .from("servicios_cliente")
    .select("servicio, subtipo")
    .eq("cliente_id", id)
    .eq("estado", true);
  for (const e of existentes ?? []) {
    if (activos.has(`${e.servicio}:${e.subtipo}`)) continue;
    await supabase
      .from("servicios_cliente")
      .update({ estado: false })
      .eq("cliente_id", id)
      .eq("servicio", e.servicio)
      .eq("subtipo", e.subtipo);
  }

  // Mismo bloque que crearClienteConServicios: sincronizar los campos propios
  // de Sueldos que Seguimiento/Dashboard/Productividad leen directo de `clientes`.
  const sueldos = servicios.find((s) => s.servicio === "sueldos");
  if (sueldos) {
    const es_quincenal = formData.get("sueldos_es_quincenal") === "true";
    const tiene_sindicato = formData.get("sueldos_tiene_sindicato") === "true";
    const sindicato_nombre = (formData.get("sueldos_sindicato_nombre") as string)?.trim() || null;
    const tiene_rubrica_lsd = formData.get("sueldos_tiene_rubrica_lsd") === "true";
    const jurisdiccion = (formData.get("sueldos_jurisdiccion") as string)?.trim() || null;
    const cuil_arca = (formData.get("sueldos_cuil_arca") as string)?.trim() || null;
    const art = (formData.get("sueldos_art") as string)?.trim() || null;
    const red_bancaria = (formData.get("sueldos_red_bancaria") as string)?.trim() || null;
    const fecha_alta_empleador = (formData.get("sueldos_fecha_alta_empleador") as string)?.trim() || null;
    let claves_acceso: unknown = [];
    try { claves_acceso = JSON.parse((formData.get("sueldos_claves_acceso") as string) || "[]"); } catch { /* keep [] */ }
    const observaciones = (formData.get("sueldos_observaciones") as string)?.trim() || null;
    const driveFolderRaw = (formData.get("sueldos_drive_folder_id") as string)?.trim() || null;
    const drive_folder_id = driveFolderRaw
      ? (driveFolderRaw.match(/\/folders\/([-\w]+)/)?.[1] ?? driveFolderRaw)
      : null;

    const update: Record<string, unknown> = {
      es_quincenal,
      tiene_sindicato,
      sindicato_nombre: tiene_sindicato ? sindicato_nombre : null,
      tiene_rubrica_lsd,
      jurisdiccion: tiene_rubrica_lsd ? jurisdiccion : null,
      cuil_arca,
      art,
      red_bancaria,
      fecha_alta_empleador,
      claves_acceso,
      observaciones,
      drive_folder_id,
    };
    if (sueldos.responsable_id) update.liquidador_id = sueldos.responsable_id;

    const { error: sueldosError } = await supabase.from("clientes").update(update).eq("id", id);
    if (sueldosError && !sueldosError.message.includes("claves_acceso")) {
      return { error: sueldosError.message };
    }

    // Igual que editarEmpresa: sincronizar servicios_cliente.responsable_id
    // (sueldos/general), de donde lee Panel General (vista_empresas).
    if (sueldos.responsable_id) {
      await supabase
        .from("servicios_cliente")
        .update({ responsable_id: sueldos.responsable_id })
        .eq("cliente_id", id)
        .eq("servicio", "sueldos")
        .eq("subtipo", "general");
    }
  }

  revalidatePath("/", "layout");
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

  revalidatePath("/", "layout");
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

  revalidatePath("/", "layout");
  return { success: true };
}
