"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sendEmailTraspaso } from "@/lib/email";

function parseCuit(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return { digits, terminacion: parseInt(digits[10]) };
}

export async function crearEmpresa(formData: FormData) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const nombre = (formData.get("nombre") as string)?.trim();
  const cuit = (formData.get("cuit") as string)?.trim();
  const cuil_arca = (formData.get("cuil_arca") as string)?.trim() || null;
  const email_contacto = (formData.get("email_contacto") as string)?.trim() || null;
  const liquidador_id = formData.get("liquidador_id") as string;
  const tipo_contribuyente = formData.get("tipo_contribuyente") as string;
  const es_quincenal = formData.get("es_quincenal") === "true";
  const tiene_sindicato = formData.get("tiene_sindicato") === "true";
  const sindicato_nombre = (formData.get("sindicato_nombre") as string)?.trim() || null;
  const tiene_rubrica_lsd = formData.get("tiene_rubrica_lsd") === "true";
  const jurisdiccion = (formData.get("jurisdiccion") as string)?.trim() || null;
  const lsd_desde_anio_raw = formData.get("lsd_desde_anio") as string;
  const lsd_desde_mes_raw = formData.get("lsd_desde_mes") as string;
  const lsd_desde_anio = lsd_desde_anio_raw ? parseInt(lsd_desde_anio_raw) : null;
  const lsd_desde_mes = lsd_desde_mes_raw ? parseInt(lsd_desde_mes_raw) : null;
  const lsd_hasta_anio_raw = formData.get("lsd_hasta_anio") as string;
  const lsd_hasta_mes_raw = formData.get("lsd_hasta_mes") as string;
  const lsd_hasta_anio = lsd_hasta_anio_raw ? parseInt(lsd_hasta_anio_raw) : null;
  const lsd_hasta_mes = lsd_hasta_mes_raw ? parseInt(lsd_hasta_mes_raw) : null;
  const art = (formData.get("art") as string)?.trim() || null;
  const red_bancaria = (formData.get("red_bancaria") as string)?.trim() || null;
  const fecha_alta_empleador = (formData.get("fecha_alta_empleador") as string)?.trim() || null;
  const observaciones = (formData.get("observaciones") as string)?.trim() || null;
  // Mismo parseo que editarEmpresa: acepta URL completa de Drive o ID directo.
  const driveFolderRaw = (formData.get("drive_folder_id") as string)?.trim() || null;
  const drive_folder_id = driveFolderRaw
    ? (driveFolderRaw.match(/\/folders\/([-\w]+)/)?.[1] ?? driveFolderRaw)
    : null;
  let claves_acceso: unknown = [];
  try { claves_acceso = JSON.parse((formData.get("claves_acceso") as string) || "[]"); } catch { /* keep [] */ }

  if (!nombre || !cuit || !liquidador_id || !tipo_contribuyente) {
    return { error: "Nombre, CUIT, tipo y liquidadora son obligatorios." };
  }

  const parsed = parseCuit(cuit);
  if (!parsed) return { error: "El CUIT debe tener 11 dígitos (ej: 20-12345678-9)." };

  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({
      nombre,
      cuit: parsed.digits,
      terminacion_cuit: parsed.terminacion,
      cuil_arca,
      email_contacto,
      liquidador_id,
      tipo_contribuyente,
      es_quincenal,
      tiene_sindicato,
      sindicato_nombre: tiene_sindicato ? sindicato_nombre : null,
      tiene_rubrica_lsd,
      jurisdiccion,
      lsd_desde_anio: tiene_rubrica_lsd ? lsd_desde_anio : null,
      lsd_desde_mes: tiene_rubrica_lsd ? lsd_desde_mes : null,
      lsd_hasta_anio: tiene_rubrica_lsd ? lsd_hasta_anio : null,
      lsd_hasta_mes: tiene_rubrica_lsd ? lsd_hasta_mes : null,
      art,
      red_bancaria,
      fecha_alta_empleador,
      observaciones,
      drive_folder_id,
      claves_acceso,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una empresa con ese CUIT." };
    if (error.message.includes("claves_acceso")) {
      return { error: 'Para guardar claves, ejecutá primero "alter_clientes_y_liquidadoras.sql" en Supabase.' };
    }
    return { error: error.message };
  }

  // Toda empresa creada desde /empresas es cliente de Sueldos — se refleja
  // en servicios_cliente para que Panel General y los filtros por módulo
  // (que se basan en esa tabla, no en clientes directamente) la vean.
  await supabase
    .from("servicios_cliente")
    .insert({ cliente_id: cliente.id, servicio: "sueldos", subtipo: "general", estado: true, responsable_id: liquidador_id });

  revalidatePath("/", "layout");
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
  const email_contacto = (formData.get("email_contacto") as string)?.trim() || null;
  const liquidador_id = formData.get("liquidador_id") as string;
  const tipo_contribuyente = formData.get("tipo_contribuyente") as string;
  const es_quincenal = formData.get("es_quincenal") === "true";
  const tiene_sindicato = formData.get("tiene_sindicato") === "true";
  const sindicato_nombre = (formData.get("sindicato_nombre") as string)?.trim() || null;
  const tiene_rubrica_lsd = formData.get("tiene_rubrica_lsd") === "true";
  const jurisdiccion = (formData.get("jurisdiccion") as string)?.trim() || null;
  const lsd_desde_anio_raw = formData.get("lsd_desde_anio") as string;
  const lsd_desde_mes_raw = formData.get("lsd_desde_mes") as string;
  const lsd_desde_anio = lsd_desde_anio_raw ? parseInt(lsd_desde_anio_raw) : null;
  const lsd_desde_mes = lsd_desde_mes_raw ? parseInt(lsd_desde_mes_raw) : null;
  const lsd_hasta_anio_raw = formData.get("lsd_hasta_anio") as string;
  const lsd_hasta_mes_raw = formData.get("lsd_hasta_mes") as string;
  const lsd_hasta_anio = lsd_hasta_anio_raw ? parseInt(lsd_hasta_anio_raw) : null;
  const lsd_hasta_mes = lsd_hasta_mes_raw ? parseInt(lsd_hasta_mes_raw) : null;
  const art = (formData.get("art") as string)?.trim() || null;
  const red_bancaria = (formData.get("red_bancaria") as string)?.trim() || null;
  const fecha_alta_empleador = (formData.get("fecha_alta_empleador") as string)?.trim() || null;
  const observaciones = (formData.get("observaciones") as string)?.trim() || null;
  const estado = formData.get("estado") as string;
  const claves_raw = (formData.get("claves_acceso") as string) || "[]";
  // Acepta URL completa de Drive o ID directo
  const driveFolderRaw = (formData.get("drive_folder_id") as string)?.trim() || null;
  const drive_folder_id = driveFolderRaw
    ? (driveFolderRaw.match(/\/folders\/([-\w]+)/)?.[1] ?? driveFolderRaw)
    : null;

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
    email_contacto,
    liquidador_id,
    tipo_contribuyente,
    es_quincenal,
    tiene_sindicato,
    sindicato_nombre: tiene_sindicato ? sindicato_nombre : null,
    tiene_rubrica_lsd,
    jurisdiccion,
    lsd_desde_anio: tiene_rubrica_lsd ? lsd_desde_anio : null,
    lsd_desde_mes: tiene_rubrica_lsd ? lsd_desde_mes : null,
    lsd_hasta_anio: tiene_rubrica_lsd ? lsd_hasta_anio : null,
    lsd_hasta_mes: tiene_rubrica_lsd ? lsd_hasta_mes : null,
    art,
    red_bancaria,
    fecha_alta_empleador,
    observaciones,
    estado,
    claves_acceso,
    drive_folder_id,
    fecha_modificacion: new Date().toISOString(),
  }).eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una empresa con ese CUIT." };
    if (error.message.includes("claves_acceso")) {
      return { error: 'Para guardar claves, ejecutá primero "alter_clientes_y_liquidadoras.sql" en Supabase.' };
    }
    return { error: error.message };
  }

  // Sincronizar también servicios_cliente.responsable_id (sueldos/general),
  // que es de donde lee Panel General (vista_empresas.responsable_sueldos) —
  // sin esto, cambiar la liquidadora acá no se reflejaba ahí.
  await supabase
    .from("servicios_cliente")
    .update({ responsable_id: liquidador_id })
    .eq("cliente_id", id)
    .eq("servicio", "sueldos")
    .eq("subtipo", "general");

  revalidatePath("/", "layout");
  return { success: true };
}

