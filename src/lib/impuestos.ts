// Impuestos: lista única de subtipos (antes cada pantalla tenía su copia) y
// los datos fijos por cliente de la tabla impuestos_clientes
// (supabase/add_impuestos_modulo_v2.sql).

export const SUBTIPOS_IMPUESTOS = [
  { key: "iva", label: "IVA", vtoDia: 20 },
  { key: "iibb", label: "IIBB", vtoDia: 15 },
  { key: "seh", label: "Seg. e Hig.", vtoDia: 10 },
  { key: "sicore", label: "SICORE", vtoDia: 12 },
] as const;

export type SubtipoImpuesto = (typeof SUBTIPOS_IMPUESTOS)[number]["key"];

export const SUBTIPO_IMPUESTO_LABEL: Record<string, string> = Object.fromEntries(
  SUBTIPOS_IMPUESTOS.map((s) => [s.key, s.label])
);

export const VTO_DIA_IMPUESTO: Record<string, number> = Object.fromEntries(
  SUBTIPOS_IMPUESTOS.map((s) => [s.key, s.vtoDia])
);

export function esSubtipoImpuesto(v: string): v is SubtipoImpuesto {
  return SUBTIPOS_IMPUESTOS.some((s) => s.key === v);
}

export type OtroServicioImpuestos = { servicio: string; responsable_id: string | null; responsable: string; detalle?: string };

export type DatosImpuestosCliente = {
  agencias_iibb: string[];
  seh_municipios: number | null;
  apoyo_iva: string | null;
  otros_servicios: OtroServicioImpuestos[];
};
