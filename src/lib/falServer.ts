import { createAdminClient } from "@/lib/supabase/admin";
import type { ObjetivoSueldos } from "@/lib/objetivos";
import { hoyAR, type FilaFal } from "@/lib/fal";

export const COLUMNAS_FAL =
  "cliente_id, aviso_enviado, aviso_enviado_en, respondio, respondio_en, id_fal_en, " +
  "confirmado_arca, confirmado_arca_en, asignado_default, default_motivo";

export async function getFilasFal(clienteIds: string[]): Promise<FilaFal[]> {
  if (clienteIds.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("clientes_fal").select(COLUMNAS_FAL).in("cliente_id", clienteIds);
  return (data as unknown as FilaFal[]) ?? [];
}

/** Al llegar la fecha de corte, marca UNA sola vez como "Asignado por
 * default" a todo cliente de Sueldos sin "Confirmado en ARCA". Corre al abrir
 * Seguimiento (mismo patrón que librosAutomaticos). Dos candados: por fecha
 * de corte en la config (un cliente dado de alta después no entra en el
 * barrido) y por fila (default_aplicado_en: una corrección a mano nunca se
 * pisa). */
export async function aplicarDefaultFal(objetivo: ObjetivoSueldos): Promise<void> {
  const corte = objetivo.fal_fecha_corte;
  if (hoyAR() < corte || objetivo.fal_default_aplicado_para === corte) return;

  const admin = createAdminClient();
  const { data: servicios } = await admin
    .from("servicios_cliente")
    .select("cliente_id")
    .eq("servicio", "sueldos")
    .eq("estado", true);
  const ids = Array.from(new Set((servicios ?? []).map((s) => s.cliente_id as string)));
  const { data: filas } = ids.length > 0
    ? await admin
        .from("clientes_fal")
        .select("cliente_id, respondio, confirmado_arca, default_aplicado_en")
        .in("cliente_id", ids)
    : { data: [] };
  const porCliente = new Map((filas ?? []).map((f) => [f.cliente_id as string, f]));

  const ahora = new Date().toISOString();
  const confirmados: { cliente_id: string; default_aplicado_en: string }[] = [];
  const porDefault: { cliente_id: string; asignado_default: boolean; default_motivo: string; default_aplicado_en: string; actualizado_en: string }[] = [];
  for (const id of ids) {
    const f = porCliente.get(id);
    if (f?.default_aplicado_en) continue;
    if (f?.confirmado_arca) {
      confirmados.push({ cliente_id: id, default_aplicado_en: ahora });
    } else {
      porDefault.push({
        cliente_id: id,
        asignado_default: true,
        default_motivo: f?.respondio ? "respondio_sin_confirmar" : "no_respondio",
        default_aplicado_en: ahora,
        actualizado_en: ahora,
      });
    }
  }

  // Cada lote con las mismas columnas: un upsert solo pisa las que manda.
  if (confirmados.length > 0) {
    const { error } = await admin.from("clientes_fal").upsert(confirmados, { onConflict: "cliente_id" });
    if (error) return;
  }
  if (porDefault.length > 0) {
    const { error } = await admin.from("clientes_fal").upsert(porDefault, { onConflict: "cliente_id" });
    if (error) return;
  }

  const { data: actual } = await admin.from("objetivos_area").select("config").eq("area", "sueldos").maybeSingle();
  await admin.from("objetivos_area").upsert({
    area: "sueldos",
    config: { ...((actual?.config as Record<string, unknown>) ?? {}), fal_default_aplicado_para: corte },
    updated_at: ahora,
  });
}
