import type {
  DestinoMovimiento,
  EstadoPedido,
  Libro,
  LibroTarea,
  OrigenTareaLibro,
  PrioridadLibro,
  EstadoLibro,
  OrganismoSocietario,
  PeriodicidadLibro,
  SoporteLibro,
  TipoPedido,
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
  activo: { label: "Activo", cls: "bg-green-100 text-green-700" },
  cerrado: { label: "Cerrado", cls: "bg-paper-hover text-ink-muted" },
  sin_libro: { label: "Sin libro", cls: "bg-red-100 text-red-700" },
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

export const ORIGEN_TAREA_LABEL: Record<OrigenTareaLibro, string> = {
  puesta_al_dia: "Puesta al día",
  balance: "Envío anual",
  pedido: "Pedido",
  asamblea: "Asamblea",
  manual: "Manual",
};

export const PRIORIDADES: PrioridadLibro[] = ["P1", "P2", "P3"];

export const PRIORIDAD_INFO: Record<PrioridadLibro, { label: string; cls: string; borde: string }> = {
  P1: { label: "P1 · Urgente", cls: "bg-bordo-tint2 text-bordo", borde: "border-bordo-border" },
  P2: { label: "P2 · En curso", cls: "bg-yellow-100 text-yellow-800", borde: "border-line-panel" },
  P3: { label: "P3 · Sin material", cls: "bg-paper-hover text-ink-muted border border-line-rule", borde: "border-line-panel" },
};

// P1: fecha límite de un tercero, pedido con fecha o balance legalizado con
// el acta por hacer. El mandato vencido y los folios bajos no suben la tarea:
// generan su pedido (ver librosAutomaticos.ts).
// P2: envío anual en curso o puesta al día con material listo. P3: el resto.
export function prioridadSugerida(
  tarea: Pick<LibroTarea, "origen" | "fecha_limite" | "material_listo">,
  contexto: { pedidoConFecha: boolean; balanceEstado: string | null }
): { prioridad: PrioridadLibro; motivo: string } {
  if (tarea.fecha_limite) return { prioridad: "P1", motivo: "Fecha límite de un tercero" };
  if (contexto.pedidoConFecha) return { prioridad: "P1", motivo: "Pedido con fecha límite" };
  if (tarea.origen === "balance" && contexto.balanceEstado === "legalizado") {
    return { prioridad: "P1", motivo: "Balance legalizado: acta por hacer" };
  }
  if (tarea.origen === "balance") return { prioridad: "P2", motivo: "Envío anual en curso" };
  if (tarea.material_listo) return { prioridad: "P2", motivo: "Material listo" };
  if (tarea.origen === "pedido" || tarea.origen === "asamblea") return { prioridad: "P2", motivo: "Pedido sin fecha" };
  return { prioridad: "P3", motivo: "Falta material o información" };
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function hoyISO(): string {
  return iso(new Date());
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return iso(d);
}

function cierreDelAnio(anio: number, mes: number, dia: number): string {
  const ultimo = new Date(anio, mes, 0).getDate();
  return iso(new Date(anio, mes - 1, Math.min(dia, ultimo)));
}

// Mismo plazo que usa Contable para el vencimiento del balance.
export const DIAS_VTO_BALANCE = 135;
// Margen para copiar las actas de un trimestre ya cerrado.
export const DIAS_MARGEN_TRIMESTRE = 30;

/** Hasta qué fecha tiene que estar copiado el libro hoy. null = no se calcula (por evento). */
export function periodoExigible(
  periodicidad: PeriodicidadLibro,
  cierre: { mes: number | null; dia: number | null },
  hoy: string = hoyISO()
): string | null {
  if (periodicidad === "evento") return null;
  const anioHoy = Number(hoy.slice(0, 4));
  if (periodicidad === "balance") {
    const mes = cierre.mes ?? 12;
    const dia = cierre.dia ?? 31;
    for (let anio = anioHoy; anio >= anioHoy - 2; anio--) {
      const c = cierreDelAnio(anio, mes, dia);
      if (sumarDias(c, DIAS_VTO_BALANCE) <= hoy) return c;
    }
    return null;
  }
  for (let anio = anioHoy; anio >= anioHoy - 1; anio--) {
    for (const mes of [12, 9, 6, 3]) {
      const fin = cierreDelAnio(anio, mes, 31);
      if (sumarDias(fin, DIAS_MARGEN_TRIMESTRE) <= hoy) return fin;
    }
  }
  return null;
}

// Se compara por mes: la importación guardó los períodos mensuales como el
// día 1 (ej. 2025-06-01 = "copiado hasta junio 2025").
export function mesIndice(fecha: string): number {
  return Number(fecha.slice(0, 4)) * 12 + Number(fecha.slice(5, 7));
}

/** true/false si el libro está al día; null si no se calcula (por evento). */
export function libroAlDia(
  libro: Pick<Libro, "estado" | "ultimo_periodo_copiado">,
  ultimoCopiado: string | null,
  periodicidad: PeriodicidadLibro,
  cierre: { mes: number | null; dia: number | null },
  hoy: string = hoyISO()
): { alDia: boolean | null; exigible: string | null } {
  const exigible = periodoExigible(periodicidad, cierre, hoy);
  if (periodicidad === "evento") return { alDia: null, exigible: null };
  if (libro.estado === "sin_libro") return { alDia: false, exigible };
  if (!exigible) return { alDia: true, exigible };
  const ultimo = ultimoCopiado ?? libro.ultimo_periodo_copiado;
  return { alDia: !!ultimo && mesIndice(ultimo) >= mesIndice(exigible), exigible };
}

export type EstadoAtraso = "al_dia" | "atrasado" | "sin_dato" | "sin_libro" | "no_aplica";

/**
 * Cuántos períodos le faltan copiar al libro hasta lo exigible hoy: ejercicios
 * si es anual (ej. IVA copiado hasta 2019 con el cierre 2025 exigible = 6),
 * trimestres si es trimestral. "Sin dato" = sin último copiado cargado (hay
 * que relevar); "sin libro" = falta el libro (presupuesto); por evento no aplica.
 */
export function atrasoLibro(
  libro: Pick<Libro, "estado" | "ultimo_periodo_copiado">,
  ultimoCopiado: string | null,
  periodicidad: PeriodicidadLibro,
  cierre: { mes: number | null; dia: number | null },
  hoy: string = hoyISO()
): { estado: EstadoAtraso; periodos: number; exigible: string | null } {
  if (periodicidad === "evento") return { estado: "no_aplica", periodos: 0, exigible: null };
  const exigible = periodoExigible(periodicidad, cierre, hoy);
  if (libro.estado === "sin_libro") return { estado: "sin_libro", periodos: 0, exigible };
  if (!exigible) return { estado: "al_dia", periodos: 0, exigible };
  const ultimo = ultimoCopiado ?? libro.ultimo_periodo_copiado;
  if (!ultimo) return { estado: "sin_dato", periodos: 0, exigible };
  const meses = mesIndice(exigible) - mesIndice(ultimo);
  if (meses <= 0) return { estado: "al_dia", periodos: 0, exigible };
  return { estado: "atrasado", periodos: Math.ceil(meses / (periodicidad === "trimestral" ? 3 : 12)), exigible };
}

export function textoPeriodos(n: number, periodicidad: PeriodicidadLibro): string {
  if (periodicidad === "trimestral") return n === 1 ? "1 trimestre" : `${n} trimestres`;
  return n === 1 ? "1 ejercicio" : `${n} ejercicios`;
}

// Días antes del vencimiento del mandato en que se avisa. El mayor crea el
// pedido de renovación. Configurable en libros_config.mandato_avisos.
export const AVISOS_MANDATO = [90, 60, 30];

export const CHECKLIST_RENOVACION = [
  "Acta de directorio que convoca",
  "Convocatoria a asamblea",
  "Asamblea de designación",
  "Acta de distribución de cargos (aceptación al pie)",
  "Inscripción ante el organismo",
];

export function mandatoVencido(designacion: string | null, anios: number | null, hoy: string = hoyISO()): boolean {
  const vence = vencimientoMandato(designacion, anios);
  return !!vence && vence < hoy;
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

export const TIPOS_PEDIDO: { value: TipoPedido; label: string }[] = [
  { value: "presupuesto_libro_nuevo", label: "Presupuesto — Libro nuevo" },
  { value: "presupuesto_tomo_nuevo",  label: "Presupuesto — Tomo nuevo"  },
  { value: "tramite",                 label: "Trámite"                   },
  { value: "pedido_cliente",          label: "Pedido del cliente"        },
  { value: "asamblea",                label: "Asamblea"                  },
  { value: "cambio_societario",       label: "Cambio societario"         },
  { value: "renovacion_autoridades",  label: "Renovación de autoridades" },
];

export const TIPO_PEDIDO_LABEL = Object.fromEntries(
  TIPOS_PEDIDO.map((t) => [t.value, t.label])
) as Record<TipoPedido, string>;

export const ESTADO_PEDIDO_INFO: Record<EstadoPedido, { label: string; cls: string }> = {
  abierto:           { label: "Abierto",              cls: "bg-paper-hover text-ink-muted border border-line-rule" },
  esperando_cliente: { label: "Esperando al cliente", cls: "bg-orange-100 text-orange-700" },
  esperando_tercero: { label: "Esperando tercero",    cls: "bg-orange-100 text-orange-700" },
  aprobado:          { label: "Aprobado",             cls: "bg-green-100 text-green-700"   },
  rechazado:         { label: "Rechazado",            cls: "bg-paper-hover text-ink-muted border border-line-rule" },
  cerrado:           { label: "Cerrado",              cls: "bg-green-600 text-white"       },
};

export type SemaforoPedido = "vencido" | "hoy" | "al_dia" | "sin_fecha";

export function semaforoSeguimiento(proximo: string | null, hoy: string = hoyISO()): SemaforoPedido {
  if (!proximo) return "sin_fecha";
  if (proximo < hoy) return "vencido";
  if (proximo === hoy) return "hoy";
  return "al_dia";
}

export const SEMAFORO_SEGUIMIENTO_INFO: Record<SemaforoPedido, { label: string; cls: string; dot: string }> = {
  vencido:   { label: "Vencido",   cls: "bg-red-100 text-red-700",       dot: "bg-red-500"    },
  hoy:       { label: "Vence hoy", cls: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  al_dia:    { label: "Al día",    cls: "bg-green-100 text-green-700",   dot: "bg-green-500"  },
  sin_fecha: { label: "—",         cls: "text-ink-ghost",                dot: "bg-dot"        },
};

// ── Movimientos ──────────────────────────────────────────────────────────────

export const DESTINO_LABEL: Record<DestinoMovimiento, string> = {
  copiadora: "Copiadora",
  cliente:   "Cliente",
  estudio:   "Estudio",
  otro:      "Otro",
};
