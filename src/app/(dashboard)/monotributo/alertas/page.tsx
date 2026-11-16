import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { calcularAlertasMonotributo } from "@/lib/monotributoAlertas";
import { AlertasClient } from "./AlertasClient";

export default async function MonotributoAlertasPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const def = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || def.mes;
  const anio = Number(searchParams.anio) || def.anio;

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
