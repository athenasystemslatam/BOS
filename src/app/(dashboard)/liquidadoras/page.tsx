import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Liquidadora } from "@/types";
import { LiquidadorasClient } from "./LiquidadorasClient";
import { listarBloqueados } from "./actions";

export default async function LiquidadorasPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/seguimiento");

  const supabase = createAdminClient();

  const [{ data }, bloqueados] = await Promise.all([
    supabase.from("liquidadoras").select("*").order("nombre"),
    listarBloqueados(),
  ]);

  return (
    <LiquidadorasClient
      lista={(data as Liquidadora[]) ?? []}
      bloqueados={bloqueados}
    />
  );
}
