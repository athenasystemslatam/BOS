// Ítem 91: única fórmula de vencimientos de Contable — la usan Seguimiento,
// Dashboard, Vencimientos y Productividad. Tres niveles, cada uno pisa al
// anterior: (1) regla general por vencimiento (base + días), con el ajuste
// en días por cliente del ítem 67; (2) prórroga por período de cierre;
// (3) fecha manual del balance, con motivo.
// Sin imports de servidor: también lo usa ContableClient (componente de
// cliente). La carga desde la base está en vencimientosContablesServer.ts.

export const TIPOS_VTO = ["balance", "ganancias", "f855", "f899", "f657"] as const;
export type TipoVto = (typeof TIPOS_VTO)[number];
export type BaseVto = "cierre" | TipoVto;

export const LABEL_VTO: Record<BaseVto, string> = {
  cierre: "Cierre",
  balance: "Balance",
  ganancias: "Ganancias",
  f855: "F.855",
  f899: "F899",
  f657: "F657",
};

export type ReglaVto = { base: BaseVto; dias: number };
export type ReglasVto = Record<TipoVto, ReglaVto>;

export const REGLAS_DEFAULT: ReglasVto = {
  balance: { base: "cierre", dias: 135 },
  ganancias: { base: "balance", dias: 0 },
  f855: { base: "balance", dias: 25 },
  f899: { base: "f855", dias: 0 },
  f657: { base: "balance", dias: 25 },
};

// Un vencimiento solo puede apoyarse en el cierre o en uno anterior en
// TIPOS_VTO — así nunca se arma un ciclo (F899 depende de F.855 y no al revés).
export function basesPermitidas(tipo: TipoVto): BaseVto[] {
  return ["cierre", ...TIPOS_VTO.slice(0, TIPOS_VTO.indexOf(tipo))];
}

export type OrigenVto = "regla" | "prorroga" | "manual";
export type Vto = { fecha: string; origen: OrigenVto; motivo: string | null };
export type VtosBalance = Record<TipoVto, Vto>;

export type Prorroga = {
  id: string;
  tipo: TipoVto;
  cierre_desde: string;
  cierre_hasta: string;
  fecha: string;
  motivo: string;
  creado_en: string;
};

export type VtoManual = { fecha: string; motivo: string };
export type ManualesBalance = Partial<Record<TipoVto, VtoManual>>;

type ConfigVto = {
  reglas_vto?: Partial<Record<TipoVto, Partial<ReglaVto>>>;
  balance_dias_vto?: number | null;
  f855_dias_vto_extra?: number | null;
};

// Regla general (objetivos_area.config) + ajuste en días del cliente
// (objetivos_excepcion_cliente.config, ítem 67). Si todavía no se guardó
// reglas_vto, se arma desde los dos números viejos (135 / 25).
export function resolverReglas(general: ConfigVto, excepcion?: ConfigVto | null): ReglasVto {
  const reglas: ReglasVto = { ...REGLAS_DEFAULT };
  if (general.reglas_vto) {
    for (const tipo of TIPOS_VTO) {
      const r = general.reglas_vto[tipo];
      if (!r) continue;
      const base = r.base && basesPermitidas(tipo).includes(r.base) ? r.base : reglas[tipo].base;
      const dias = typeof r.dias === "number" ? r.dias : reglas[tipo].dias;
      reglas[tipo] = { base, dias };
    }
  } else {
    if (typeof general.balance_dias_vto === "number") reglas.balance = { ...reglas.balance, dias: general.balance_dias_vto };
    if (typeof general.f855_dias_vto_extra === "number") {
      reglas.f855 = { ...reglas.f855, dias: general.f855_dias_vto_extra };
      reglas.f657 = { ...reglas.f657, dias: general.f855_dias_vto_extra };
    }
  }
  if (excepcion) {
    if (typeof excepcion.balance_dias_vto === "number") reglas.balance = { ...reglas.balance, dias: excepcion.balance_dias_vto };
    if (typeof excepcion.f855_dias_vto_extra === "number") {
      reglas.f855 = { ...reglas.f855, dias: excepcion.f855_dias_vto_extra };
      reglas.f657 = { ...reglas.f657, dias: excepcion.f855_dias_vto_extra };
    }
  }
  return reglas;
}

// Aritmética en UTC sobre "YYYY-MM-DD": evita que el huso horario corra un día.
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function calcularVencimientos(
  b: { fecha_cierre: string },
  reglas: ReglasVto,
  prorrogas: Prorroga[],
  manuales?: ManualesBalance,
): VtosBalance {
  const cierre = b.fecha_cierre.slice(0, 10);
  const vtos = {} as VtosBalance;
  for (const tipo of TIPOS_VTO) {
    const manual = manuales?.[tipo];
    if (manual) {
      vtos[tipo] = { fecha: manual.fecha, origen: "manual", motivo: manual.motivo };
      continue;
    }
    // Si se solapan dos prórrogas para el mismo vencimiento, gana la última cargada.
    const prorroga = prorrogas
      .filter((p) => p.tipo === tipo && p.cierre_desde <= cierre && cierre <= p.cierre_hasta)
      .sort((a, c) => c.creado_en.localeCompare(a.creado_en))[0];
    if (prorroga) {
      vtos[tipo] = { fecha: prorroga.fecha, origen: "prorroga", motivo: prorroga.motivo };
      continue;
    }
    const { base, dias } = reglas[tipo];
    const fechaBase = base === "cierre" ? cierre : vtos[base].fecha;
    vtos[tipo] = { fecha: sumarDias(fechaBase, dias), origen: "regla", motivo: null };
  }
  return vtos;
}

export function aFecha(fecha: string): Date {
  return new Date(fecha + "T00:00:00");
}

// Texto corto de la regla, para leyendas: "Balance + 25 días".
export function describirRegla(regla: ReglaVto): string {
  const base = regla.base === "cierre" ? "cierre" : `VTO ${LABEL_VTO[regla.base]}`;
  return regla.dias === 0 ? `= ${base}` : `= ${base} + ${regla.dias} días`;
}
