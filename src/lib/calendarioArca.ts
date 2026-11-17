// Lectura del calendario ARCA desde la base (tabla calendario_arca). Si la tabla
// todavía no existe o el año no está cargado, se usan los valores por defecto
// de calendarioArcaUtil (día 20 corrido a hábil), así nada se rompe.

import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarioArca, MesCalendario } from "@/lib/calendarioArcaUtil";

export * from "@/lib/calendarioArcaUtil";

type Fila = {
  anio: number;
  mes: number;
  fecha_vencimiento_cuota: string;
  fecha_limite_recategorizacion: string | null;
  recategoriza_desde: string | null;
  nota: string | null;
};

export async function leerCalendario(anios: number[]): Promise<CalendarioArca> {
  const cal: CalendarioArca = new Map();
  const lista = Array.from(new Set(anios));
  if (!lista.length) return cal;
  const { data, error } = await createAdminClient()
    .from("calendario_arca")
    .select("anio, mes, fecha_vencimiento_cuota, fecha_limite_recategorizacion, recategoriza_desde, nota")
    .in("anio", lista);
  if (error) return cal;
  for (const f of (data ?? []) as Fila[]) {
    const m: MesCalendario = {
      anio: f.anio,
      mes: f.mes,
      vencimiento: f.fecha_vencimiento_cuota,
      recatLimite: f.fecha_limite_recategorizacion,
      recatDesde: f.recategoriza_desde,
      nota: f.nota,
      cargado: true,
    };
    cal.set(`${f.anio}-${f.mes}`, m);
  }
  return cal;
}
