import { createClient } from "@/lib/supabase/server";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Cliente, Liquidadora, Periodo, Tarea } from "@/types";
import { MESES_NOMBRES, getMesTrabajoActual } from "@/lib/vencimientos";
import { SeguimientoClient } from "./SeguimientoClient";

type ClienteConLiq = Cliente & { liquidadora: { id: string; nombre: string } };

// Ruta dinámica: depende de la sesión del usuario (cookies) para saber qué
// empresas le corresponde ver — admin ve todo, liquidadora ve solo lo suyo.
export default async function SeguimientoPage() {
  const supabase = await createClient();
  const yo = await getCurrentLiquidadora();

  const { mes, anio } = getMesTrabajoActual();

  // Fetch or create current period
  let { data: periodo } = await supabase
    .from("periodos")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  if (!periodo) {
    const { data: nuevo } = await supabase
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
  const { data: periodos } = await supabase
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
    />
  );
}
