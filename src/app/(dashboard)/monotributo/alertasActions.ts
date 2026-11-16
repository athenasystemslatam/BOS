"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEditorMonotributo } from "@/lib/monotributoServer";
import { TIPOS_CON_RESUELTA, type TipoAlerta } from "@/lib/monotributoAlertasTipos";

/** "Resuelta" para alertas que no se cierran solas. Queda quién y cuándo; si el
 * valor que la disparó cambia, la alerta vuelve a aparecer. */
export async function marcarAlertaResuelta(
  items: { clienteId: string; tipo: TipoAlerta; valor: string | null }[],
  anio: number,
  mes: number,
  nota: string | null
): Promise<{ error: string } | { ok: true }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const filas = items
    .filter((i) => TIPOS_CON_RESUELTA.includes(i.tipo))
    .map((i) => ({
      cliente_id: i.clienteId,
      tipo: i.tipo,
      anio,
      mes,
      valor: i.valor,
      nota: (nota ?? "").trim().slice(0, 500) || null,
      resuelta_por: yoId,
    }));
  if (!filas.length) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin.from("monotributo_alertas_resueltas").insert(filas);
  if (error) {
    return {
      error: /monotributo_alertas_resueltas/.test(error.message)
        ? "Falta correr el SQL de la etapa 7 (add_monotributo_etapa7.sql) para poder marcar Resuelta."
        : error.message,
    };
  }
  revalidatePath("/monotributo", "layout");
  return { ok: true };
}
