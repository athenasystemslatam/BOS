// Alertas internas de Monotributo: tipos y textos (sin código de servidor, lo usa también la pantalla).

import type { Gravedad } from "@/lib/monotributo";

export const TIPOS_ALERTA = [
  "verificar_pago",
  "sin_enviar",
  "sin_avisar",
  "deuda_sin_avisar",
  "intimacion",
  "debito_sin_verificar",
  "sin_responsable",
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export const TIPO_ALERTA_LABEL: Record<TipoAlerta, string> = {
  verificar_pago: "Verificar pago",
  sin_enviar: "VEP sin enviar",
  sin_avisar: "Sin avisar",
  deuda_sin_avisar: "Deuda sin avisar",
  intimacion: "Intimación",
  debito_sin_verificar: "Débito sin verificar",
  sin_responsable: "Sin responsable",
};

/** Cómo se cierra cada una (se muestra en la pantalla). */
export const TIPO_ALERTA_CIERRE: Record<TipoAlerta, string> = {
  verificar_pago: "Se cierra al marcar Pagado o No pagó.",
  sin_enviar: "Se cierra al marcar Enviado (o Pagado / No pagó).",
  sin_avisar: "Se cierra al marcar Avisado (o Enviado / Pagado / No pagó).",
  deuda_sin_avisar: "Se cierra al marcar el aviso de deuda en Seguimiento.",
  intimacion: "Se cierra con \"Resuelta\" (o si la intimación cambia).",
  debito_sin_verificar: "Se cierra al marcar Pagado (o No pagó).",
  sin_responsable: "Se cierra al asignarle responsable.",
};

/** Las que no tienen un estado en BOS que las cierre: llevan botón "Resuelta". */
export const TIPOS_CON_RESUELTA: TipoAlerta[] = ["intimacion"];

export interface Alerta {
  clave: string;
  tipo: TipoAlerta;
  gravedad: Gravedad;
  cliente_id: string;
  cliente: string;
  responsable_id: string | null;
  responsable: string;
  detalle: string;
  valor: string | null;
}
