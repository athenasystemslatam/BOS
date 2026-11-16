import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { resolverResponsablesVigentes } from "@/lib/asignacionesServicio";
import { puedeSerResponsable, type Gravedad } from "@/lib/monotributo";
import { sincronizarRevisionesModulo, traerPaginado } from "@/lib/monotributoServer";
import { calcularAlertasMonotributo } from "@/lib/monotributoAlertas";
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
  try {
    await sincronizarRevisionesModulo(admin);
  } catch {
    // Si falla, se muestra igual lo que ya está marcado.
  }
  const [
    yo,
    areas,
    // Responsable vigente para el período mostrado — igual criterio que Sueldos.
    vigentes,
    { data: serviciosRaw },
    { data: tareas },
    { data: equipoRaw },
    { data: modulosRaw },
    pendientes,
    alertasMes,
  ] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    resolverResponsablesVigentes("monotributo", "general", anio, mes),
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso)")
      .eq("servicio", "monotributo")
      .eq("estado", true),
    admin
      .from("monotributo_tareas")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes),
    admin.from("liquidadoras").select("id, nombre, rol").eq("activa", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "monotributo"),
    traerPaginado<{ cliente_id: string; gravedad: Gravedad; anio: number | null; mes: number | null }>((d, h) =>
      admin.from("monotributo_revisiones").select("cliente_id, gravedad, anio, mes")
        .eq("estado", "pendiente").order("id").range(d, h)
    ),
    calcularAlertasMonotributo(anio, mes).catch(() => null),
  ]);

  // Marcas que se ven en este mes: las del cliente y las de este mes puntual.
  const revisiones: Record<string, { rojo: number; amarillo: number }> = {};
  for (const p of pendientes) {
    if (p.anio !== null && (p.anio !== anio || p.mes !== mes)) continue;
    const r = (revisiones[p.cliente_id] ??= { rojo: 0, amarillo: 0 });
    r[p.gravedad]++;
  }

  const equipoIdsMonotributo = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoMonotributo = (equipoRaw ?? [])
    .filter((e) => equipoIdsMonotributo.has(e.id) && puedeSerResponsable(e.rol))
    .map(({ id, nombre }) => ({ id, nombre }));

  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

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
      puedeEditar={!!yo && !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" && (yo.isAdmin || areas.includes("monotributo"))}
      creadoPor={yo?.id ?? null}
      revisiones={revisiones}
      totalARevisar={pendientes.length}
      totalAlertas={alertasMes?.alertas.length ?? null}
    />
  );
}
