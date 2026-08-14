import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { ContableClient } from "./ContableClient";

export default async function ContablePage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const anio = Number(searchParams.anio) || new Date().getFullYear();
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();

  const [
    { data: balancesRaw },
    { data: equipoRaw },
    { data: modulosRaw },
    { data: clientesContable },
  ] = await Promise.all([
    admin
      .from("balances")
      .select(
        "*, clientes(id, nombre, cuit, tipo_contribuyente), " +
        "responsable:equipo!balances_responsable_id_fkey(id, nombre), " +
        "responsable2:equipo!balances_responsable2_id_fkey(id, nombre)"
      )
      .eq("anio_fiscal", anio)
      .order("fecha_cierre"),
    admin.from("equipo").select("id, nombre").eq("activo", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "contable"),
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre, cuit)")
      .eq("servicio", "contable")
      .eq("estado", true),
  ]);

  const equipoIdsContable = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoContable = (equipoRaw ?? []).filter((e) =>
    equipoIdsContable.has(e.id)
  );

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
      puedeEditar={!!yo}
    />
  );
}
