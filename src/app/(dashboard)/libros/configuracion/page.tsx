import { redirect } from "next/navigation";
import { getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { configLibros } from "@/lib/librosAutomaticos";
import type { LibroEstado } from "@/types";
import { ConfiguracionClient } from "./ConfiguracionClient";

export default async function ConfiguracionLibrosPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/libros");

  const admin = createAdminClient();
  const [{ data: estadosRaw }, config] = await Promise.all([
    admin.from("libros_estados").select("*").order("orden"),
    configLibros(admin),
  ]);

  return (
    <ConfiguracionClient
      estados={(estadosRaw ?? []) as LibroEstado[]}
      umbralInicial={config.umbralFolios}
      avisosMandato={config.avisosMandato}
    />
  );
}
