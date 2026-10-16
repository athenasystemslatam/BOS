import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import type { CopiadoFactura } from "@/types";
import { FacturasClient, type FacturaVista } from "./FacturasClient";

type ServicioRaw = {
  cliente_id: string;
  clientes: { id: string; nombre: string } | null;
};

type FacturaRaw = CopiadoFactura & {
  cliente: { nombre: string } | null;
  creador: { nombre: string } | null;
};

export default async function FacturasPage() {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [{ data: facturasRaw }, { data: serviciosRaw }] = await Promise.all([
    admin
      .from("copiadora_facturas")
      .select(
        "*, " +
          "cliente:clientes!copiadora_facturas_cliente_id_fkey(nombre), " +
          "creador:liquidadoras!copiadora_facturas_creado_por_fkey(nombre)"
      )
      .order("creado_en", { ascending: false }),
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre)")
      .eq("servicio", "libros")
      .eq("estado", true),
  ]);

  const clientes = (
    (serviciosRaw ?? []) as unknown as ServicioRaw[]
  )
    .filter((s) => s.clientes)
    .map((s) => ({ id: s.clientes!.id, nombre: s.clientes!.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const facturas: FacturaVista[] = ((facturasRaw ?? []) as unknown as FacturaRaw[]).map((f) => ({
    ...f,
    clienteNombre: f.cliente?.nombre ?? "—",
  }));

  return (
    <FacturasClient
      facturas={facturas}
      clientes={clientes}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
    />
  );
}
