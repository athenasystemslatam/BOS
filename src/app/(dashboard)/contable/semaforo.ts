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
