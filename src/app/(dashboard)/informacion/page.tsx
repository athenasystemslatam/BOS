import { createAdminClient } from "@/lib/supabase/admin";
import { NotaSueldos } from "@/types";
import { InformacionClient } from "./InformacionClient";
import { permisos } from "@/lib/permisos";

export default async function InformacionPage() {
  const admin = createAdminClient();

  const { data: notas } = await admin
    .from("sueldos_notas")
    .select("*, autor:liquidadoras!creado_por(nombre)")
    .order("importante", { ascending: false })
    .order("creado_en", { ascending: false });

  const puedeEditar = (await permisos()).puedeEditar("sueldos");

  return (
    <InformacionClient
      notas={(notas as NotaSueldos[]) ?? []}
      puedeEditar={puedeEditar}
    />
  );
}
