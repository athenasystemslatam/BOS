"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { valorCampo, type Revision } from "@/lib/monotributo";
import { enTandas, leerDatosCliente, requireEditorMonotributo } from "@/lib/monotributoServer";

type Resultado = { error: string } | { ok: true; resueltas: number };

function limpiarNota(nota: string | null | undefined): string | null {
  const t = (nota ?? "").trim();
  return t === "" ? null : t.slice(0, 500);
}

async function marcasPendientes(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const out: Revision[] = [];
  for (const tanda of enTandas(Array.from(new Set(ids)))) {
    const { data, error } = await admin.from("monotributo_revisiones").select("*").in("id", tanda).eq("estado", "pendiente");
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Revision[]));
  }
  return out;
}

/** Valor que queda "confirmado así": mientras no cambie, la regla no vuelve a marcar. */
async function valorActual(admin: ReturnType<typeof createAdminClient>, r: Revision): Promise<string> {
  if (r.campo === "responsable" || r.campo === "forma_pago" || r.campo === "medio_contacto") {
    const [datos, { data: servicio }] = await Promise.all([
      leerDatosCliente(admin, r.cliente_id),
      admin.from("servicios_cliente").select("responsable_id")
        .eq("cliente_id", r.cliente_id).eq("servicio", "monotributo").eq("subtipo", "general").maybeSingle(),
    ]);
    return valorCampo(r.campo, datos, (servicio as { responsable_id: string | null } | null)?.responsable_id ?? null);
  }
  if (r.campo === "pago") return "enviado";
  if (r.campo === "deuda") return "sin_verificar";
  return "confirmado";
}

/** "Está bien así": la marca sale de revisión con quién, cuándo y la nota. */
export async function confirmarRevisiones(ids: string[], nota: string | null): Promise<Resultado> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (!ids.length) return { ok: true, resueltas: 0 };

  const admin = createAdminClient();
  try {
    const marcas = await marcasPendientes(admin, ids);
    // Agrupadas por valor: una sola actualización por grupo (el lote de 100+ marcas no se hace de a una).
    const porValor = new Map<string, string[]>();
    for (const r of marcas) {
      const v = await valorActual(admin, r);
      if (!porValor.has(v)) porValor.set(v, []);
      porValor.get(v)!.push(r.id);
    }
    const ahora = new Date().toISOString();
    for (const [valor, idsGrupo] of Array.from(porValor.entries())) {
      for (const tanda of enTandas(idsGrupo)) {
        const { error } = await admin.from("monotributo_revisiones")
          .update({ estado: "resuelta", resolucion: "confirmado", resuelta_por: yoId, resuelta_at: ahora,
                    nota: limpiarNota(nota), valor_confirmado: valor })
          .in("id", tanda).eq("estado", "pendiente");
        if (error) return { error: error.message };
      }
    }
    revalidatePath("/monotributo", "layout");
    return { ok: true, resueltas: marcas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar." };
  }
}

/** "Confirmar sin deuda" (DEUDA vacía): carga Deuda = No en el último mes del
 * cliente y la marca sale de revisión, con quién y cuándo. */
export async function confirmarSinDeuda(ids: string[], nota: string | null): Promise<Resultado> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const admin = createAdminClient();
  try {
    const marcas = (await marcasPendientes(admin, ids)).filter((r) => r.campo === "deuda");
    if (!marcas.length) return { ok: true, resueltas: 0 };
    const clientes = Array.from(new Set(marcas.map((r) => r.cliente_id)));

    const tareaIds: string[] = [];
    for (const tanda of enTandas(clientes)) {
      const { data, error } = await admin.from("monotributo_tareas")
        .select("id, cliente_id, anio, mes").in("cliente_id", tanda);
      if (error) return { error: error.message };
      const ultima = new Map<string, { id: string; orden: number }>();
      for (const t of (data ?? []) as { id: string; cliente_id: string; anio: number; mes: number }[]) {
        const orden = t.anio * 100 + t.mes;
        const u = ultima.get(t.cliente_id);
        if (!u || orden > u.orden) ultima.set(t.cliente_id, { id: t.id, orden });
      }
      ultima.forEach((u) => tareaIds.push(u.id));
    }
    for (const tanda of enTandas(tareaIds)) {
      const { error } = await admin.from("monotributo_tareas")
        .update({ deuda_estado: "no", updated_at: new Date().toISOString() })
        .in("id", tanda).eq("deuda_estado", "sin_verificar");
      if (error) return { error: error.message };
    }

    const ahora = new Date().toISOString();
    for (const tanda of enTandas(marcas.map((r) => r.id))) {
      const { error } = await admin.from("monotributo_revisiones")
        .update({ estado: "resuelta", resolucion: "confirmado", resuelta_por: yoId, resuelta_at: ahora,
                  nota: limpiarNota(nota) ?? "Sin deuda", valor_confirmado: "no" })
        .in("id", tanda).eq("estado", "pendiente");
      if (error) return { error: error.message };
    }
    revalidatePath("/monotributo", "layout");
    return { ok: true, resueltas: marcas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar." };
  }
}
