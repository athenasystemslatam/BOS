"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sendEmailAsignacionServicio } from "@/lib/email";
import { SERVICIOS_CONFIG } from "@/lib/modulos";

export type AsignacionServicio = {
  id: string;
  desde_anio: number;
  desde_mes: number;
  motivo: string | null;
  responsable: { id: string; nombre: string } | null;
};

export async function getAsignacionesServicio(
  clienteId: string,
  servicio: string,
  subtipo: string
): Promise<AsignacionServicio[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("asignaciones_servicio")
    .select("id, desde_anio, desde_mes, motivo, responsable:liquidadoras!responsable_id(id, nombre)")
    .eq("cliente_id", clienteId)
    .eq("servicio", servicio)
    .eq("subtipo", subtipo)
    .order("desde_anio", { ascending: false })
    .order("desde_mes", { ascending: false });
  return (data as unknown as AsignacionServicio[]) ?? [];
}

export async function crearAsignacionServicio(
  clienteId: string,
  servicio: string,
  subtipo: string,
  responsableId: string,
  desdeAnio: number,
  desdeMes: number,
  motivo: string | null,
  creadoPor: string | null
) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("asignaciones_servicio").insert({
    cliente_id: clienteId,
    servicio,
    subtipo,
    responsable_id: responsableId,
    desde_anio: desdeAnio,
    desde_mes: desdeMes,
    motivo: motivo || null,
    creado_por: creadoPor,
  });

  if (error) return { error: error.message };

  // Avisar por mail al nuevo responsable qué cliente, servicio y fecha de
  // inicio le corresponden — sin esto se enteraba recién viéndolo aparecer
  // en su módulo. No corta la asignación si el mail falla.
  const admin2 = createAdminClient();
  const [{ data: cliente }, { data: responsable }] = await Promise.all([
    admin2.from("clientes").select("nombre").eq("id", clienteId).maybeSingle(),
    admin2.from("liquidadoras").select("nombre, email").eq("id", responsableId).maybeSingle(),
  ]);
  const servicioLabel =
    SERVICIOS_CONFIG.find((s) => s.servicio === servicio && s.subtipo === subtipo)?.label
    ?? servicio;
  if (cliente?.nombre && responsable?.email) {
    await sendEmailAsignacionServicio(
      responsable.nombre, responsable.email, cliente.nombre, servicioLabel, desdeAnio, desdeMes, motivo || null
    );
  }

  // Sincronizar servicios_cliente.responsable_id con la asignación vigente
  // más reciente, igual que Sueldos sincroniza clientes.liquidador_id.
  const hoy = new Date();
  const mesHoy = hoy.getMonth() + 1;
  const anioHoy = hoy.getFullYear();
  const esVigente = desdeAnio * 100 + desdeMes <= anioHoy * 100 + mesHoy;
  if (esVigente) {
    const { data: masReciente } = await admin
      .from("asignaciones_servicio")
      .select("responsable_id")
      .eq("cliente_id", clienteId)
      .eq("servicio", servicio)
      .eq("subtipo", subtipo)
      .or(`desde_anio.lt.${anioHoy},and(desde_anio.eq.${anioHoy},desde_mes.lte.${mesHoy})`)
      .order("desde_anio", { ascending: false })
      .order("desde_mes", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (masReciente) {
      await admin
        .from("servicios_cliente")
        .update({ responsable_id: masReciente.responsable_id })
        .eq("cliente_id", clienteId)
        .eq("servicio", servicio)
        .eq("subtipo", subtipo);
    }
  }

  // Igual que en Equipo: revalidar todo el sitio de una, no listar rutas
  // (esta lista se recibía como parámetro y se quedaba corta apenas se
  // agregaba una sub-página nueva a un módulo).
  revalidatePath("/", "layout");
  return { success: true };
}

// Resuelve, para un conjunto de clientes de un servicio, quién era el
// responsable vigente en un período (anio, mes) dado — igual que /seguimiento
// lo hace con la tabla `asignaciones` de Sueldos. Sin esto, mirar un período
// pasado mostraría siempre al responsable actual en vez del de ese momento.
export async function resolverResponsablesVigentes(
  servicio: string,
  subtipo: string,
  anio: number,
  mes: number
): Promise<Map<string, { id: string; nombre: string }>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("asignaciones_servicio")
    .select("cliente_id, desde_anio, desde_mes, responsable:liquidadoras!responsable_id(id, nombre)")
    .eq("servicio", servicio)
    .eq("subtipo", subtipo);

  const resultado = new Map<string, { id: string; nombre: string }>();
  if (!data) return resultado;

  const porCliente = new Map<string, { desde_anio: number; desde_mes: number; responsable: { id: string; nombre: string } | null }>();
  for (const a of data as unknown as { cliente_id: string; desde_anio: number; desde_mes: number; responsable: { id: string; nombre: string } | null }[]) {
    if (a.desde_anio * 100 + a.desde_mes > anio * 100 + mes) continue; // todavía no vigente para este período
    const prev = porCliente.get(a.cliente_id);
    if (!prev || a.desde_anio * 100 + a.desde_mes > prev.desde_anio * 100 + prev.desde_mes) {
      porCliente.set(a.cliente_id, a);
    }
  }
  Array.from(porCliente.entries()).forEach(([clienteId, a]) => {
    if (a.responsable) resultado.set(clienteId, a.responsable);
  });
  return resultado;
}
