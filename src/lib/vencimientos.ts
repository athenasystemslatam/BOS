// Fechas oficiales ARCA F.931 2026
// Índice = mes de la liquidación. Valores = [CUITs 0-3, CUITs 4-6, CUITs 7-9]
const FECHAS_2026: Record<number, readonly [string, string, string]> = {
  1:  ["2026-02-09", "2026-02-10", "2026-02-11"],
  2:  ["2026-03-09", "2026-03-10", "2026-03-11"],
  3:  ["2026-04-09", "2026-04-10", "2026-04-13"],
  4:  ["2026-05-11", "2026-05-12", "2026-05-13"],
  5:  ["2026-06-09", "2026-06-10", "2026-06-11"],
  6:  ["2026-07-10", "2026-07-13", "2026-07-14"],
  7:  ["2026-08-10", "2026-08-11", "2026-08-12"],
  8:  ["2026-09-09", "2026-09-10", "2026-09-11"],
  9:  ["2026-10-09", "2026-10-12", "2026-10-13"],
  10: ["2026-11-09", "2026-11-10", "2026-11-11"],
  11: ["2026-12-09", "2026-12-10", "2026-12-11"],
  12: ["2027-01-09", "2027-01-12", "2027-01-13"],
};

export function getVencimientoF931(terminacion: number, anio: number, mes: number): Date {
  const idx = terminacion <= 3 ? 0 : terminacion <= 6 ? 1 : 2;
  if (anio === 2026 && FECHAS_2026[mes]) {
    return new Date(FECHAS_2026[mes][idx] + "T12:00:00");
  }
  // Fallback genérico para años no configurados
  const dia = [9, 10, 11][idx];
  const mesV = mes === 12 ? 1 : mes + 1;
  const anioV = mes === 12 ? anio + 1 : anio;
  return new Date(anioV, mesV - 1, dia, 12, 0, 0);
}

export const GRUPOS_CUIT = [
  { label: "CUITs 0–3", min: 0, max: 3 },
  { label: "CUITs 4–6", min: 4, max: 6 },
  { label: "CUITs 7–9", min: 7, max: 9 },
] as const;

export function getVencimientosGrupos(anio: number, mes: number) {
  return GRUPOS_CUIT.map((g) => ({
    ...g,
    fecha: getVencimientoF931(g.min, anio, mes),
  }));
}

export const MESES_NOMBRES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/**
 * Mes de trabajo = mes anterior al actual, hasta 2 días después del
 * último vencimiento F.931 de ese mes. Ej: último venc. junio = 14/07
 * → sigue siendo "junio" hasta el 16/07 inclusive. El 17/07 cambia a julio.
 */
export function getMesTrabajoActual(): { mes: number; anio: number } {
  const hoy = new Date();
  const mesHoy = hoy.getMonth() + 1;
  const anioHoy = hoy.getFullYear();

  const mesPrevio = mesHoy === 1 ? 12 : mesHoy - 1;
  const anioPrevio = mesHoy === 1 ? anioHoy - 1 : anioHoy;

  // Último vencimiento del mes previo = CUIT 7-9 (siempre el más tardío)
  const ultimoVenc = getVencimientoF931(9, anioPrevio, mesPrevio);

  // Hasta 2 días después del último vencimiento, el mes de trabajo sigue siendo el previo
  const umbral = new Date(ultimoVenc);
  umbral.setDate(umbral.getDate() + 2);

  return hoy <= umbral
    ? { mes: mesPrevio, anio: anioPrevio }
    : { mes: mesHoy, anio: anioHoy };
}

export const CALENDAR_2026 = Object.entries(FECHAS_2026).map(([mesStr, fechas]) => {
  const mes = parseInt(mesStr);
  return {
    mes,
    nombre: MESES_NOMBRES[mes],
    grupos: [
      { label: "0–3", fecha: new Date(fechas[0] + "T12:00:00") },
      { label: "4–6", fecha: new Date(fechas[1] + "T12:00:00") },
      { label: "7–9", fecha: new Date(fechas[2] + "T12:00:00") },
    ],
  };
});
