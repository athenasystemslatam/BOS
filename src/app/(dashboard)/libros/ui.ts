// Kit de marca BOS aplicado a Libros (canvas "BOS · Módulo Libros", fila v2):
// fondo papel y tokens del rediseño del Panel General, bordo para la acción
// principal (una por bloque), violeta solo como raya de módulo y, para los
// estados, el mismo semáforo de Contable (contable/semaforo.ts). Rojo solo
// para atrasos, vencimientos y errores.
import type { EstadoPedido, PrioridadLibro } from "@/types";

// ── Pantalla ─────────────────────────────────────────────────────────────────
export const PAGINA = "flex flex-col h-full bg-appbg text-ink";
export const ENCABEZADO = "shrink-0 px-4 sm:px-6 pt-5 pb-3 flex flex-wrap items-center gap-3";
export const RAYA_MODULO = "w-1 h-6 rounded bg-violet-600 shrink-0";
export const TITULO = "font-archivo text-[22px] font-extrabold tracking-tight text-ink";
export const SUBTITULO = "text-[12px] text-ink-subtle";

// ── Superficies ──────────────────────────────────────────────────────────────
export const PANEL = "bg-paper border border-line-panel rounded-xl";
export const PANEL_CABECERA = "bg-paper-group border-b border-line-group";
export const FILA = "border-t border-line-row hover:bg-paper-hover";

// ── Tablas ───────────────────────────────────────────────────────────────────
export const TH = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em] px-3 py-2";
/** Cifras, fechas, CUIT y folios: Plex Mono, mismo ancho de dígito, a la derecha. */
export const NUM = "font-plex text-[12px] tabular-nums text-right text-ink-cell";
export const MONO = "font-plex tabular-nums";

// ── Botones ──────────────────────────────────────────────────────────────────
export const BOTON_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 text-[13px] font-semibold text-white bg-bordo hover:bg-bordo-dark rounded-[9px] disabled:opacity-50";
export const BOTON_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 text-[13px] font-semibold text-ink bg-paper border border-line-input hover:bg-paper-hover rounded-[9px] disabled:opacity-50";
export const BOTON_TEXTO =
  "inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-muted hover:text-ink disabled:opacity-40";

// ── Controles ────────────────────────────────────────────────────────────────
export const CONTROL =
  "text-[13px] text-ink bg-paper border border-line-input rounded-[9px] px-2.5 min-h-[36px] focus:outline-none focus:border-bordo";
export const CONTROL_CELDA =
  "text-[12px] text-ink-cell bg-transparent border border-transparent hover:border-line-input rounded-md px-1.5 py-1 focus:outline-none focus:border-bordo cursor-pointer disabled:cursor-default disabled:hover:border-transparent";

// ── Avisos ───────────────────────────────────────────────────────────────────
export const AVISO = "flex gap-2 text-[12.5px] text-alerta-fg bg-alerta-bg border border-[#F1DFC2] rounded-[10px] px-3 py-2";
export const AVISO_URGENTE = "flex gap-2 text-[12.5px] text-red-800 bg-red-50 border border-red-100 rounded-[10px] px-3 py-2";
export const ERROR = "text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2";

// ── Semáforo (mismos colores que Contable) ───────────────────────────────────
export const CHIP = "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold";
export const SEMAFORO = {
  rojo: "bg-red-100 text-red-700",
  naranja: "bg-orange-100 text-orange-700",
  amarillo: "bg-yellow-100 text-yellow-800",
  verdeClaro: "bg-green-100 text-green-700",
  verde: "bg-green-600 text-white",
  sinDato: "bg-paper-hover text-ink-muted border border-line-rule",
} as const;

/** Estado de una tarea por su código (los estados nuevos, sin código, van en gris). */
export function claseEstadoTarea(codigo: string | null | undefined): string {
  switch (codigo) {
    case "en_proceso":
      return SEMAFORO.amarillo;
    case "en_espera":
      return SEMAFORO.naranja;
    case "para_copiar":
    case "copiandose":
      return SEMAFORO.verdeClaro;
    case "copiado":
      return SEMAFORO.verde;
    default:
      return SEMAFORO.sinDato;
  }
}

export const CLASE_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  abierto: SEMAFORO.sinDato,
  esperando_cliente: SEMAFORO.naranja,
  esperando_tercero: SEMAFORO.naranja,
  aprobado: SEMAFORO.verdeClaro,
  rechazado: SEMAFORO.sinDato,
  cerrado: SEMAFORO.verde,
};

// P1 no es un error: va en bordo (marca), no en rojo.
export const CLASE_PRIORIDAD: Record<PrioridadLibro, string> = {
  P1: "bg-bordo-tint2 text-bordo",
  P2: SEMAFORO.amarillo,
  P3: SEMAFORO.sinDato,
};
export const BORDE_PRIORIDAD: Record<PrioridadLibro, string> = {
  P1: "border-bordo-border",
  P2: "border-line-panel",
  P3: "border-line-panel",
};

// ── Estado vacío ─────────────────────────────────────────────────────────────
export const VACIO = "flex flex-col items-center gap-3 text-center py-14 px-4";
export const VACIO_TEXTO = "text-[13px] text-ink-muted max-w-md";
