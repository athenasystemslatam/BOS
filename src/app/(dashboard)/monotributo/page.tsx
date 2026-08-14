import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
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
    admin.from("equipo").select("id, nombre").eq("activo", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "monotributo"),
  ]);

  const equipoIdsMonotributo = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoMonotributo = (equipoRaw ?? []).filter((e) => equipoIdsMonotributo.has(e.id));

  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicios = (serviciosRaw ?? []).map((s: any) => ({
    ...s,
    responsable_nombre: s.responsable_id ? (equipoMap.get(s.responsable_id) ?? null) : null,
  }));

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
      puedeEditar={!!yo}
    />
  );
}
