import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { PanelGeneralClient } from "./PanelGeneralClient";

export default async function PanelGeneralPage() {
  const supabase = createAdminClient();
  const yo = await getCurrentLiquidadora();

  const [
    { data: empresas },
    { data: equipo },
    { data: equipoModulos },
    { data: servicios },
    { data: clientesData },
  ] = await Promise.all([
    supabase.from("vista_empresas").select("*").order("nombre"),
    supabase.from("liquidadoras").select("id, nombre, activa, rol").eq("activa", true).order("nombre"),
    supabase.from("equipo_modulos").select("equipo_id, modulo"),
    supabase.from("servicios_cliente").select("cliente_id, servicio, subtipo, estado"),
    supabase.from("clientes").select("id, liquidador_id"),
  ]);

  // Map clienteId → liquidador_id
  const liqMap = new Map((clientesData ?? []).map((c) => [c.id, c.liquidador_id]));

  // Set of clienteIds que tienen sueldos activo pero sin liquidador_id en clientes
  const sueldosSinLiquidadora = (servicios ?? [])
    .filter((s) => s.servicio === "sueldos" && s.estado === true && !liqMap.get(s.cliente_id))
    .map((s) => s.cliente_id);

  // Map clienteId → array de "servicio:subtipo" activos (para mostrar botones de baja)
  const serviciosActivos: Record<string, string[]> = {};
  for (const s of servicios ?? []) {
    if (!s.estado) continue;
    if (!serviciosActivos[s.cliente_id]) serviciosActivos[s.cliente_id] = [];
    serviciosActivos[s.cliente_id].push(`${s.servicio}:${s.subtipo}`);
  }

  const equipoNormalizado = (equipo ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    activo: e.activa,
    rol: e.rol,
  }));

  return (
    <PanelGeneralClient
      empresas={empresas ?? []}
      equipo={equipoNormalizado}
      equipoModulos={equipoModulos ?? []}
      serviciosActivos={serviciosActivos}
      sueldosSinLiquidadora={sueldosSinLiquidadora}
      isAdmin={yo?.isAdmin ?? false}
    />
  );
}
