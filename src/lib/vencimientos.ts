type FechasAnio = Record<number, readonly [string, string, string]>;

// Fechas oficiales ARCA F.931
// Índice = mes de la liquidación. Valores = [CUITs 0-3, CUITs 4-6, CUITs 7-9]
const FECHAS_2026: FechasAnio = {
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

// Para sumar un año: cuando ARCA publique el calendario (suele ser en
// diciembre), agregar acá `2027: { 1: [...], ..., 12: [...] }` con el mismo
// formato que 2026. Mientras falte, ese año usa fechas estimadas.
const FECHAS_OFICIALES: Record<number, FechasAnio> = {
  2026: FECHAS_2026,
};

export function tieneFechasOficialesF931(anio: number): boolean {
  return !!FECHAS_OFICIALES[anio];
}

export function getVencimientoF931(terminacion: number, anio: number, mes: number): Date {
  const idx = terminacion <= 3 ? 0 : terminacion <= 6 ? 1 : 2;
  const oficial = FECHAS_OFICIALES[anio]?.[mes];
  if (oficial) {
    return new Date(oficial[idx] + "T12:00:00");
  }
  // Estimado para años sin calendario cargado: día 9/10/11 del mes siguiente,
  // corrido al día hábil siguiente si cae en fin de semana (no contempla feriados).
  const dia = [9, 10, 11][idx];
  const mesV = mes === 12 ? 1 : mes + 1;
  const anioV = mes === 12 ? anio + 1 : anio;
  const fecha = new Date(anioV, mesV - 1, dia, 12, 0, 0);
  while (!esDiaHabil(fecha)) fecha.setDate(fecha.getDate() + 1);
  return fecha;
}

export function esDiaHabil(d: Date): boolean {
  const dia = d.getDay();
  return dia !== 0 && dia !== 6;
}

/** Resta N días hábiles (lunes a viernes, sin descontar feriados) a una fecha. */
export function restarDiasHabiles(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  let restantes = dias;
  while (restantes > 0) {
    d.setDate(d.getDate() - 1);
    if (esDiaHabil(d)) restantes--;
  }
  return d;
}

/** Suma N días hábiles (lunes a viernes, sin descontar feriados) a una fecha. */
export function sumarDiasHabiles(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  let restantes = dias;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (esDiaHabil(d)) restantes--;
  }
  return d;
}

/** N-ésimo día hábil (1-based) de un mes dado (mes 1-based). */
export function enesimoDiaHabilDelMes(anio: number, mes: number, n: number): Date {
  const d = new Date(anio, mes - 1, 1, 12, 0, 0);
  let contados = 0;
  while (true) {
    if (esDiaHabil(d)) {
      contados++;
      if (contados === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
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

/** Calendario F.931 de un año de liquidación (oficial si está cargado, si no estimado). */
export function getCalendarioF931(anio: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    return {
      mes,
      nombre: MESES_NOMBRES[mes],
      grupos: [
        { label: "0–3", fecha: getVencimientoF931(0, anio, mes) },
        { label: "4–6", fecha: getVencimientoF931(4, anio, mes) },
        { label: "7–9", fecha: getVencimientoF931(7, anio, mes) },
      ],
    };
  });
}
