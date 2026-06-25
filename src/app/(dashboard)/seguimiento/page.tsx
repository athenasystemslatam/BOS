import { createAdminClient } from "@/lib/supabase/admin";
import { Cliente, Liquidadora, Periodo, Tarea } from "@/types";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { SeguimientoClient } from "./SeguimientoClient";

type ClienteConLiq = Cliente & { liquidadora: { id: string; nombre: string } };

// Static route: no createClient() (cookies) and no searchParams access.
// This ensures Next.js pre-renders the HTML shell including the CSS <link> tag.
export default async function SeguimientoPage() {
  const supabase = createAdminClient();

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;

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

  // All active clients
  const { data: clientes } = await supabase
    .from("clientes")
    .select("*, liquidadora:liquidadoras!liquidador_id(id, nombre)")
    .eq("estado", "activo")
    .order("nombre");

  // Tareas for current period
  const { data: tareas } = periodo
    ? await supabase.from("tareas").select("*").eq("periodo_id", periodo.id)
    : { data: [] };

  // All active liquidadoras for admin filter
  const { data: liquidadoras } = await supabase
    .from("liquidadoras")
    .select("id, nombre")
    .eq("activa", true)
    .order("nombre");

  return (
    <SeguimientoClient
      clientes={(clientes as ClienteConLiq[]) ?? []}
      tareas={(tareas as Tarea[]) ?? []}
      periodos={(periodos as Periodo[]) ?? []}
      periodo={periodo as Periodo | null}
      liquidadoras={(liquidadoras as Pick<Liquidadora, "id" | "nombre">[]) ?? []}
    />
  );
}
