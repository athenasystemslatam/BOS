import { createAdminClient } from "@/lib/supabase/admin";
import type { ReglaVto, TipoVto } from "@/lib/vencimientosContables";

// Ítem 67: objetivo general por área + excepción por cliente, en vez de
// constantes fijas en el código. Sueldos no usa excepción por cliente acá
// (ver ítem 97 — usa la marca de Preliquidado por período en su lugar).

export type ObjetivoContable = {
  balance_dias_vto: number;
  f855_dias_vto_extra: number;
  // Ítem 91: regla por vencimiento (base + días). Si falta, se arma desde
  // los dos números de arriba (ver resolverReglas).
  reglas_vto?: Partial<Record<TipoVto, ReglaVto>>;
  // Ítem 70: a propósito en null hasta que dirección los defina con datos
  // reales del ciclo de cierres al 31/12/2026.
  dias_pedir_info_desde_cierre: number | null;
  dias_recepcion_a_legalizado: number | null;
};

export type ObjetivoSueldos = {
  f931_dias_habiles_antes_vencimiento: number;
  recibos_dias_antes_fin_mes: number;
  recibos_limite_dia_habil_mes_siguiente: number;
};

const DEFAULT_CONTABLE: ObjetivoContable = {
  balance_dias_vto: 135,
  f855_dias_vto_extra: 25,
  dias_pedir_info_desde_cierre: null,
  dias_recepcion_a_legalizado: null,
};

const DEFAULT_SUELDOS: ObjetivoSueldos = {
  f931_dias_habiles_antes_vencimiento: 3,
  recibos_dias_antes_fin_mes: 2,
  recibos_limite_dia_habil_mes_siguiente: 3,
};

export async function getObjetivoContable(): Promise<ObjetivoContable> {
  const admin = createAdminClient();
  const { data } = await admin.from("objetivos_area").select("config").eq("area", "contable").maybeSingle();
  return { ...DEFAULT_CONTABLE, ...(data?.config as Partial<ObjetivoContable> | undefined) };
}

export async function getObjetivoSueldos(): Promise<ObjetivoSueldos> {
  const admin = createAdminClient();
  const { data } = await admin.from("objetivos_area").select("config").eq("area", "sueldos").maybeSingle();
  return { ...DEFAULT_SUELDOS, ...(data?.config as Partial<ObjetivoSueldos> | undefined) };
}

// Excepciones por cliente — hoy solo las usa Contable ("y otros módulos"
// según el ítem 67), nunca Sueldos.
export async function getExcepcionesCliente(
  area: string
): Promise<Map<string, Record<string, number | null>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("objetivos_excepcion_cliente")
    .select("cliente_id, config")
    .eq("area", area);
  const mapa = new Map<string, Record<string, number | null>>();
  for (const fila of data ?? []) {
    mapa.set(fila.cliente_id, fila.config as Record<string, number | null>);
  }
  return mapa;
}

export function resolverObjetivoContable(
  general: ObjetivoContable,
  excepciones: Map<string, Record<string, number | null>>,
  clienteId: string | null | undefined
): ObjetivoContable {
  const excepcion = clienteId ? excepciones.get(clienteId) : undefined;
  return excepcion ? { ...general, ...excepcion } : general;
}
