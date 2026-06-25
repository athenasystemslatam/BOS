import { createAdminClient } from "@/lib/supabase/admin";
import { Liquidadora } from "@/types";
import { LiquidadorasClient } from "./LiquidadorasClient";

export default async function LiquidadorasPage() {
  const supabase = createAdminClient();

  const { data } = await supabase.from("liquidadoras").select("*").order("nombre");

  return <LiquidadorasClient lista={(data as Liquidadora[]) ?? []} />;
}
