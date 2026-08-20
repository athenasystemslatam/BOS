import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { resolverResponsablesVigentes } from "@/lib/asignacionesServicio";
import { MonotributoClient } from "./MonotributoClient";

export default async function MonotributoPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [
    { data: serviciosRaw },
    { data: tareas },
    { data: equipoRaw },
    { data: modulosRaw },
  ] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, clientes(id, nombre, cuit, tipo_contribuyente)")
      .eq("servicio", "monotributo")
      .eq("estado", true),
    admin
      .from("monotributo_tareas")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "monotributo"),
  ]);

  const equipoIdsMonotributo = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoMonotributo = (equipoRaw ?? []).filter((e) => equipoIdsMonotributo.has(e.id));

  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  // Responsable vigente para el período mostrado — igual criterio que Sueldos.
  const vigentes = await resolverResponsablesVigentes("monotributo", "general", anio, mes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw ?? []).map((s: any) => {
    const vigente = vigentes.get(s.cliente_id);
    if (vigente) return { ...s, responsable_id: vigente.id, responsable_nombre: vigente.nombre };
    return {
      ...s,
      responsable_nombre: s.responsable_id ? (equipoMap.get(s.responsable_id) ?? null) : null,
    };
  });

  return (
    <MonotributoClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      servicios={servicios as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tareas={(tareas as any[]) ?? []}
      equipoMonotributo={equipoMonotributo}
      mes={mes}
      anio={anio}
      isAdmin={yo?.isAdmin ?? false}
      puedeEditar={!!yo?.isAdmin || areas.includes("monotributo")}
      creadoPor={yo?.id ?? null}
    />
  );
}
