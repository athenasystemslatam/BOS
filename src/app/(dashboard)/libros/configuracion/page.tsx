import { redirect } from "next/navigation";
import { getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LibroEstado } from "@/types";
import { ConfiguracionClient } from "./ConfiguracionClient";

export default async function ConfiguracionLibrosPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/libros");

  const admin = createAdminClient();
  const [{ data: estadosRaw }, { data: configRaw }] = await Promise.all([
    admin.from("libros_estados").select("*").order("orden"),
    admin.from("libros_config").select("umbral_folios").maybeSingle(),
  ]);

  const umbral = (configRaw as { umbral_folios: number } | null)?.umbral_folios ?? 10;

  return (
    <ConfiguracionClient
      estados={(estadosRaw ?? []) as LibroEstado[]}
      umbralInicial={umbral}
    />
  );
}
