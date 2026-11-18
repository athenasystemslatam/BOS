import { redirect } from "next/navigation";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyArgentina } from "@/lib/monotributo";
import { leerControles, leerUmbral } from "@/lib/monotributoFacturacionServer";
import { ControlesClient } from "./ControlesClient";

export const dynamic = "force-dynamic";

export default async function ControlesPage({ searchParams }: { searchParams: { anio?: string } }) {
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || (!yo.isAdmin && !areas.includes("monotributo"))) redirect("/monotributo");
  const anioHoy = Number(hoyArgentina().slice(0, 4));
  const anio = Number(searchParams.anio) || anioHoy;
  const admin = createAdminClient();
  const puedeEditar = !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer";
  const [{ controles, disponible }, umbral] = await Promise.all([
    // El año en curso y el siguiente se crean con los controles por defecto si todavía no existen.
    leerControles(admin, [anio], puedeEditar && anio >= anioHoy && anio <= anioHoy + 1 ? [anio] : []),
    leerUmbral(admin),
  ]);
  return (
    <ControlesClient
      key={anio}
      anio={anio}
      anioHoy={anioHoy}
      controles={controles}
      umbral={umbral}
      disponible={disponible}
      puedeEditar={puedeEditar}
    />
  );
}
