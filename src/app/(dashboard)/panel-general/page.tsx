import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { PanelGeneralClient } from "./PanelGeneralClient";

export default async function PanelGeneralPage() {
  const inicio = Date.now();
  const supabase = createAdminClient();
  const [
    yo,
    { data: empresas },
    { data: equipo },
    { data: equipoModulos },
    { data: servicios },
  ] = await Promise.all([
    getCurrentLiquidadora(),
    supabase.from("vista_empresas").select("*").order("nombre"),
    supabase.from("liquidadoras").select("id, nombre, activa, rol").eq("activa", true).order("nombre"),
    supabase.from("equipo_modulos").select("equipo_id, modulo"),
    supabase.from("servicios_cliente").select("cliente_id, servicio, subtipo, estado, responsable_id"),
  ]);

  // Clientes con Sueldos activo pero sin responsable cargado en
  // servicios_cliente — misma fuente que ya usa vista_empresas.responsable_sueldos
  // y el texto "Sin responsable" de cada celda. Antes esto se calculaba aparte
  // contra clientes.liquidador_id, una columna redundante (mismo dato, otra
  // tabla) que podía desincronizarse de la real sin que nadie se enterara.
  const sueldosSinLiquidadora = (servicios ?? [])
    .filter((s) => s.servicio === "sueldos" && s.subtipo === "general" && s.estado === true && !s.responsable_id)
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

  // Liquidadores (área Sueldos) también pueden dar de alta clientes, además
  // de admin/administrativo — no así editar/dar de baja cualquier cliente,
  // que sigue siendo exclusivo de esos dos roles (ver isAdmin).
  const esDeSueldos = !!yo && (equipoModulos ?? []).some((m) => m.equipo_id === yo.id && m.modulo === "sueldos");

  console.info(`[tiempo] /panel-general ${Date.now() - inicio} ms`);
  return (
    <PanelGeneralClient
      empresas={empresas ?? []}
      equipo={equipoNormalizado}
      equipoModulos={equipoModulos ?? []}
      serviciosActivos={serviciosActivos}
      sueldosSinLiquidadora={sueldosSinLiquidadora}
      // Ítem 119: administrativo edita Panel General igual que un admin.
      isAdmin={!!yo?.isAdmin || !!yo?.esAdministrativo}
      puedeCrearCliente={!!yo?.isAdmin || !!yo?.esAdministrativo || esDeSueldos}
      miNombre={yo?.nombre ?? null}
    />
  );
}
