"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { requireEditorMonotributo, sincronizarRevisionesCliente } from "@/lib/monotributoServer";
import { sendEmailAsignacionServicio } from "@/lib/email";
import { SERVICIOS_CONFIG } from "@/lib/modulos";
import { registrarHistorial } from "@/lib/monotributoHistorial";
import { paginado } from "@/lib/paginado";

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
  let yoId: string;
  try {
    // Monotributo: cualquiera del equipo del módulo reasigna (y el servidor rechaza a quien es solo lectura).
    yoId = (servicio === "monotributo" ? await requireEditorMonotributo() : await requireAdmin()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  let historialIds: string[] = [];
  // Monotributo guarda cada cambio de responsable en su historial (con el responsable anterior).
  const { data: servicioAntes } = servicio === "monotributo"
    ? await admin.from("servicios_cliente").select("responsable_id")
        .eq("cliente_id", clienteId).eq("servicio", servicio).eq("subtipo", subtipo).maybeSingle()
    : { data: null };
  const fila = {
    cliente_id: clienteId,
    servicio,
    subtipo,
    responsable_id: responsableId,
    desde_anio: desdeAnio,
    desde_mes: desdeMes,
    motivo: motivo || null,
    creado_por: servicio === "monotributo" ? yoId : creadoPor,
  };
  // Monotributo: dos cambios en el mismo mes reemplazan la fila de ese mes en vez de fallar.
  const { data: guardada, error } = servicio === "monotributo"
    ? await admin.from("asignaciones_servicio").upsert(fila, { onConflict: "cliente_id,servicio,subtipo,desde_anio,desde_mes" }).select("id").single()
    : await admin.from("asignaciones_servicio").insert(fila).select("id").single();

  if (error) return { error: error.message };

  if (servicio === "monotributo") {
    historialIds = await registrarHistorial(admin, [{
      cliente_id: clienteId, anio: desdeAnio, mes: desdeMes, entidad: "responsable", campo: "responsable_id",
      valor_anterior: (servicioAntes as { responsable_id: string | null } | null)?.responsable_id ?? null,
      valor_nuevo: responsableId, usuario_id: yoId, nota: motivo || null, ref_id: (guardada as { id: string } | null)?.id ?? null,
    }]);
  }

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
  if (esVigente) await sincronizarResponsableActual(clienteId, servicio, subtipo);
  // Monotributo: la marca "Sin responsable" de A revisar se cierra en el momento.
  if (servicio === "monotributo") await sincronizarRevisionesCliente(admin, clienteId, yoId).catch(() => undefined);

  // Igual que en Equipo: revalidar todo el sitio de una, no listar rutas
  // (esta lista se recibía como parámetro y se quedaba corta apenas se
  // agregaba una sub-página nueva a un módulo).
  revalidatePath("/", "layout");
  return { success: true, historialIds };
}

/** Deja servicios_cliente.responsable_id igual a la asignación vigente más reciente
 * (o `siNoHay` si no queda ninguna vigente). Interna: no se exporta como acción. */
async function sincronizarResponsableActual(clienteId: string, servicio: string, subtipo: string, siNoHay?: string | null) {
  const admin = createAdminClient();
  const hoy = new Date();
  const mesHoy = hoy.getMonth() + 1;
  const anioHoy = hoy.getFullYear();
  {
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
    } else if (siNoHay !== undefined) {
      await admin.from("servicios_cliente").update({ responsable_id: siNoHay })
        .eq("cliente_id", clienteId).eq("servicio", servicio).eq("subtipo", subtipo);
    }
  }
}

/** "Deshacer" / "Revertir" un cambio de responsable de Monotributo (entrada del historial).
 * Vuelve la fila de ese mes al responsable anterior; si antes no había ninguno, saca la fila. */
