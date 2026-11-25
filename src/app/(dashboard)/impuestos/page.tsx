import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { resolverResponsablesVigentesTodos } from "@/lib/asignacionesServicio";
import { estaVigenteHoy } from "@/lib/estadoVigente";
import { ImpuestosClient } from "./ImpuestosClient";
import { cantidadClaves, sinSensibles } from "@/lib/clavesServer";
import type { DatosImpuestosCliente } from "@/lib/impuestos";
import { permisos } from "@/lib/permisos";

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
    vigentesPorSubtipo,
    { data: serviciosRaw },
    { data: tareas },
    { data: equipoRaw },
    { data: modulosRaw },
    { data: datosRaw },
  ] = await Promise.all([
    getCurrentLiquidadora(),
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
    // Agencia IIBB, municipios y otros servicios. Si la tabla todavía no existe
    // (falta add_impuestos_modulo_v2.sql), la pantalla sigue igual sin esos datos.
    admin.from("impuestos_clientes").select("cliente_id, agencias_iibb, seh_municipios, otros_servicios, apoyo:liquidadoras!apoyo_iva_id(nombre)"),
  ]);
  const datosPorCliente = new Map<string, DatosImpuestosCliente>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((datosRaw ?? []) as any[]).map((d) => [d.cliente_id, {
      agencias_iibb: d.agencias_iibb ?? [],
      seh_municipios: d.seh_municipios ?? null,
      apoyo_iva: d.apoyo?.nombre ?? null,
      otros_servicios: Array.isArray(d.otros_servicios) ? d.otros_servicios : [],
    }])
  );

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
    .map((sc) => {
      // Las claves no viajan al navegador: solo cuántas hay (la llave las pide al abrir).
      const cli = sc.clientes as unknown as { claves_acceso?: unknown } | null;
      const s = { ...sc, datos: datosPorCliente.get(sc.cliente_id) ?? null, clientes: cli ? { ...sinSensibles(cli), claves_modulo: cantidadClaves(cli, "impuestos") } : null };
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
      puedeEditar={(await permisos()).puedeEditar("impuestos")}
      creadoPor={yo?.id ?? null}
    />
  );
}
