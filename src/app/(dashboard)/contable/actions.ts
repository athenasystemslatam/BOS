"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { calcularAvance, calcularEstado, ESTADOS_MANUALES } from "./semaforo";
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

  if (updates.estado === "no_corresponde") {
    const motivo = typeof updates.no_corresponde_motivo === "string" ? updates.no_corresponde_motivo.trim() : "";
    if (!motivo) return { error: "El motivo es obligatorio." };
    updates.no_corresponde_motivo = motivo;
    updates.no_corresponde_desde = new Date().toISOString();
  } else if ("no_corresponde_motivo" in updates || "no_corresponde_desde" in updates) {
    // Solo se cargan junto con el estado: nunca sueltos desde el frontend.
    delete updates.no_corresponde_motivo;
    delete updates.no_corresponde_desde;
  }

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
        "envio1, envio1_fecha, info_recibida, info_recibida_fecha, f855_estado, " +
        "asignado_fecha, en_proceso_fecha, pendiente_pago_fecha, legalizado_fecha, presentado_fecha"
      )
      .eq("id", id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = actualRaw as any;
    const merged = { ...actual, ...updates };

    if (tocaAvance) {
      avanceUpdate = { avance: calcularAvance(merged) };

      // Pedido/Recepción de información: fecha y hora igual que F.931/
      // recibos en Sueldos. Se autocompleta la primera vez que se tilda, y
      // se libera si se destilda por error (se vuelve a pisar la próxima).
      if ("envio1" in updates) {
        if (updates.envio1 === true && !actual?.envio1_fecha) {
          fechasUpdate.envio1_fecha = new Date().toISOString();
        } else if (updates.envio1 === false) {
          fechasUpdate.envio1_fecha = null;
        }
      }
      if ("info_recibida" in updates) {
        if (updates.info_recibida === true && !actual?.info_recibida_fecha) {
          fechasUpdate.info_recibida_fecha = new Date().toISOString();
        } else if (updates.info_recibida === false) {
          fechasUpdate.info_recibida_fecha = null;
        }
      }

      // Etapas intermedias del avance (ítem 29): En proceso (50%) y
      // Pendiente de pago (75%), primera vez que se alcanzan.
      if (merged.estado_eecc === "en_proceso" && !actual?.en_proceso_fecha) {
        fechasUpdate.en_proceso_fecha = new Date().toISOString();
      }
      if (merged.estado_eecc === "pendiente_pago" && !actual?.pendiente_pago_fecha) {
        fechasUpdate.pendiente_pago_fecha = new Date().toISOString();
      }
    }

    // El Estado se deriva solo de EECC/responsable — Frenado y No corresponde
    // son las excepciones manuales, y se quedan así hasta que alguien las
    // saque a propósito (updates.estado === "auto").
    if (tocaEstado && actual && !(ESTADOS_MANUALES.includes(actual.estado) && !reanudando)) {
      const nuevoEstado = calcularEstado(merged);
      estadoUpdate = { estado: nuevoEstado };
      if (nuevoEstado === "asignado" && !actual.asignado_fecha) {
        fechasUpdate.asignado_fecha = new Date().toISOString();
      }
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

  // Frenar/reanudar manual (y No corresponde, más arriba): las únicas
  // formas de tocar el Estado a mano.
  // balance_frenados guarda el historial completo (puede frenarse y
  // destrabarse varias veces) — frenado_desde en balances es solo el
  // "caché" del ciclo abierto, para no tener que hacer join en la UI.
  if (updates.estado === "frenado") {
    const ahora = new Date().toISOString();
    fechasUpdate.frenado_desde = ahora;
    await admin.from("balance_frenados").insert({ balance_id: id, desde: ahora });
  } else if (reanudando || updates.estado === "no_corresponde") {
    // Pasar de Frenado a No corresponde también cierra el ciclo de freno.
    fechasUpdate.frenado_desde = null;
    await admin
      .from("balance_frenados")
      .update({ hasta: new Date().toISOString() })
      .eq("balance_id", id)
      .is("hasta", null);
  }
  if (reanudando) {
    fechasUpdate.no_corresponde_motivo = null;
    fechasUpdate.no_corresponde_desde = null;
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

// Ítem 109: la fecha de cierre fija del cliente genera el balance de cada año.
export type BalanceAGenerar = { cliente_id: string; nombre: string; fecha_cierre: string };

function fechaCierreDelAnio(anio: number, mes: number, dia: number): string {
  // Un cierre al 29/02 cae en 28/02 en los años no bisiestos.
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

async function calcularBalancesAGenerar(anio: number) {
  const admin = createAdminClient();
  const [{ data: servicios }, { data: existentes }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes!inner(id, nombre, estado, cierre_ejercicio_mes, cierre_ejercicio_dia)")
      .eq("servicio", "contable")
      .eq("estado", true)
      .eq("clientes.estado", "activo"),
    admin.from("balances").select("cliente_id").eq("anio_fiscal", anio),
  ]);
  const yaTienen = new Set((existentes ?? []).map((b) => b.cliente_id));
  const aGenerar: BalanceAGenerar[] = [];
  const sinCierre: string[] = [];
  const vistos = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (servicios as any[]) ?? []) {
    const c = s.clientes;
    if (!c || yaTienen.has(c.id) || vistos.has(c.id)) continue;
    vistos.add(c.id);
    if (!c.cierre_ejercicio_mes || !c.cierre_ejercicio_dia) {
      sinCierre.push(c.nombre);
      continue;
    }
    aGenerar.push({
      cliente_id: c.id,
      nombre: c.nombre,
      fecha_cierre: fechaCierreDelAnio(anio, c.cierre_ejercicio_mes, c.cierre_ejercicio_dia),
    });
  }
  aGenerar.sort((a, b) => a.fecha_cierre.localeCompare(b.fecha_cierre) || a.nombre.localeCompare(b.nombre));
  sinCierre.sort();
  return { aGenerar, sinCierre };
}

export async function previsualizarBalancesAGenerar(anio: number) {
  try {
    await requireAreaOrAdmin("contable");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  return { ok: true, ...(await calcularBalancesAGenerar(anio)) };
}

export async function generarBalancesDelAnio(anio: number) {
  try {
    await requireAreaOrAdmin("contable");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  // Se recalcula acá (no se confía en la lista que vio el usuario): si alguien
  // cargó un balance a mano en el medio, no se duplica.
  const { aGenerar } = await calcularBalancesAGenerar(anio);
  if (aGenerar.length === 0) return { ok: true, creados: 0 };

  const admin = createAdminClient();
  const { error } = await admin.from("balances").upsert(
    aGenerar.map((b) => ({
      cliente_id: b.cliente_id,
      anio_fiscal: anio,
      fecha_cierre: b.fecha_cierre,
      estado: "sin_asignar",
    })),
    { onConflict: "cliente_id,anio_fiscal", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, creados: aGenerar.length };
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
  const estadoInicial = calcularEstado(data);
  const { error } = await admin.from("balances").insert({
    ...data,
    estado: estadoInicial,
    asignado_fecha: estadoInicial === "asignado" ? new Date().toISOString() : null,
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
