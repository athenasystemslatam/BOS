// Alertas internas de Monotributo: tipos y textos (sin código de servidor, lo usa también la pantalla).

import type { Gravedad } from "@/lib/monotributo";

// Los pagos no son responsabilidad del estudio (lo nuestro es enviar y avisar): no hay alertas de "verificar pago" ni "verificar débito".
export const TIPOS_ALERTA = [
  "sin_enviar",
  "sin_avisar",
  "deuda_sin_avisar",
  "intimacion",
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export const TIPO_ALERTA_LABEL: Record<TipoAlerta, string> = {
  sin_enviar: "VEP sin enviar",
  sin_avisar: "Sin avisar",
  deuda_sin_avisar: "Deuda sin avisar",
  intimacion: "Intimación",
};

/** Cómo se cierra cada una (se muestra en la pantalla). */
export const TIPO_ALERTA_CIERRE: Record<TipoAlerta, string> = {
  sin_enviar: "Se cierra al marcar Enviado (o Pagado / No pagó).",
  sin_avisar: "Se cierra al marcar Avisado (o Enviado / Pagado / No pagó).",
  deuda_sin_avisar: "Se cierra al marcar la deuda como avisada o resuelta (Seguimiento → Deuda).",
  intimacion: "Se cierra al cambiar la intimación en Seguimiento, o con \"Resuelta\".",
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
