import { createAdminClient } from "@/lib/supabase/admin";

// Ítem 28: Contable arranca en 2025 (2023/2024 se sacaron a propósito).
const PRIMER_ANIO_CONTABLE = 2025;

// Ítem 85: años del selector de Contable, de más nuevo a más viejo. Salen de
// los balances cargados más el año en curso, así 2027 aparece solo en enero
// sin tocar código.
export async function getAniosContables(): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("balances")
    .select("anio_fiscal")
    .gte("anio_fiscal", PRIMER_ANIO_CONTABLE)
    .order("anio_fiscal", { ascending: false })
    .limit(1000);
  const anios = new Set<number>((data ?? []).map((b) => b.anio_fiscal as number));
  anios.add(new Date().getFullYear());
  return Array.from(anios).sort((a, b) => b - a);
}
