"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { calcularAvance } from "./semaforo";
import type { Cliente } from "@/types";

const CAMPOS_AVANCE = ["envio1", "info_recibida", "estado_eecc"] as const;

// Ficha de cliente de solo lectura para el módulo Contable — misma info que
// la ficha maestra de Panel General (edición sigue siendo solo desde ahí),
// pero accesible para todo el equipo de Contable, no solo admins.
export async function getFichaCliente(clienteId: string): Promise<Cliente | null> {
  try {
    await requireAreaOrAdmin("contable");
  } catch {
    return null;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .maybeSingle();
  return (data as Cliente) ?? null;
}

export async function updateBalance(
  id: string,
  updates: Record<string, unknown>
) {
  try {
    await requireAreaOrAdmin("contable");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();

  // El avance ya no se elige a mano — se deriva de envio1/info_recibida/
  // estado_eecc (ver calcularAvance en semaforo.ts). Si el patch toca
  // alguno de esos tres campos, se recalcula contra el estado ya guardado
  // + lo que viene en este update, y se persiste junto con el resto.
  let avanceUpdate: Record<string, unknown> = {};
  if (CAMPOS_AVANCE.some((campo) => campo in updates)) {
    const { data: actual } = await admin
      .from("balances")
      .select("envio1, info_recibida, estado_eecc")
      .eq("id", id)
      .maybeSingle();
    avanceUpdate = { avance: calcularAvance({ ...actual, ...updates }) };
  }

  const { error } = await admin
    .from("balances")
    .update({ ...updates, ...avanceUpdate, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  // Igual que en Equipo: revalidar todo el sitio de una, no solo /contable
  // (dejaba afuera /contable/dashboard, /contable/vencimientos, etc.).
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function crearBalance(data: {
  cliente_id: string;
  anio_fiscal: number;
  fecha_cierre: string;
  responsable_id: string | null;
  responsable2_id: string | null;
}) {
  try {
    await requireAreaOrAdmin("contable");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("balances").insert({
    ...data,
    estado: data.responsable_id ? "asignado" : "sin_asignar",
  });
  if (error) return { error: error.message };

  // Fecha de cierre fija (ver add_cierre_ejercicio_fijo.sql): si el cliente
  // todavía no la tiene, la "aprende" de esta primera carga para autocompletar
  // sola el balance de los próximos años. Si ya la tiene, no se pisa acá —
  // un cambio real de fecha de cierre se edita a propósito desde la ficha.
  const [, mesStr, diaStr] = data.fecha_cierre.split("-");
  const { data: cliente } = await admin
    .from("clientes")
    .select("cierre_ejercicio_mes")
    .eq("id", data.cliente_id)
    .maybeSingle();
  if (cliente && !cliente.cierre_ejercicio_mes) {
    await admin
      .from("clientes")
      .update({ cierre_ejercicio_mes: parseInt(mesStr), cierre_ejercicio_dia: parseInt(diaStr) })
      .eq("id", data.cliente_id);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
