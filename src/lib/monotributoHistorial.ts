// Historial de cambios de Monotributo (tabla monotributo_historial): cada cambio
// queda con el antes y el después, quién y cuándo, y se puede revertir (revertir
// crea una entrada nueva, nunca borra). Si la tabla todavía no existe, registrar
// no corta la operación: el cambio se guarda igual.

import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type EntidadHistorial = "tarea" | "ficha" | "responsable" | "revision" | "alerta" | "calendario";

export interface EntradaHistorial {
  cliente_id: string | null;
  anio?: number | null;
  mes?: number | null;
  entidad: EntidadHistorial;
  campo: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  usuario_id: string | null;
  ref_id?: string | null;
  revierte_id?: string | null;
  nota?: string | null;
}

const iguales = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Arma una entrada por campo que cambió entre `antes` y `despues`. */
export function diferencias(
  base: Omit<EntradaHistorial, "campo" | "valor_anterior" | "valor_nuevo">,
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown>,
  campos: readonly string[]
): EntradaHistorial[] {
  const out: EntradaHistorial[] = [];
  for (const c of campos) {
    if (!(c in despues)) continue;
    const a = antes?.[c] ?? null;
    const d = despues[c] ?? null;
    if (!iguales(a, d)) out.push({ ...base, campo: c, valor_anterior: a, valor_nuevo: d });
  }
  return out;
}

/** Guarda las entradas y devuelve sus ids (para "Deshacer"). Nunca tira error. */
export async function registrarHistorial(admin: Admin, entradas: EntradaHistorial[]): Promise<string[]> {
  if (!entradas.length) return [];
  try {
    const { data, error } = await admin
      .from("monotributo_historial")
      .insert(entradas.map((e) => ({ ...e, valor_anterior: e.valor_anterior ?? null, valor_nuevo: e.valor_nuevo ?? null })))
      .select("id");
    if (error) return [];
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}
