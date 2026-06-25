import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Cliente, Liquidadora, Periodo, Tarea } from "@/types";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { SeguimientoClient } from "./SeguimientoClient";

type ClienteConLiq = Cliente & { liquidadora: { id: string; nombre: string } };

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const sessionClient = await createClient();
  const supabase = createAdminClient();

  // Auth user → match liquidadora by email
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  let miLiquidadora: Liquidadora | null = null;
  if (user?.email) {
    const { data } = await supabase
      .from("liquidadoras")
      .select("*")
      .eq("email", user.email)
      .maybeSingle();
    miLiquidadora = data as Liquidadora | null;
  }

  // Admin = no matched liquidadora OR rol admin/supervisor
  const isAdmin =
    !miLiquidadora ||
    miLiquidadora.rol === "admin" ||
    miLiquidadora.rol === "supervisor";

  // Determine period from URL param or current month
  const hoy = new Date();
  const [anio, mes] = searchParams.periodo
    ? searchParams.periodo.split("-").map(Number)
    : [hoy.getFullYear(), hoy.getMonth() + 1];

  // Fetch or auto-create period
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

  // Fetch all periods for navigation
  const { data: periodos } = await supabase
    .from("periodos")
    .select("*")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false })
    .limit(24);

  // Fetch clientes (filtered by liquidadora for non-admin)
  let clientesQuery = supabase
    .from("clientes")
    .select("*, liquidadora:liquidadoras!liquidador_id(id, nombre)")
    .eq("estado", "activo")
    .order("nombre");

  if (!isAdmin && miLiquidadora) {
    clientesQuery = clientesQuery.eq("liquidador_id", miLiquidadora.id);
  }

  const { data: clientes } = await clientesQuery;

  // Fetch tareas for this period
  const { data: tareas } = periodo
    ? await supabase
        .from("tareas")
        .select("*")
        .eq("periodo_id", periodo.id)
    : { data: [] };

  // Fetch all active liquidadoras (for admin filter)
  const { data: liquidadoras } = isAdmin
    ? await supabase
        .from("liquidadoras")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre")
    : { data: [] };

  return (
    <SeguimientoClient
      clientes={(clientes as ClienteConLiq[]) ?? []}
      tareas={(tareas as Tarea[]) ?? []}
      periodos={(periodos as Periodo[]) ?? []}
      periodo={periodo as Periodo | null}
      liquidadoras={(liquidadoras as Pick<Liquidadora, "id" | "nombre">[]) ?? []}
      isAdmin={isAdmin}
      miLiquidadoraId={miLiquidadora?.id ?? null}
    />
  );
}
