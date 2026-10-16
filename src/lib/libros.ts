import type {
  EstadoLibro,
  OrganismoSocietario,
  PeriodicidadLibro,
  SoporteLibro,
  TipoSocietario,
  UbicacionLibro,
} from "@/types";

export const TIPOS_SOCIETARIOS: { value: TipoSocietario; label: string }[] = [
  { value: "SA", label: "SA" },
  { value: "SRL", label: "SRL" },
  { value: "SAS", label: "SAS" },
  { value: "FUNDACION", label: "Fundación" },
  { value: "ASOCIACION", label: "Asociación" },
  { value: "SOCIEDAD_SIMPLE", label: "Sociedad simple" },
  { value: "SOCIEDAD_DE_HECHO", label: "Sociedad de hecho" },
];

export const TIPO_SOCIETARIO_LABEL = Object.fromEntries(
  TIPOS_SOCIETARIOS.map((t) => [t.value, t.label])
) as Record<TipoSocietario, string>;

export const ORGANISMOS: { value: OrganismoSocietario; label: string }[] = [
  { value: "IGJ", label: "IGJ" },
  { value: "DPPJ", label: "DPPJ" },
  { value: "OTRO", label: "Otro" },
];

export const PERIODICIDAD_LABEL: Record<PeriodicidadLibro, string> = {
  balance: "Anual (con el balance)",
  trimestral: "Trimestral",
  evento: "Por evento",
};

export const ESTADO_LIBRO: Record<EstadoLibro, { label: string; cls: string }> = {
  activo: { label: "Activo", cls: "bg-violet-50 text-violet-700" },
  cerrado: { label: "Cerrado", cls: "bg-gray-100 text-gray-500" },
  sin_libro: { label: "Sin libro", cls: "bg-red-50 text-red-600" },
};

export const SOPORTE_LABEL: Record<SoporteLibro, string> = {
  fisico: "Físico",
  digital: "Digital",
};

export const UBICACION_LABEL: Record<UbicacionLibro, string> = {
  estudio: "Estudio",
  cliente: "Cliente",
  copiadora: "Copiadora",
  otro: "Otro",
};

// Pasa a ser configurable en la etapa 4 (Configuración del módulo).
export const UMBRAL_FOLIOS = 10;

// IGJ es CABA y DPPJ es Provincia de Buenos Aires. jurisdiccion_legal es
// texto libre en clientes, por eso se compara normalizado.
export function organismoSugerido(jurisdiccionLegal: string | null | undefined): OrganismoSocietario | null {
  const j = (jurisdiccionLegal ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!j) return null;
  if (/\bcaba\b|capital|ciudad autonoma/.test(j)) return "IGJ";
  if (/\bpba\b|\bbs\.? ?as\b|buenos aires|provincia/.test(j)) return "DPPJ";
  return "OTRO";
}

export function foliosLibres(folios_totales: number | null, folios_usados: number): number | null {
  return folios_totales == null ? null : folios_totales - folios_usados;
}

export function vencimientoMandato(designacion: string | null, anios: number | null): string | null {
  if (!designacion || !anios) return null;
  const [y, m, d] = designacion.split("-").map(Number);
  return `${y + anios}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function diasHasta(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(fecha + "T00:00:00").getTime() - hoy.getTime()) / 86_400_000);
}

export function fmtFecha(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}
