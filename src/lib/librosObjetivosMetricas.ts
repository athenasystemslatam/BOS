// Definiciones de los objetivos de Libros sin nada de servidor: las usan
// también componentes del navegador (Configuración, Dashboard).

export type MetricaObjetivo =
  | "mandatos_cargados"
  | "renovaciones_iniciadas"
  | "renovaciones_cerradas"
  | "datos_completos"
  | "puesta_al_dia"
  | "envios_60_dias";

export const METRICAS: { id: MetricaObjetivo; label: string; detalle: string }[] = [
  { id: "mandatos_cargados", label: "% SA y SAS con mandato cargado", detalle: "SA y SAS con Libros que tienen designación o vencimiento del mandato cargado." },
  { id: "renovaciones_iniciadas", label: "% mandatos vencidos con renovación iniciada", detalle: "Mandatos vencidos cuyo pedido de renovación está en curso o cerrado." },
  { id: "renovaciones_cerradas", label: "% mandatos vencidos con renovación cerrada", detalle: "Mandatos vencidos con la renovación de autoridades ya cerrada (mandato nuevo cargado)." },
  { id: "datos_completos", label: "% libros con dato completo", detalle: "Libros activos con último copiado y folios totales cargados." },
  { id: "puesta_al_dia", label: "% clientes con puesta al día completa", detalle: "Clientes con todos sus libros al día (sin atrasos, sin dato ni libro faltante)." },
  { id: "envios_60_dias", label: "% envíos anuales copiados dentro de 60 días", detalle: "Envíos anuales (balance legalizado) copiados completos dentro de los 60 días." },
];

export const METRICA_LABEL = Object.fromEntries(METRICAS.map((m) => [m.id, m.label])) as Record<MetricaObjetivo, string>;

/** null en `valor` = todavía no hay casos para medir (no hay denominador). */
export type ValorMetrica = { valor: number | null; cumplen: number; total: number };

export type Objetivo = {
  id: string;
  nombre: string;
  metrica: MetricaObjetivo;
  meta: number;
  fecha_limite: string | null;
  estado: "actual" | "cumplido";
  fecha_cumplimiento: string | null;
  orden: number;
};

export type ObjetivoConAvance = Objetivo & ValorMetrica & { diasRestantes: number | null };
