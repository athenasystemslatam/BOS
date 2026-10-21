import type { ObjetivoSueldos } from "@/lib/objetivos";
import { getVencimientoF931, restarDiasHabiles, sumarDiasHabiles, enesimoDiaHabilDelMes } from "@/lib/vencimientos";

// Ítem 69: cálculo de objetivo/límite para F.931 y Recibos, compartido entre
// Productividad Sueldos (histórico, por tarea ya marcada) y el dashboard de
// Sueldos (en vivo, por tarea pendiente o ya marcada).

export type Color = "verde" | "amarillo" | "rojo";

export function diffDias(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86400000);
}

/** Objetivo = fin de la ventana ideal, límite = tope real antes de
 * considerarlo tarde. Verde = dentro del objetivo, amarillo = después del
 * objetivo pero dentro del límite, rojo = pasado el límite. Para una tarea
 * ya marcada, usar la fecha real de marcado. */
export function clasificar(marcadoEn: string, objetivo: Date, limite: Date): Color {
  const marcado = new Date(marcadoEn);
  if (diffDias(marcado, objetivo) >= 0) return "verde";
  if (diffDias(marcado, limite) >= 0) return "amarillo";
  return "rojo";
}

/** Igual que `clasificar`, pero para el estado EN VIVO de una tarea que
 * puede no estar completada todavía: si no hay fecha de marcado se compara
 * "hoy" contra el objetivo/límite (¿vamos a tiempo o ya estamos tarde?). Si
 * está completada pero sin timestamp (dato viejo o sincronizado por Drive,
 * sin forma de verificar el momento exacto), se toma como verde. */
export function clasificarEstado(
  completado: boolean,
  completadoEn: string | null,
  objetivo: Date,
  limite: Date,
  hoy: Date = new Date()
): Color {
  if (completado && !completadoEn) return "verde";
  const referencia = completadoEn ? new Date(completadoEn) : hoy;
  if (diffDias(referencia, objetivo) >= 0) return "verde";
  if (diffDias(referencia, limite) >= 0) return "amarillo";
  return "rojo";
}

export function objetivoLimiteF931(
  terminacionCuit: number,
  anio: number,
  mes: number,
  objetivoGeneral: ObjetivoSueldos
): { objetivo: Date; limite: Date } {
  const venc = getVencimientoF931(terminacionCuit, anio, mes);
  const objetivo = restarDiasHabiles(venc, objetivoGeneral.f931_dias_habiles_antes_vencimiento);
  return { objetivo, limite: venc };
}

type TareaPreliquidado = {
  preliquidado: boolean;
  preliquidado_fecha: string | null;
  novedades_recibidas_fecha: string | null;
};

/** Objetivo de Recibos del período: por defecto N días calendario antes del
 * último día del mes liquidado. Si el cliente se marcó "Preliquidado" antes
 * de fin de mes y ya se recibieron las novedades, el objetivo pasa a ser esa
 * fecha + 1 día hábil (ítem 97) — el F.931 nunca se ve afectado por esto y
 * el límite de Recibos tampoco cambia. */
export function objetivoRecibos(
  anio: number,
  mes: number,
  objetivoGeneral: ObjetivoSueldos,
  tarea: TareaPreliquidado
): Date {
  const finDeMes = new Date(anio, mes, 0, 23, 59, 59);
  if (tarea.preliquidado && tarea.preliquidado_fecha && tarea.novedades_recibidas_fecha) {
    const preliquidadoEn = new Date(tarea.preliquidado_fecha);
    if (preliquidadoEn <= finDeMes) {
      return sumarDiasHabiles(new Date(tarea.novedades_recibidas_fecha), 1);
    }
  }
  const d = new Date(anio, mes, 0); // último día del mes liquidado
  d.setDate(d.getDate() - objetivoGeneral.recibos_dias_antes_fin_mes);
  return d;
}

export function limiteRecibos(anio: number, mes: number, objetivoGeneral: ObjetivoSueldos): Date {
  const mesSiguiente = mes === 12 ? 1 : mes + 1;
  const anioSiguiente = mes === 12 ? anio + 1 : anio;
  return enesimoDiaHabilDelMes(anioSiguiente, mesSiguiente, objetivoGeneral.recibos_limite_dia_habil_mes_siguiente);
}

export function objetivoLimiteRecibos(
  anio: number,
  mes: number,
  objetivoGeneral: ObjetivoSueldos,
  tarea: TareaPreliquidado
): { objetivo: Date; limite: Date } {
  return {
    objetivo: objetivoRecibos(anio, mes, objetivoGeneral, tarea),
    limite: limiteRecibos(anio, mes, objetivoGeneral),
  };
}
