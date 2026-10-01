import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { NotaSueldos } from "@/types";
import { InformacionClient } from "./InformacionClient";

export default async function InformacionPage() {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = yo && !yo.isAdmin ? await getAreasDelUsuario() : [];

  const { data: notas } = await admin
    .from("sueldos_notas")
    .select("*, autor:liquidadoras!creado_por(nombre)")
    .order("importante", { ascending: false })
    .order("creado_en", { ascending: false });

  const puedeEditar = !yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("sueldos"));

  return (
    <InformacionClient
      notas={(notas as NotaSueldos[]) ?? []}
      puedeEditar={puedeEditar}
    />
  );
}
