import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { resolverResponsablesVigentes } from "@/lib/asignacionesServicio";
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
  const areas = await getAreasDelUsuario();

  const [
    { data: serviciosRaw },
    { data: tareas },
    { data: equipoRaw },
    { data: modulosRaw },
  ] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, subtipo, responsable_id, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso)")
      .eq("servicio", "impuestos")
      .eq("estado", true),
    admin
      .from("impuestos_tareas")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "impuestos"),
  ]);

  const equipoIdsImpuestos = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoImpuestos = (equipoRaw ?? []).filter((e) => equipoIdsImpuestos.has(e.id));

  // Responsable vigente por subtipo para el período mostrado (no el
  // "actual" a secas — igual que /seguimiento resuelve la liquidadora
  // vigente por período con la tabla asignaciones).
  const [vigentesIva, vigentesIibb, vigentesSeh] = await Promise.all([
    resolverResponsablesVigentes("impuestos", "iva", anio, mes),
    resolverResponsablesVigentes("impuestos", "iibb", anio, mes),
    resolverResponsablesVigentes("impuestos", "seh", anio, mes),
  ]);
  const vigentesPorSubtipo: Record<string, Map<string, { id: string; nombre: string }>> = {
    iva: vigentesIva,
    iibb: vigentesIibb,
    seh: vigentesSeh,
  };

  // Fallback: clientes sin ninguna reasignación registrada todavía muestran
  // el responsable_id "actual" que ya traía servicios_cliente.
  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  const servicios = (serviciosRaw ?? []).map((s) => {
    const vigente = vigentesPorSubtipo[s.subtipo]?.get(s.cliente_id);
    if (vigente) return { ...s, responsable_id: vigente.id, responsable_nombre: vigente.nombre };
    return {
      ...s,
      responsable_nombre: s.responsable_id ? (equipoMap.get(s.responsable_id) ?? null) : null,
    };
  });

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
      puedeEditar={!!yo?.isAdmin || areas.includes("impuestos")}
      creadoPor={yo?.id ?? null}
    />
  );
}