export async function getAsignaciones(clienteId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("asignaciones")
    .select("*, liquidadora:liquidadoras!liquidador_id(id, nombre)")
    .eq("cliente_id", clienteId)
    .order("desde_anio", { ascending: false })
    .order("desde_mes", { ascending: false });
  return data ?? [];
}

/** Núcleo de "reasignar un cliente" sin chequeo de admin propio — lo hacen
 * los que llaman (crearAsignacion para una sola empresa, transferirCartera
 * para todas las de una liquidadora de una), así no se repite auth por cliente. */
async function insertarAsignacion(
  admin: ReturnType<typeof createAdminClient>,
  clienteId: string,
  liquidadorId: string,
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null,
  creadoPor: string | null
): Promise<{ error: string } | { success: true }> {
  const { error } = await admin.from("asignaciones").insert({
    cliente_id: clienteId,
    liquidador_id: liquidadorId,
    desde_anio: desdeAnio,
    desde_mes: desdeMes,
    motivo: motivo || null,
    creado_por: creadoPor,
  });

  if (error) return { error: error.message };

  // Sincronizar clientes.liquidador_id con la asignación vigente más reciente
  const hoy = new Date();
  const mesHoy = hoy.getMonth() + 1;
  const anioHoy = hoy.getFullYear();
  const esVigente = desdeAnio * 100 + desdeMes <= anioHoy * 100 + mesHoy;
  if (esVigente) {
    // Desempate por creado_en: si dos asignaciones caen en el mismo
    // desde_anio/desde_mes (ej. una vieja y una corrección posterior para el
    // mismo período), gana la que se cargó más reciente — sin esto, el orden
    // entre iguales queda indefinido y a veces "ganaba" la vieja.
    const { data: masReciente } = await admin
      .from("asignaciones")
      .select("liquidador_id")
      .eq("cliente_id", clienteId)
      .or(`desde_anio.lt.${anioHoy},and(desde_anio.eq.${anioHoy},desde_mes.lte.${mesHoy})`)
      .order("desde_anio", { ascending: false })
      .order("desde_mes", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (masReciente) {
      await admin
        .from("clientes")
        .update({ liquidador_id: masReciente.liquidador_id, fecha_modificacion: new Date().toISOString() })
        .eq("id", clienteId);

      // Sincronizar también servicios_cliente.responsable_id (sueldos/general),
      // que es de donde lee Panel General (vista_empresas.responsable_sueldos).
      // Sin esto, reasignar por acá no se reflejaba ahí.
      await admin
        .from("servicios_cliente")
        .update({ responsable_id: masReciente.liquidador_id })
        .eq("cliente_id", clienteId)
        .eq("servicio", "sueldos")
        .eq("subtipo", "general");
    }
  }

  return { success: true };
}

export async function crearAsignacion(
  clienteId: string,
  liquidadorId: string,
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null,
  creadoPor: string | null
): Promise<{ error: string } | { success: true }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const res = await insertarAsignacion(admin, clienteId, liquidadorId, desdeAnio, desdeMes, motivo, creadoPor);
  if ("error" in res) return res;

  // Mismo aviso que en transferirCartera, pero para una sola empresa —
  // sin esto, reasignar una empresa puntual quedaba silencioso y la
  // liquidadora que la recibe recién se enteraba entrando a Seguimiento.
  // No corta la reasignación si el mail falla.
  const { data: cliente } = await admin.from("clientes").select("nombre").eq("id", clienteId).maybeSingle();
  const { data: liquidadora } = await admin
    .from("liquidadoras")
    .select("nombre, email")
    .eq("id", liquidadorId)
    .maybeSingle();
  if (cliente?.nombre && liquidadora?.email) {
    await sendEmailTraspaso(liquidadora.nombre, liquidadora.email, [cliente.nombre], desdeAnio, desdeMes, motivo);
  }

  // Igual que en Equipo: revalidar todo el sitio de una, no listar rutas.
  revalidatePath("/", "layout");
  return { success: true };
}

