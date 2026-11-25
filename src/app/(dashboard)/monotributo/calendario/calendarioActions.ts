"use server";

import { refrescarMonotributo } from "@/lib/monotributoServer";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEditorMonotributo } from "@/lib/monotributoServer";
import { leerFecha } from "@/lib/calendarioArcaUtil";
import { registrarHistorial, type EntradaHistorial } from "@/lib/monotributoHistorial";

export interface FilaCalendarioEdit {
  mes: number;
  vencimiento: string;
  recatLimite: string | null;
  recatDesde: string | null;
  nota: string | null;
}

/** Guarda los 12 meses de un año. Si el año ya estaba cargado y no se confirmó, no pisa nada. */
export async function guardarCalendarioAnio(
  anio: number,
  filas: FilaCalendarioEdit[],
  confirmarPisar: boolean
): Promise<{ error: string } | { requiereConfirmacion: true; cambios: number } | { ok: true; cambios: number; historialIds: string[] }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (!(anio >= 2020 && anio <= 2100)) return { error: "Año inválido." };
  if (filas.length !== 12 || new Set(filas.map((f) => f.mes)).size !== 12) return { error: "Tienen que estar los 12 meses, sin repetir." };

  const limpias = [];
  for (const f of filas) {
    const vto = leerFecha(f.vencimiento);
    if (!vto || Number(vto.slice(0, 4)) !== anio) return { error: `${f.mes}/${anio}: el vencimiento tiene que ser una fecha de ${anio}.` };
    const limite = f.recatLimite ? leerFecha(f.recatLimite) : null;
    const desde = f.recatDesde ? leerFecha(f.recatDesde) : null;
    if (f.recatLimite && !limite) return { error: `${f.mes}/${anio}: el límite de recategorización no es una fecha válida.` };
    if (f.recatDesde && !desde) return { error: `${f.mes}/${anio}: "recategoriza desde" no es una fecha válida.` };
    if (desde && limite && desde > limite) return { error: `${f.mes}/${anio}: "recategoriza desde" es posterior al límite.` };
    limpias.push({
      anio,
      mes: f.mes,
      fecha_vencimiento_cuota: vto,
      fecha_limite_recategorizacion: limite,
      recategoriza_desde: limite ? desde : null,
      nota: (f.nota ?? "").trim() || null,
    });
  }

  const admin = createAdminClient();
  const { data: actuales, error: errLeer } = await admin
    .from("calendario_arca")
    .select("mes, fecha_vencimiento_cuota, fecha_limite_recategorizacion, recategoriza_desde, nota")
    .eq("anio", anio);
  if (errLeer) {
    return { error: /calendario_arca/.test(errLeer.message) ? "Falta correr el SQL del calendario (add_calendario_arca.sql)." : errLeer.message };
  }
  const porMes = new Map(((actuales ?? []) as Record<string, unknown>[]).map((r) => [r.mes as number, r]));

  const historial: EntradaHistorial[] = [];
  for (const n of limpias) {
    const a = porMes.get(n.mes);
    for (const campo of ["fecha_vencimiento_cuota", "fecha_limite_recategorizacion", "recategoriza_desde", "nota"] as const) {
      const antes = (a?.[campo] as string | null | undefined) ?? null;
      if (antes !== n[campo]) {
        historial.push({ cliente_id: null, anio, mes: n.mes, entidad: "calendario", campo, valor_anterior: antes, valor_nuevo: n[campo], usuario_id: yoId });
      }
    }
  }
  if (!historial.length) return { ok: true, cambios: 0, historialIds: [] };
  // Nunca pisar un año ya cargado sin confirmación.
  if (porMes.size > 0 && !confirmarPisar && historial.some((h) => h.valor_anterior !== null)) {
    return { requiereConfirmacion: true, cambios: historial.length };
  }

  const { error } = await admin
    .from("calendario_arca")
    .upsert(limpias.map((l) => ({ ...l, updated_at: new Date().toISOString(), updated_por: yoId })), { onConflict: "anio,mes" });
  if (error) return { error: error.message };

  const historialIds = await registrarHistorial(admin, historial);
  refrescarMonotributo();
  revalidatePath("/productividad/monotributo");
  return { ok: true, cambios: historial.length, historialIds };
}
