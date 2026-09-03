import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { Liquidadora } from "@/types";
import { LiquidadorasClient } from "./LiquidadorasClient";
import { listarBloqueados } from "./actions";

export default async function EquipoPage() {
  const yo = await getCurrentLiquidadora();
  // Por ahora (solo Sueldos está en uso real) dejamos entrar a admins y a
  // cualquiera de Sueldos — las acciones exclusivas de admin (crear/editar
  // persona, transferir cartera, bloqueos) se ocultan en LiquidadorasClient,
  // y de todos modos cada Server Action de este módulo vuelve a chequear
  // requireAdmin() por su cuenta.
  if (!yo) redirect("/seguimiento");
  if (!yo.isAdmin && !(await getAreasDelUsuario()).includes("sueldos")) redirect("/seguimiento");

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
      isAdmin={yo.isAdmin}
    />
  );
}
