import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { calcularAlertasMonotributo } from "@/lib/monotributoAlertas";
import { AlertasClient } from "./AlertasClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { arrastrarMes } from "@/lib/monotributoServer";
import { enVentanaRecategorizacion, leerCalendario } from "@/lib/calendarioArca";

// Siempre datos frescos: un cambio (estado, deuda, etc.) se ve al instante, sin caché del servidor.
export const dynamic = "force-dynamic";

export default async function MonotributoAlertasPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const inicio = Date.now();
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

  // Tiempo de armado en el servidor (se ve en los registros de Vercel).
  console.info(`[tiempo] /monotributo/alertas ${Date.now() - inicio} ms`);
  return (
    <AlertasClient
      {...datos}
      mes={mes}
      anio={anio}
      mesDefault={def.mes}
      anioDefault={def.anio}
      yoId={yo?.id ?? null}
      puedeEditar={puedeEditar}
    />
  );
}
