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

  // Empresas: solo clientes con el servicio "sueldos" activo (no toda la base
  // de /panel-general). Admin ve todas, liquidadora solo las suyas.
  const { data: serviciosSueldos } = await admin
    .from("servicios_cliente")
    .select("cliente_id")
    .eq("servicio", "sueldos")
    .eq("estado", true);
  const idsSueldos = (serviciosSueldos ?? []).map((s) => s.cliente_id);

  let clientes: (Cliente & { liquidadora: { id: string; nombre: string } })[] = [];
  if (idsSueldos.length > 0) {
    let clientesQuery = admin
      .from("clientes")
      .select("*, liquidadora:liquidadoras!liquidador_id(id, nombre)")
      .eq("estado", "activo")
      .in("id", idsSueldos)
      .order("terminacion_cuit");
    if (!yo?.isAdmin && yo) {
      clientesQuery = clientesQuery.eq("liquidador_id", yo.id);
    }
    const { data } = await clientesQuery;
    clientes = (data as (Cliente & { liquidadora: { id: string; nombre: string } })[]) ?? [];
  }

  // Tareas for current period
  const { data: tareas } = periodo
    ? await admin.from("tareas").select("*").eq("periodo_id", periodo.id)
    : { data: [] };

  // Recordatorios del período anterior (para mostrar como alertas)
  const recordatoriosPrevios = periodo
    ? await fetchRecordatoriosPrevios(periodo.id)
    : {};

  // Resolver liquidadora por período usando tabla asignaciones
  if (clientes && clientes.length > 0) {
    // Ojo: acá se usa la fecha calendario real, no el "mes de trabajo"
    // (anio/mes de arriba, que durante los primeros días del mes todavía
    // apunta al período anterior por la ventana de 2 días post-F.931). Un
    // traspaso hecho hoy tiene que pesar ya para saber quién es responsable
    // ahora — es el mismo criterio de vigencia que usa insertarAsignacion
    // al sincronizar clientes.liquidador_id, así los dos quedan de acuerdo.
    const hoyReal = new Date();
    const anioReal = hoyReal.getFullYear();
    const mesReal = hoyReal.getMonth() + 1;

    const { data: asignaciones } = await admin
      .from("asignaciones")
      .select("cliente_id, liquidador_id, desde_anio, desde_mes, creado_en, liquidadora:liquidadoras!liquidador_id(id, nombre)")
      .lte("desde_anio", anioReal);

    if (asignaciones && asignaciones.length > 0) {
      const porCliente = new Map<string, typeof asignaciones[0]>();
      for (const a of asignaciones) {
        if (a.desde_anio * 100 + a.desde_mes > anioReal * 100 + mesReal) continue;
        const prev = porCliente.get(a.cliente_id);
        // Desempate por creado_en cuando dos asignaciones caen en el mismo
        // desde_anio/desde_mes — sin esto, entre dos igual de "vigentes" se
        // podía quedar con la vieja en vez de la corrección más reciente
        // (pasó con el traspaso de Diego a Claudia A.: misma fecha, y acá se
        // seguía mostrando a Diego).
        if (
          !prev ||
          a.desde_anio * 100 + a.desde_mes > prev.desde_anio * 100 + prev.desde_mes ||
          (a.desde_anio * 100 + a.desde_mes === prev.desde_anio * 100 + prev.desde_mes &&
            a.creado_en > prev.creado_en)
        ) {
          porCliente.set(a.cliente_id, a);
        }
      }
      for (const c of clientes) {
        const asig = porCliente.get(c.id);
        if (asig) {
          c.liquidador_id = asig.liquidador_id;
          (c as unknown as Record<string, unknown>).liquidadora = asig.liquidadora;
        }
      }
    }
  }

  // Liquidadoras activas con al menos 1 cliente asignado (para el selector de admin)
  const clienteLiqIds = new Set((clientes ?? []).map((c) => c.liquidador_id).filter(Boolean));
  const { data: liquidadorasRaw } = yo?.isAdmin
    ? await admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre")
    : { data: [] };
  const liquidadoras = (liquidadorasRaw ?? []).filter((l) => clienteLiqIds.has(l.id));

  return (
    <SeguimientoClient
      clientes={(clientes as ClienteConLiq[]) ?? []}
      tareas={(tareas as Tarea[]) ?? []}
      periodos={(periodos as Periodo[]) ?? []}
      periodo={periodo as Periodo | null}
      liquidadoras={(liquidadoras as Pick<Liquidadora, "id" | "nombre">[]) ?? []}
      isAdmin={yo?.isAdmin ?? false}
      puedeEditar={!!yo}
      recordatoriosPrevios={recordatoriosPrevios}
    />
  );
}
