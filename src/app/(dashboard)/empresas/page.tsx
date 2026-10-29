import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Cliente, Liquidadora } from "@/types";
import { EmpresasClient } from "./EmpresasClient";

/** Todas las filas de una consulta, de a 1000: PostgREST corta en 1000 por
 * defecto y las tareas con rúbrica LSD (de todos los meses) crecen cada mes. */
async function traerTodas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await pagina(desde, desde + 999);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

type PeriodoAnioMes = { anio: number; mes: number };

export default async function EmpresasPage() {
  const supabase = createAdminClient();

  // El año/mes del período viene en la misma consulta (antes era otra
  // consulta a periodos después de esta).
  const [yo, { data: liquidadorasTodas }, { data: equipoModulos }, { data: serviciosSueldos }, rubricaTareas] = await Promise.all([
    getCurrentLiquidadora(),
    supabase.from("liquidadoras").select("*").eq("activa", true).order("nombre"),
    supabase.from("equipo_modulos").select("equipo_id").eq("modulo", "sueldos"),
    supabase.from("servicios_cliente").select("cliente_id").eq("servicio", "sueldos").eq("estado", true),
    traerTodas<{ cliente_id: string; periodos: PeriodoAnioMes | PeriodoAnioMes[] | null }>((desde, hasta) =>
      supabase
        .from("tareas")
        .select("cliente_id, periodos!inner(anio, mes)")
        .or("rub_lsd_manual.eq.true,rub_lsd_drive.eq.true")
        .order("id")
        .range(desde, hasta)
    ),
  ]);

  // Solo gente del módulo Sueldos puede figurar como liquidadora acá — antes
  // se listaba cualquier liquidadora activa (incluidas las de Contable,
  // Impuestos, etc.) tanto en el filtro como al crear/editar/reasignar,
  // igual que ya se resolvió en Panel General con equipo_modulos.
  const idsEquipoSueldos = new Set((equipoModulos ?? []).map((m) => m.equipo_id));
  const liquidadoras = (liquidadorasTodas ?? []).filter((l) => idsEquipoSueldos.has(l.id));

  // Módulo Sueldos: solo clientes con el servicio "sueldos" activo (no toda la
  // base de /panel-general — un cliente que solo tiene Impuestos no es de acá).
  const idsSueldos = (serviciosSueldos ?? []).map((s) => s.cliente_id);
  const { data: clientes } = idsSueldos.length > 0
    ? await supabase
        .from("clientes")
        .select("*, liquidadora:liquidadoras!liquidador_id(*)")
        .in("id", idsSueldos)
        .order("nombre")
    : { data: [] };

  const lsdHasta: Record<string, { anio: number; mes: number }> = {};
  for (const t of rubricaTareas) {
    const p = Array.isArray(t.periodos) ? t.periodos[0] : t.periodos;
    if (!p) continue;
    const ex = lsdHasta[t.cliente_id];
    if (!ex || p.anio * 100 + p.mes > ex.anio * 100 + ex.mes) {
      lsdHasta[t.cliente_id] = { anio: p.anio, mes: p.mes };
    }
  }

  return (
    <EmpresasClient
      clientes={(clientes as (Cliente & { liquidadora: Liquidadora })[]) ?? []}
      liquidadoras={(liquidadoras as Liquidadora[]) ?? []}
      isAdmin={yo?.isAdmin ?? false}
      creadoPor={yo?.id ?? null}
      lsdHasta={lsdHasta}
      puedeEditar={!yo?.esCobranzas}
      // Cualquier liquidador del área Sueldos (ya filtrada arriba) puede dar
      // de alta un cliente nuevo, no solo un admin — mismo criterio que ya
      // regía para editar (puedeEditar).
      puedeCrear={!yo?.esCobranzas}
    />
  );
}
