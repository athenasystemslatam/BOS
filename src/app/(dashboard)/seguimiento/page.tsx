import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Cliente, Liquidadora, Periodo, Tarea } from "@/types";
import { MESES_NOMBRES, getMesTrabajoActual } from "@/lib/vencimientos";
import { SeguimientoClient } from "./SeguimientoClient";
import { fetchRecordatoriosPrevios } from "./actions";

type ClienteConLiq = Cliente & { liquidadora: { id: string; nombre: string } };

// Ruta dinámica: usa cookies para saber qué empresas mostrar.
// Las operaciones de sistema (periodos) usan admin client para evitar bloqueos RLS.
export default async function SeguimientoPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();

  const { mes, anio } = getMesTrabajoActual();

  // Fetch or create current period — admin client para evitar bloqueos RLS en INSERT
  let { data: periodo } = await admin
    .from("periodos")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  if (!periodo) {
    const { data: nuevo } = await admin
      .from("periodos")
      .upsert(
        { anio, mes, nombre_mes: `${MESES_NOMBRES[mes]} ${anio}` },
        { onConflict: "anio,mes" }
      )
      .select()
      .single();
    periodo = nuevo;
  }

  // All periods for reference
  const { data: periodos } = await admin
    .from("periodos")
    .select("*")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false })
    .limit(24);

  // Empresas: admin ve todas las activas, liquidadora solo las suyas
  let clientesQuery = supabase
    .from("clientes")
    .select("*, liquidadora:liquidadoras!liquidador_id(id, nombre)")
    .eq("estado", "activo")
    .order("nombre");
  if (!yo?.isAdmin && yo) {
    clientesQuery = clientesQuery.eq("liquidador_id", yo.id);
  }
  const { data: clientes } = await clientesQuery;

  // Tareas for current period
  const { data: tareas } = periodo
    ? await supabase.from("tareas").select("*").eq("periodo_id", periodo.id)
    : { data: [] };

  // Recordatorios del período anterior (para mostrar como alertas)
  const recordatoriosPrevios = periodo
    ? await fetchRecordatoriosPrevios(periodo.id)
    : {};

  // Liquidadoras activas — solo hace falta para el selector de admin
  const { data: liquidadoras } = yo?.isAdmin
    ? await supabase.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre")
    : { data: [] };

  return (
    <SeguimientoClient
      clientes={(clientes as ClienteConLiq[]) ?? []}
      tareas={(tareas as Tarea[]) ?? []}
      periodos={(periodos as Periodo[]) ?? []}
      periodo={periodo as Periodo | null}
      liquidadoras={(liquidadoras as Pick<Liquidadora, "id" | "nombre">[]) ?? []}
      isAdmin={yo?.isAdmin ?? false}
      recordatoriosPrevios={recordatoriosPrevios}
    />
  );
}
