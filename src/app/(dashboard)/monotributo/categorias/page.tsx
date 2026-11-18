import { redirect } from "next/navigation";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyArgentina } from "@/lib/monotributo";
import { leerVersiones, versionVigente } from "@/lib/monotributoFacturacionServer";
import { CategoriasClient } from "./CategoriasClient";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || (!yo.isAdmin && !areas.includes("monotributo"))) redirect("/monotributo");
  const { versiones, disponible } = await leerVersiones(createAdminClient());
  const hoy = hoyArgentina();
  return (
    <CategoriasClient
      versiones={versiones}
      vigenteId={versionVigente(versiones, hoy)?.id ?? null}
      disponible={disponible}
      puedeEditar={!yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer"}
      esAdmin={yo.isAdmin}
    />
  );
}
