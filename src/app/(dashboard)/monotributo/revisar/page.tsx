import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { puedeSerResponsable, type Revision } from "@/lib/monotributo";
import { sincronizarRevisionesModulo, traerPaginado } from "@/lib/monotributoServer";
import { RevisarClient, type FilaRevision } from "./RevisarClient";

export default async function MonotributoRevisarPage() {
  const admin = createAdminClient();
  try {
    await sincronizarRevisionesModulo(admin);
  } catch {
    // Si la sincronización falla se muestra igual lo que ya está marcado.
  }

  const [yo, areas, revs, servicios, personas] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    traerPaginado<Revision & { clientes: { nombre: string; cuit: string } | null }>((d, h) =>
      admin.from("monotributo_revisiones").select("*, clientes(nombre, cuit)")
        .eq("estado", "pendiente").order("id").range(d, h)
    ),
    traerPaginado<{ cliente_id: string; responsable_id: string | null; estado: boolean }>((d, h) =>
      admin.from("servicios_cliente").select("cliente_id, responsable_id, estado")
        .eq("servicio", "monotributo").eq("subtipo", "general").order("id").range(d, h)
    ),
    traerPaginado<{ id: string; nombre: string; rol: string }>((d, h) =>
      admin.from("liquidadoras").select("id, nombre, rol").order("id").range(d, h)
    ),
  ]);

  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  const servicioPor = new Map(servicios.map((s) => [s.cliente_id, s]));

  const filas: FilaRevision[] = revs.map((r) => {
    const s = servicioPor.get(r.cliente_id);
    const respId = s?.responsable_id ?? null;
    return {
      id: r.id,
      cliente_id: r.cliente_id,
      cliente: r.clientes?.nombre ?? "—",
      cuit: r.clientes?.cuit ?? "",
      responsable_id: respId,
      responsable: respId ? (nombres.get(respId) ?? null) : null,
      servicio_activo: s?.estado ?? false,
      campo: r.campo,
      motivo: r.motivo,
      gravedad: r.gravedad,
      anio: r.anio,
      mes: r.mes,
      origen: r.origen,
      detectada_at: r.detectada_at,
    };
  });

  const responsablesConMarcas = Array.from(new Set(filas.map((f) => f.responsable_id).filter((x): x is string => !!x)))
    .map((id) => ({ id, nombre: nombres.get(id) ?? "—" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const puedeEditar =
    !!yo && !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" && (yo.isAdmin || areas.includes("monotributo"));

  return (
    <RevisarClient
      filas={filas}
      responsables={responsablesConMarcas}
      yoId={yo?.id ?? null}
      esAdmin={!!yo?.isAdmin}
      esResponsable={!!yo && puedeSerResponsable(yo.rol) && filas.some((f) => f.responsable_id === yo.id)}
      puedeEditar={puedeEditar}
    />
  );
}
