import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { resolverResponsablesVigentesTodos } from "@/lib/asignacionesServicio";
import { estaVigenteHoy } from "@/lib/estadoVigente";
import { ImpuestosClient } from "./ImpuestosClient";

export default async function ImpuestosPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const inicio = Date.now();
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  // Responsable vigente por subtipo para el período mostrado (no el
  // "actual" a secas — igual que /seguimiento resuelve la liquidadora
  // vigente por período con la tabla asignaciones).
  const [
    yo,
    areas,
    vigentesPorSubtipo,
    { data: serviciosRaw },
    { data: tareas },
    { data: equipoRaw },
    { data: modulosRaw },
  ] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    resolverResponsablesVigentesTodos("impuestos", anio, mes),
    // Sin .eq("estado", true): la vigencia ahora también depende de
    // fecha_baja (baja programada a futuro sigue viéndose) — se filtra
    // después de traer, con estaVigenteHoy, a nivel servicio y cliente.
    admin
      .from("servicios_cliente")
      .select("cliente_id, subtipo, responsable_id, estado, fecha_baja, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso, estado, fecha_baja)")
      .eq("servicio", "impuestos"),
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

  // Fallback: clientes sin ninguna reasignación registrada todavía muestran
  // el responsable_id "actual" que ya traía servicios_cliente.
  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  const servicios = (serviciosRaw ?? [])
    .filter((s) => {
      if (!estaVigenteHoy(s.estado, s.fecha_baja)) return false;
      const cliente = s.clientes as unknown as { estado: string; fecha_baja: string | null } | null;
      return !cliente || estaVigenteHoy(cliente.estado === "activo", cliente.fecha_baja);
    })
    .map((s) => {
      const vigente = vigentesPorSubtipo[s.subtipo]?.get(s.cliente_id);
      if (vigente) return { ...s, responsable_id: vigente.id, responsable_nombre: vigente.nombre };
      return {
        ...s,
        responsable_nombre: s.responsable_id ? (equipoMap.get(s.responsable_id) ?? null) : null,
      };
    });

  console.info(`[tiempo] /impuestos ${Date.now() - inicio} ms`);
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
      puedeEditar={!yo?.esCobranzas && !yo?.esAdministrativo && (!!yo?.isAdmin || areas.includes("impuestos"))}
      creadoPor={yo?.id ?? null}
    />
  );
}