export async function revertirResponsableMonotributo(historialId: string): Promise<{ error: string } | { ok: true; historialIds: string[] }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  const { data: e } = await admin.from("monotributo_historial").select("*").eq("id", historialId).maybeSingle();
  const h = e as { id: string; cliente_id: string; anio: number; mes: number; entidad: string; valor_anterior: string | null; valor_nuevo: string | null; ref_id: string | null } | null;
  if (!h || h.entidad !== "responsable") return { error: "No se encontró el cambio." };
  if (!h.ref_id) return { error: "Este cambio es anterior al historial completo: cambiá el responsable desde \"Historial de responsables\"." };

  const { data: filaAsig } = await admin.from("asignaciones_servicio").select("id, responsable_id").eq("id", h.ref_id).maybeSingle();
  const actual = (filaAsig as { responsable_id: string } | null)?.responsable_id ?? null;
  if (!filaAsig || actual !== h.valor_nuevo) return { error: "El responsable cambió después de este registro: cambialo desde \"Historial de responsables\"." };

  const { error } = h.valor_anterior
    ? await admin.from("asignaciones_servicio").update({ responsable_id: h.valor_anterior, motivo: "Deshecho" }).eq("id", h.ref_id)
    : await admin.from("asignaciones_servicio").delete().eq("id", h.ref_id);
  if (error) return { error: error.message };
  await sincronizarResponsableActual(h.cliente_id, "monotributo", "general", h.valor_anterior);
  await sincronizarRevisionesCliente(admin, h.cliente_id, yoId).catch(() => undefined);

  const historialIds = await registrarHistorial(admin, [{
    cliente_id: h.cliente_id, anio: h.anio, mes: h.mes, entidad: "responsable", campo: "responsable_id",
    valor_anterior: actual, valor_nuevo: h.valor_anterior, usuario_id: yoId, revierte_id: h.id, ref_id: h.ref_id, nota: "Revertido",
  }]);
  revalidatePath("/", "layout");
  return { ok: true, historialIds };
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
  const { data } = await paginado((d, h) => admin
    .from("asignaciones_servicio")
    .select("cliente_id, desde_anio, desde_mes, responsable:liquidadoras!responsable_id(id, nombre)")
    .eq("servicio", servicio)
    .eq("subtipo", subtipo)
    .lte("desde_anio", anio)
    .order("id")
    .range(d, h));

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

// Igual que resolverResponsablesVigentes pero trae todos los subtipos de un
// servicio en una sola consulta. Útil cuando la página necesita IVA + IIBB + SEH
// a la vez — evita 3 roundtrips a la base donde alcanza con 1.
export async function resolverResponsablesVigentesTodos(
  servicio: string,
  anio: number,
  mes: number
): Promise<Record<string, Map<string, { id: string; nombre: string }>>> {
  const admin = createAdminClient();
  const { data } = await paginado((d, h) => admin
    .from("asignaciones_servicio")
    .select("cliente_id, subtipo, desde_anio, desde_mes, responsable:liquidadoras!responsable_id(id, nombre)")
    .eq("servicio", servicio)
    .lte("desde_anio", anio)
    .order("id")
    .range(d, h));

  if (!data) return {};

  type Row = { cliente_id: string; subtipo: string; desde_anio: number; desde_mes: number; responsable: { id: string; nombre: string } | null };
  const porSubtipo = new Map<string, Map<string, Row>>();

  for (const a of data as unknown as Row[]) {
    if (a.desde_anio * 100 + a.desde_mes > anio * 100 + mes) continue;
    if (!porSubtipo.has(a.subtipo)) porSubtipo.set(a.subtipo, new Map());
    const porCliente = porSubtipo.get(a.subtipo)!;
    const prev = porCliente.get(a.cliente_id);
    if (!prev || a.desde_anio * 100 + a.desde_mes > prev.desde_anio * 100 + prev.desde_mes) {
      porCliente.set(a.cliente_id, a);
    }
  }

  const resultado: Record<string, Map<string, { id: string; nombre: string }>> = {};
  for (const [subtipo, porCliente] of Array.from(porSubtipo.entries())) {
    const mapa = new Map<string, { id: string; nombre: string }>();
    for (const [clienteId, a] of Array.from(porCliente.entries())) {
      if (a.responsable) mapa.set(clienteId, a.responsable);
    }
    resultado[subtipo] = mapa;
  }
  return resultado;
}
