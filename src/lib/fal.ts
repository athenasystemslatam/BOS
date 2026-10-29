// FAL (Fondo de Asistencia Laboral): rige desde el devengado diciembre 2026.
// Se le avisa a cada cliente de Sueldos, se le pide el ID FAL y se confirma en
// ARCA. Lo que no se confirmó para la fecha de corte (configurable, objetivos
// de Sueldos) queda "Asignado por default". Sin imports de servidor: lo usan
// también componentes de cliente — la parte de base está en falServer.ts.

export const FAL_FECHA_CORTE_DEFAULT = "2027-01-15";
/** El cartel de Seguimiento aparece desde este período. */
export const FAL_DESDE_ANIO = 2026;
export const FAL_DESDE_MES = 10;

export type PasoFal = "aviso_enviado" | "respondio" | "confirmado_arca";
export type MotivoDefaultFal = "no_respondio" | "respondio_sin_confirmar";

export type FilaFal = {
  cliente_id: string;
  aviso_enviado: boolean;
  aviso_enviado_en: string | null;
  respondio: boolean;
  respondio_en: string | null;
  id_fal_en: string | null;
  confirmado_arca: boolean;
  confirmado_arca_en: string | null;
  asignado_default: boolean;
  default_motivo: MotivoDefaultFal | null;
};

export const PASOS_FAL: { paso: PasoFal; label: string }[] = [
  { paso: "aviso_enviado", label: "Aviso enviado" },
  { paso: "respondio", label: "Respondió" },
  { paso: "confirmado_arca", label: "Confirmado en ARCA" },
];

export const MOTIVO_DEFAULT_LABEL: Record<MotivoDefaultFal, string> = {
  no_respondio: "No respondió",
  respondio_sin_confirmar: "Respondió pero no se confirmó",
};

export function filaFalVacia(clienteId: string): FilaFal {
  return {
    cliente_id: clienteId,
    aviso_enviado: false, aviso_enviado_en: null,
    respondio: false, respondio_en: null,
    id_fal_en: null,
    confirmado_arca: false, confirmado_arca_en: null,
    asignado_default: false, default_motivo: null,
  };
}

/** Hoy en Argentina como AAAA-MM-DD (el servidor corre en UTC). */
export function hoyAR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** El seguimiento FAL (cartel y lista) está activo hasta el día anterior al corte. */
export function falActivo(fechaCorte: string): boolean {
  return hoyAR() < fechaCorte;
}

export function fmtFechaFal(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function fmtFechaCorte(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}
