import { redirect } from "next/navigation";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyArgentina } from "@/lib/monotributo";
import {
  controlEnCurso,
  filasDelControl,
  leerControles,
  leerUmbral,
  leerVersiones,
  versionVigente,
  type FilaFacturacion,
} from "@/lib/monotributoFacturacionServer";
import { FacturacionClient } from "./FacturacionClient";

export const dynamic = "force-dynamic";

export default async function FacturacionPage({ searchParams }: { searchParams: { control?: string } }) {
  const inicio = Date.now();
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || (!yo.isAdmin && !areas.includes("monotributo"))) redirect("/monotributo");
  const puedeEditar = !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer";

  const admin = createAdminClient();
  const hoy = hoyArgentina();
  const anioHoy = Number(hoy.slice(0, 4));
  const [{ controles, disponible }, { versiones }, umbral, { data: personas }] = await Promise.all([
    leerControles(admin, [anioHoy - 1, anioHoy, anioHoy + 1], puedeEditar ? [anioHoy] : []),
    leerVersiones(admin),
    leerUmbral(admin),
    admin.from("liquidadoras").select("id, nombre"),
  ]);

  const enCurso = controlEnCurso(controles, hoy);
  const control = controles.find((c) => c.id === searchParams.control) ?? enCurso ?? controles[0] ?? null;
  let filas: FilaFacturacion[] = [];
  let errorFilas: string | null = null;
  if (control) {
    try {
      filas = await filasDelControl(admin, control.id, hoy);
    } catch (e) {
      errorFilas = e instanceof Error ? e.message : "No se pudieron leer los datos.";
    }
  }
  const vigente = versionVigente(versiones, hoy);
  console.info(`[tiempo] /monotributo/facturacion ${Date.now() - inicio} ms`);

  return (
    <FacturacionClient
      key={control?.id ?? "sin"}
      controles={controles}
      control={control}
      enCursoId={enCurso?.id ?? null}
      filas={filas}
      errorFilas={errorFilas}
      disponible={disponible}
      topes={vigente?.filas ?? []}
      vigenteDesde={vigente?.vigente_desde ?? null}
      umbral={umbral}
      nombres={Object.fromEntries(((personas ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]))}
      yoId={yo.id}
      puedeEditar={puedeEditar}
      hoy={hoy}
    />
  );
}
