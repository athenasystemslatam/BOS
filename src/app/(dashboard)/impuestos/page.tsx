import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { ImpuestosClient } from "./ImpuestosClient";

export default async function ImpuestosPage({
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
      .select("cliente_id, subtipo, responsable_id, clientes(id, nombre, cuit, tipo_contribuyente)")
      .eq("servicio", "impuestos")
      .eq("estado", true),
    admin
      .from("impuestos_tareas")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes),
    admin.from("equipo").select("id, nombre").eq("activo", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "impuestos"),
  ]);

  const equipoIdsImpuestos = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoImpuestos = (equipoRaw ?? []).filter((e) => equipoIdsImpuestos.has(e.id));

  // Build responsable name map
  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  // Enrich servicios with responsable name
  const servicios = (serviciosRaw ?? []).map((s) => ({
    ...s,
    responsable_nombre: s.responsable_id ? (equipoMap.get(s.responsable_id) ?? null) : null,
  }));

  return (
    <ImpuestosClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      servicios={servicios as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tareas={(tareas as any[]) ?? []}
      equipoImpuestos={equipoImpuestos}
      mes={mes}
      anio={anio}
      isAdmin={yo?.isAdmin ?? false}
      puedeEditar={!!yo}
    />
  );
}
