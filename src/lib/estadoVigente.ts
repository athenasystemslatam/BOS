import { diaAR } from "@/lib/objetivoSueldos";

// "Dar de baja" ahora guarda una fecha elegida (pasada, hoy o futura) en vez
// de siempre "el momento del clic" — esta es la única función que decide si
// esa fecha ya significa "afuera de Seguimiento hoy" o todavía no. Se parsea
// el string de fecha a mano (en vez de con Date + getters) para no depender
// de en qué huso corre el servidor: "2026-12-01" siempre son esos
// año/mes/día, los tome quien los tome.
function fechaANumero(fechaISO: string): number {
  const [y, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  return y * 10000 + m * 100 + d;
}

/**
 * Un cliente/servicio con `estadoActivo` sigue vigente siempre. Uno dado de
 * baja (`estadoActivo = false`) sigue apareciendo en Seguimiento mientras la
 * fecha de baja elegida todavía no llegó (baja programada a futuro); deja de
 * aparecer desde ese día inclusive (baja de hoy o retroactiva).
 */
export function estaVigenteHoy(
  estadoActivo: boolean,
  fechaBaja: string | null | undefined,
  hoy: Date = new Date()
): boolean {
  if (estadoActivo) return true;
  if (!fechaBaja) return false;
  return diaAR(hoy) < fechaANumero(fechaBaja);
}

/** Fecha de hoy en Argentina (no la del huso del navegador/servidor), en
 * formato YYYY-MM-DD — el que entiende <input type="date">. Default del
 * selector de fecha de baja en los modales de cada módulo. */
export function hoyAR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