/** Empresas activas actualmente a cargo de una liquidadora — para mostrar
 * la vista previa antes de transferir toda su cartera a otra persona. */
export async function getClientesActivosDeLiquidadora(liquidadorId: string) {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("clientes")
    .select("id, nombre")
    .eq("liquidador_id", liquidadorId)
    .eq("estado", "activo")
    .order("nombre");

  return data ?? [];
}

/** Reasigna de una sola vez todas las empresas activas de una liquidadora a
 * otra — pensado para cuando alguien se da de baja y hay que pasarle toda
 * la cartera a otra persona, sin repetir el paso empresa por empresa. */
export async function transferirCartera(
  desdeLiquidadorId: string,
  haciaLiquidadorId: string,
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null,
  creadoPor: string | null
): Promise<{ error: string } | { success: true; total: number; transferidas: number }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  if (desdeLiquidadorId === haciaLiquidadorId) {
    return { error: "Elegí una liquidadora distinta a la actual." };
  }

  const admin = createAdminClient();
  const { data: clientes, error: fetchError } = await admin
    .from("clientes")
    .select("id, nombre")
    .eq("liquidador_id", desdeLiquidadorId)
    .eq("estado", "activo");

  if (fetchError) return { error: fetchError.message };
  if (!clientes || clientes.length === 0) {
    return { error: "Esa persona no tiene empresas activas para transferir." };
  }

  let transferidas = 0;
  const nombresTransferidos: string[] = [];
  for (const c of clientes) {
    const res = await insertarAsignacion(admin, c.id, haciaLiquidadorId, desdeAnio, desdeMes, motivo, creadoPor);
    if (!("error" in res)) {
      transferidas++;
      nombresTransferidos.push(c.nombre);
    }
  }

  // Avisarle por mail a quien recibe la cartera qué empresas se le
  // asignaron — sin esto se enteraba recién entrando a Seguimiento y viendo
  // empresas nuevas, sin saber cuáles son ni desde cuándo quedaron a su cargo.
  // No corta el traspaso si el mail falla (ej. sin RESEND_API_KEY en local).
  if (nombresTransferidos.length > 0) {
    const { data: haciaLiq } = await admin
      .from("liquidadoras")
      .select("nombre, email")
      .eq("id", haciaLiquidadorId)
      .maybeSingle();
    if (haciaLiq?.email) {
      await sendEmailTraspaso(haciaLiq.nombre, haciaLiq.email, nombresTransferidos, desdeAnio, desdeMes, motivo);
    }
  }

  revalidatePath("/", "layout");
  return { success: true, total: clientes.length, transferidas };
}
