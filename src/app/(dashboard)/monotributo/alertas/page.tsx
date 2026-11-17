import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { calcularAlertasMonotributo } from "@/lib/monotributoAlertas";
import { AlertasClient } from "./AlertasClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { arrastrarMes } from "@/lib/monotributoServer";
import { enVentanaRecategorizacion, leerCalendario } from "@/lib/calendarioArca";

export default async function MonotributoAlertasPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const def = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || def.mes;
  const anio = Number(searchParams.anio) || def.anio;

  try {
    const calendario = await leerCalendario([anio]);
    await arrastrarMes(createAdminClient(), anio, mes, enVentanaRecategorizacion(calendario, anio, mes));
  } catch {
    // Si falla, el mes se muestra sin lo arrastrado.
  }
  const [yo, areas, datos] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    calcularAlertasMonotributo(anio, mes),
  ]);

  const puedeEditar =
    !!yo && !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" && (yo.isAdmin || areas.includes("monotributo"));
  const esResponsable = !!yo && datos.alertas.some((a) => a.responsable_id === yo.id);

  return (
    <AlertasClient
      {...datos}
      mes={mes}
      anio={anio}
      mesDefault={def.mes}
      anioDefault={def.anio}
      yoId={yo?.id ?? null}
      filtroInicialMios={esResponsable && !yo?.isAdmin}
      puedeEditar={puedeEditar}
    />
  );
}
