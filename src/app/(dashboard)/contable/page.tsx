import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { ContableClient } from "./ContableClient";

export default async function ContablePage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const anio = Number(searchParams.anio) || new Date().getFullYear();
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [
    { data: balancesRaw },
    { data: equipoRaw },
    { data: modulosRaw },
    { data: clientesContable },
    { data: equipoTodos },
    { data: equipoModulosTodos },
  ] = await Promise.all([
    admin
      .from("balances")
      .select(
        "*, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso), " +
        "responsable:liquidadoras!balances_responsable_id_fkey(id, nombre), " +
        "responsable2:liquidadoras!balances_responsable2_id_fkey(id, nombre)"
      )
      .eq("anio_fiscal", anio)
      .order("fecha_cierre"),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "contable"),
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre, cuit)")
      .eq("servicio", "contable")
      .eq("estado", true),
    // Para el modal de edición de ficha (reutiliza EditarClienteModal de
    // Panel General), que necesita el equipo completo y sus módulos, no
    // solo el de Contable, ya que edita servicios de todos los módulos.
    admin.from("liquidadoras").select("id, nombre, activa, rol").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id, modulo"),
  ]);

  const equipoIdsContable = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoContable = (equipoRaw ?? []).filter((e) =>
    equipoIdsContable.has(e.id)
  );

  const equipo = (equipoTodos ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    activo: e.activa,
    rol: e.rol,
  }));

  // Clients with contable service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientesConServicio = (clientesContable ?? []).map((s: any) => s.clientes).filter(Boolean);

  return (
    <ContableClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      balances={(balancesRaw as any[]) ?? []}
      equipoContable={equipoContable}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientesConServicio={clientesConServicio as any[]}
      anio={anio}
      isAdmin={yo?.isAdmin ?? false}
      puedeEditar={!!yo?.isAdmin || areas.includes("contable")}
      equipo={equipo}
      equipoModulos={equipoModulosTodos ?? []}
    />
  );
}
