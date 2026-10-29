import type { ObjetivoSueldos } from "@/lib/objetivos";
import { getVencimientoF931, restarDiasHabiles, sumarDiasHabiles, enesimoDiaHabilDelMes, esDiaHabil } from "@/lib/vencimientos";

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

/** "rojo" = hecho pasado el límite; "vencido" = pendiente con el límite ya
 * pasado (también se muestra en rojo, pero cuenta como pendiente). */
export type ColorEnVivo = Color | "vencido" | "gris" | "sin_fecha";

/** Fecha calendario (AAAAMMDD) de un instante, en hora de Argentina: un
 * tilde a las 22 hs del día objetivo es "ese día" aunque en UTC ya sea el
 * siguiente. */
export function diaAR(d: Date): number {
  const [y, m, dd] = d
    .toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .split("-")
    .map(Number);
  return y * 10000 + m * 100 + dd;
}

/** Fecha calendario (AAAAMMDD) de un objetivo/límite, que se arman con
 * new Date(anio, mes, dia) y por eso se leen con los getters locales. */
export function diaFecha(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Estado EN VIVO para el dashboard: solo es verde lo HECHO con tilde en o
 * antes del objetivo. Pendiente en plazo = gris; pendiente con el límite
 * vencido = rojo. Hecho sin fecha de tilde (detectado por Drive) no se puede
 * verificar: queda aparte como "sin_fecha", igual que en Productividad. */
export function clasificarEnVivo(
  completado: boolean,
  completadoEn: string | null,
  objetivo: Date,
  limite: Date,
  hoy: Date = new Date()
): ColorEnVivo {
  if (completado) {
    if (!completadoEn) return "sin_fecha";
    const marcado = diaAR(new Date(completadoEn));
    if (marcado <= diaFecha(objetivo)) return "verde";
    if (marcado <= diaFecha(limite)) return "amarillo";
    return "rojo";
  }
  return diaAR(hoy) > diaFecha(limite) ? "vencido" : "gris";
}

/** Días hábiles (lunes a viernes, sin feriados) desde mañana hasta `fecha`
 * inclusive. 0 si `fecha` es hoy o ya pasó. */
export function diasHabilesHasta(fecha: Date, hoy: Date = new Date()): number {
  const objetivo = diaFecha(fecha);
  const h = diaAR(hoy);
  const d = new Date(Math.floor(h / 10000), Math.floor(h / 100) % 100 - 1, h % 100, 12);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    d.setDate(d.getDate() + 1);
    if (diaFecha(d) > objetivo) break;
    if (esDiaHabil(d)) n++;
  }
  return n;
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
