// Módulo Monotributo: listas cerradas, etiquetas y reglas de revisión.
// Sin imports de servidor: lo usan tanto las Server Actions como la UI.

import { esDiaHabil } from "@/lib/vencimientos";

export const FORMAS_PAGO = [
  "qr",
  "pmc",
  "debito_automatico",
  "tarjeta_credito",
  "paga_por_su_cuenta",
  "red_link",
  "interbanking",
  "reafectar_saldo",
] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const FORMA_PAGO_LABEL: Record<FormaPago, string> = {
  qr: "QR",
  pmc: "PMC",
  debito_automatico: "Débito automático",
  tarjeta_credito: "Tarjeta de crédito",
  paga_por_su_cuenta: "Paga por su cuenta",
  red_link: "Red Link",
  interbanking: "Interbanking",
  reafectar_saldo: "Reafectar saldo",
};

/** Administrativo y Cobranzas ven el módulo pero nunca son responsables de
 * clientes: no aparecen en Equipo, en el desplegable de responsable ni en las
 * métricas por responsable, aunque les quede el área tildada. */
export function puedeSerResponsable(rol: string | null | undefined): boolean {
  return rol !== "administrativo" && rol !== "cobranzas";
}

export const MEDIOS = ["mail", "whatsapp"] as const;
export type Medio = (typeof MEDIOS)[number];
export const MEDIO_LABEL: Record<Medio, string> = { mail: "Mail", whatsapp: "WhatsApp" };

export const ESTADOS_MES = [
  "pendiente",
  "vep_generado",
  "en_borrador",
  "enviado",
  "avisado",
  "pagado",
  "no_pago",
] as const;
export type EstadoMes = (typeof ESTADOS_MES)[number];
export const ESTADO_MES_LABEL: Record<EstadoMes, string> = {
  pendiente: "Pendiente",
  vep_generado: "VEP generado",
  en_borrador: "En borrador",
  enviado: "Enviado",
  avisado: "Avisado",
  pagado: "Pagado",
  no_pago: "No pagó",
};

export type CampoRevision =
  | "responsable"
  | "forma_pago"
  | "medio_contacto"
  | "cuit"
  | "estado"
  | "deuda"
  | "pago"
  | "alta";

export const CAMPO_REVISION_LABEL: Record<CampoRevision, string> = {
  responsable: "Responsable",
  forma_pago: "Forma de pago",
  medio_contacto: "Medio de contacto",
  cuit: "CUIT",
  estado: "Estado",
  deuda: "Deuda",
  pago: "Pago del mes",
  alta: "Alta",
};

export type Gravedad = "rojo" | "amarillo";

export interface Revision {
  id: string;
  cliente_id: string;
  anio: number | null;
  mes: number | null;
  campo: CampoRevision;
  motivo: string;
  gravedad: Gravedad;
  estado: "pendiente" | "resuelta";
  origen: "importacion" | "regla_automatica";
  detectada_at: string;
  resuelta_por: string | null;
  resuelta_at: string | null;
  resolucion: "corregido" | "confirmado" | null;
  nota: string | null;
  valor_confirmado: string | null;
}

export interface DatosMonotributoCliente {
  forma_pago: FormaPago | null;
  paga_desde_cliente_id: string | null;
  paga_desde_texto: string | null;
  avisa: boolean;
  envia_vep: boolean;
  medio: Medio | null;
  destinatario: string | null;
  mails: string[];
  whatsapp: string | null;
  empresa_grupo: string | null;
  saldo_a_favor: number | null;
  resolucion_arba: string | null;
  alta_por_importacion: boolean;
  observaciones: string | null;
  updated_at: string | null;
}

export const DATOS_VACIOS: DatosMonotributoCliente = {
  forma_pago: null,
  paga_desde_cliente_id: null,
  paga_desde_texto: null,
  avisa: false,
  envia_vep: false,
  medio: null,
  destinatario: null,
  mails: [],
  whatsapp: null,
  empresa_grupo: null,
  saldo_a_favor: null,
  resolucion_arba: null,
  alta_por_importacion: false,
  observaciones: null,
  updated_at: null,
};

export interface Hallazgo {
  campo: CampoRevision;
  motivo: string;
  gravedad: Gravedad;
}

/** Valor que identifica el estado de un campo: si "Está bien así" se confirmó
 * con este mismo valor, la regla no vuelve a marcar. */
export function valorCampo(
  campo: "responsable" | "forma_pago" | "medio_contacto",
  datos: DatosMonotributoCliente,
  responsableId: string | null
): string {
  if (campo === "responsable") return responsableId ?? "";
  if (campo === "forma_pago") return datos.forma_pago ?? "";
  return [datos.medio ?? "", datos.mails.join(","), datos.whatsapp ?? ""].join("|");
}

/** Reglas sobre los datos fijos del cliente. Avisar con QR o PMC NO es error
 * (se avisa y además se envía). Sin responsable es rojo siempre, también con
 * débito automático. */
export function evaluarReglasCliente(
  datos: DatosMonotributoCliente,
  responsableId: string | null
): Hallazgo[] {
  const out: Hallazgo[] = [];
  if (!responsableId) {
    out.push({ campo: "responsable", motivo: "Sin responsable", gravedad: "rojo" });
  }
  if (!datos.forma_pago) {
    out.push({ campo: "forma_pago", motivo: "Sin forma de pago", gravedad: "rojo" });
  }
  if (!datos.medio) {
    out.push({ campo: "medio_contacto", motivo: "Sin medio de contacto", gravedad: "rojo" });
  } else if (datos.medio === "mail" && datos.mails.length === 0) {
    out.push({ campo: "medio_contacto", motivo: "Medio Mail pero no hay mail", gravedad: "rojo" });
  } else if (datos.medio === "whatsapp" && !datos.whatsapp) {
    out.push({ campo: "medio_contacto", motivo: "Medio WhatsApp pero no hay teléfono", gravedad: "rojo" });
  }
  return out;
}

/** Vencimiento de la cuota: día 20 del mes, corrido al siguiente día hábil
 * (lunes a viernes, sin feriados — mismo criterio que esDiaHabil). YYYY-MM-DD. */
export function vencimientoCuota(anio: number, mes: number): string {
  const d = new Date(anio, mes - 1, 20);
  while (!esDiaHabil(d)) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Regla del mes: pasado el vencimiento, VEP enviado y sin Pagado → amarillo
 * "verificar pago". Nunca pasa solo a "No pagó". `hoy` en YYYY-MM-DD (hora AR). */
export function requiereVerificarPago(
  estado: EstadoMes,
  anio: number,
  mes: number,
  hoy: string
): boolean {
  return estado === "enviado" && hoy > vencimientoCuota(anio, mes);
}

export function hoyArgentina(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function fmtFechaHoraAR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function parsearMails(texto: string): string[] {
  return texto
    .split(/[;,\s]+/)
    .map((m) => m.trim())
    .filter(Boolean);
}
