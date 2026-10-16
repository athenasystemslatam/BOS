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
