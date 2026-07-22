import { createClient } from "@/lib/supabase/server";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Cliente, Liquidadora } from "@/types";
import { EmpresasClient } from "./EmpresasClient";

export default async function EmpresasPage() {
  const supabase = await createClient();
  const yo = await getCurrentLiquidadora();

  const [{ data: liquidadoras }, { data: clientes }] = await Promise.all([
    supabase.from("liquidadoras").select("*").eq("activa", true).order("nombre"),
    supabase
      .from("clientes")
      .select("*, liquidadora:liquidadoras!liquidador_id(*)")
      .order("nombre"),
  ]);

  return (
    <EmpresasClient
      clientes={(clientes as (Cliente & { liquidadora: Liquidadora })[]) ?? []}
      liquidadoras={(liquidadoras as Liquidadora[]) ?? []}
      isAdmin={yo?.isAdmin ?? false}
      creadoPor={yo?.id ?? null}
    />
  );
}
