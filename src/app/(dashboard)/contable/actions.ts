"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { calcularAvance, calcularEstado } from "./semaforo";
import type { Cliente } from "@/types";

const CAMPOS_AVANCE = ["envio1", "info_recibida", "estado_eecc"] as const;
// Campos que pueden mover el Estado automático (ítem 34). "estado" no está
// acá: nadie lo elige directo salvo la excepción manual de Frenado, que se
// maneja aparte más abajo.
const CAMPOS_ESTADO = ["estado_eecc", "responsable_id", "responsable2_id"] as const;

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

  // Reanudar de Frenado (ítem 34): el frontend manda el centinela "auto"
  // para pedir "recalculá el Estado como si nunca hubiera estado frenado".
  // Ese valor nunca llega a la base — se saca de "updates" antes de nada.
  const reanudando = updates.estado === "auto";
  if (reanudando) delete updates.estado;

  const tocaAvance = CAMPOS_AVANCE.some((campo) => campo in updates);
  const tocaEstado = reanudando || CAMPOS_ESTADO.some((campo) => campo in updates);
  const tocaF855 = "f855_estado" in updates;

  let avanceUpdate: Record<string, unknown> = {};
  let estadoUpdate: Record<string, unknown> = {};
  const fechasUpdate: Record<string, unknown> = {};

  if (tocaAvance || tocaEstado || tocaF855) {
    const { data: actualRaw } = await admin
      .from("balances")
      .select(
        "estado, estado_eecc, responsable_id, responsable2_id, " +
        "envio1, info_recibida, f855_estado, legalizado_fecha, presentado_fecha"
      )
      .eq("id", id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = actualRaw as any;
    const merged = { ...actual, ...updates };

    if (tocaAvance) {
      avanceUpdate = { avance: calcularAvance(merged) };
    }

    // El Estado se deriva solo de EECC/responsable — Frenado es la única
    // excepción manual, y una vez frenado se queda así hasta que alguien
    // lo reanude a propósito (updates.estado === "auto").
    if (tocaEstado && actual && !(actual.estado === "frenado" && !reanudando)) {
      const nuevoEstado = calcularEstado(merged);
      estadoUpdate = { estado: nuevoEstado };
      if ((nuevoEstado === "legalizado" || nuevoEstado === "finalizado") && !actual.legalizado_fecha) {
        fechasUpdate.legalizado_fecha = new Date().toISOString();
      }
      if (nuevoEstado === "finalizado" && !actual.presentado_fecha) {
        fechasUpdate.presentado_fecha = new Date().toISOString();
      }
    }

    // F.855: se autocompleta la fecha la primera vez que se tilda, y se
    // libera si se destilda por error (se vuelve a pisar la próxima vez).
    if (tocaF855) {
      if (updates.f855_estado === "presentado" && !actual?.f855_fecha) {
        fechasUpdate.f855_fecha = new Date().toISOString();
      } else if (updates.f855_estado === "pendiente") {
        fechasUpdate.f855_fecha = null;
      }
    }
  }

  // Frenar/reanudar manual: la única forma de tocar el Estado a mano.
  if (updates.estado === "frenado") {
    fechasUpdate.frenado_desde = new Date().toISOString();
  } else if (reanudando) {
    fechasUpdate.frenado_desde = null;
  }

  const { error } = await admin
    .from("balances")
    .update({ ...updates, ...avanceUpdate, ...estadoUpdate, ...fechasUpdate, updated_at: new Date().toISOString() })
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
    estado: calcularEstado(data),
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
