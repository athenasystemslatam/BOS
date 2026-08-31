import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Liquidadora } from "@/types";
import { LiquidadorasClient } from "./LiquidadorasClient";
import { listarBloqueados } from "./actions";

export default async function EquipoPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/seguimiento");

  const supabase = createAdminClient();

  const [{ data }, { data: modulosRaw }, bloqueados] = await Promise.all([
    supabase.from("liquidadoras").select("*").order("nombre"),
    supabase.from("equipo_modulos").select("equipo_id, modulo"),
    listarBloqueados(),
  ]);

  const areasPorPersona: Record<string, string[]> = {};
  for (const m of modulosRaw ?? []) {
    if (!areasPorPersona[m.equipo_id]) areasPorPersona[m.equipo_id] = [];
    areasPorPersona[m.equipo_id].push(m.modulo);
  }

  return (
    <LiquidadorasClient
      lista={(data as Liquidadora[]) ?? []}
      bloqueados={bloqueados}
      areasPorPersona={areasPorPersona}
      creadoPor={yo.id}
    />
  );
}
