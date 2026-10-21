// Semáforo de colores del módulo Contable: rojo → amarillo → naranja →
// verde claro → verde intenso. Un solo lugar para que Estado, EECC, Avance
// y los dashboards usen exactamente los mismos colores.

export type SemaforoInfo = { label: string; cls: string; bar: string };

const ROJO = { cls: "bg-red-100 text-red-700", bar: "bg-red-300" };
const ROJO_SOLIDO = { cls: "bg-red-600 text-white", bar: "bg-red-600" };
const AMARILLO = { cls: "bg-yellow-100 text-yellow-800", bar: "bg-yellow-400" };
const NARANJA = { cls: "bg-orange-100 text-orange-700", bar: "bg-orange-400" };
const VERDE_CLARO = { cls: "bg-green-100 text-green-700", bar: "bg-green-300" };
const VERDE_INTENSO = { cls: "bg-green-600 text-white", bar: "bg-green-600" };

// Sin asignar → Asignado → Legalizado → Finalizado (= en ARCA); Frenado
// puede ocurrir en cualquier punto (rojo sólido para no confundirlo con
// "Sin asignar", que es rojo suave).
export const ESTADO_BALANCE: Record<string, SemaforoInfo> = {
  sin_asignar: { label: "Sin asignar", ...ROJO },
  asignado:    { label: "Asignado",    ...AMARILLO },
  legalizado:  { label: "Legalizado",  ...VERDE_CLARO },
  finalizado:  { label: "Finalizado",  ...VERDE_INTENSO },
  frenado:     { label: "Frenado",     ...ROJO_SOLIDO },
};

export const ESTADO_EECC: Record<string, SemaforoInfo> = {
  pendiente:       { label: "Pendiente",         ...ROJO },
  en_proceso:      { label: "En proceso",        ...AMARILLO },
  pendiente_pago:  { label: "Pendiente de pago", ...NARANJA },
  legalizado:      { label: "Legalizado",        ...VERDE_CLARO },
  presentado_arca: { label: "En ARCA",           ...VERDE_INTENSO },
};

export function avanceCls(v: number): string {
  if (v >= 100) return VERDE_INTENSO.cls;
  if (v > 0) return AMARILLO.cls;
  return ROJO.cls;
}

// Avance por etapas: el contador no elige un número, marca la etapa (pedido
// de información, recepción, estado de EECC) y acá se deriva el % fijo. El
// único punto realmente "manual" de esta escalera es marcar estado_eecc en
// 'en_proceso' (contabilidad cerrada / borrador de EECC armado) — el resto
// son checkboxes/estados que ya existían, solo que antes el % se elegía
// aparte, a mano, sin relación real con estos campos.
// 0% Asignado · 10% Información pedida (envio1) · 25% Información recibida
// (info_recibida) · 50% Contabilidad cerrada / borrador EECC (estado_eecc
// = en_proceso) · 75% EECC en legalización / pendiente de pago
// (pendiente_pago) · 90% Legalizado · 100% En ARCA.
// Los formularios derivados (855, F899, F713, F657, IGJ) NO suman acá.
// Alerta por demora en la respuesta del cliente: si se pidió información
// (envio1) y todavía no llegó (info_recibida sigue en false), cuántos días
// pasaron desde el pedido. Devuelve null si no corresponde alertar todavía
// (recién pedido, o ya se recibió). El umbral de alerta (5 días) lo aplica
// quien llama esto — acá solo se calculan los días.
export function diasDemoraPedido(b: {
  envio1?: boolean;
  envio1_fecha?: string | null;
  info_recibida?: boolean;
}): number | null {
  if (!b.envio1 || !b.envio1_fecha || b.info_recibida) return null;
  // envio1_fecha ahora es timestamp completo (fecha y hora) — para "días
  // de demora" lo que importa es el día de calendario, no la hora exacta.
  const pedido = new Date(b.envio1_fecha.slice(0, 10) + "T00:00:00");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.floor((hoy.getTime() - pedido.getTime()) / 86400000);
}

// Color del degradé hacia rojo para la celda de "Pedido de información"
// cuando hay demora — más días sin respuesta, más rojo. Arranca tenue a los
// 5 días (el umbral de alerta) y llega a rojo sólido a los 20.
export function colorAlertaDemora(dias: number): string {
  const progreso = Math.min(Math.max(dias - 5, 0), 15) / 15; // 0 a 1
  const intensidad = 0.12 + progreso * 0.6; // 0.12 a 0.72
  return `rgba(239, 68, 68, ${intensidad.toFixed(2)})`;
}

export function calcularAvance(b: {
  envio1?: boolean;
  info_recibida?: boolean;
  estado_eecc?: string;
}): number {
  if (b.estado_eecc === "presentado_arca") return 100;
  if (b.estado_eecc === "legalizado") return 90;
  if (b.estado_eecc === "pendiente_pago") return 75;
  if (b.estado_eecc === "en_proceso") return 50;
  if (b.info_recibida) return 25;
  if (b.envio1) return 10;
  return 0;
}

// Ítem 67: los días de vencimiento ya NO son una constante fija acá — se
// configuran desde /productividad/configuracion y se resuelven por cliente
// (objetivo general + excepción opcional) vía src/lib/objetivos.ts. Solo
// queda el texto de la tarjeta del dashboard, que no es configurable.
export const OBJETIVO_CONTABLE_TEXTO = "Balances En ARCA antes del vencimiento";

// Ítem 34 — el Estado deja de cargarse a mano y se calcula desde el
// semáforo EECC: EECC Legalizado → Estado Legalizado; EECC En ARCA → Estado
// Finalizado (= terminado). Asignado/Sin asignar siguen dependiendo de si
// tiene responsable. Frenado es la única excepción manual: una vez frenado,
// se queda frenado pase lo que pase con EECC/responsable hasta que alguien
// lo reanude a propósito (quien llama esto decide eso, acá solo se calcula
// el estado "automático").
export function calcularEstado(b: {
  estado_eecc?: string;
  responsable_id?: string | null;
  responsable2_id?: string | null;
}): string {
  if (b.estado_eecc === "presentado_arca") return "finalizado";
  if (b.estado_eecc === "legalizado") return "legalizado";
  return b.responsable_id || b.responsable2_id ? "asignado" : "sin_asignar";
}
