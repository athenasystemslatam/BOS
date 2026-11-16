"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import {
  FORMAS_PAGO,
  MEDIOS,
  type DatosMonotributoCliente,
  type Revision,
} from "@/lib/monotributo";
import {
  leerDatosCliente,
  requireEditorMonotributo,
  sincronizarRevisionesCliente,
  traerPaginado,
} from "@/lib/monotributoServer";

export interface FichaMonotributo {
  mostrar: boolean;
  puedeEditar: boolean;
  datos: DatosMonotributoCliente;
  responsable: string | null;
  revisiones: (Revision & { resuelta_por_nombre: string | null })[];
  opcionesPagaDesde: { id: string; nombre: string }[];
}

export async function obtenerFichaMonotributo(clienteId: string): Promise<FichaMonotributo | null> {
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || (!yo.isAdmin && !areas.includes("monotributo"))) return null;

  const admin = createAdminClient();
  const { data: servicio } = await admin
    .from("servicios_cliente")
    .select("responsable_id, estado")
    .eq("cliente_id", clienteId)
    .eq("servicio", "monotributo")
    .order("estado", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!servicio) return { mostrar: false } as FichaMonotributo;

  const [datos, { data: revsRaw }, equipo, clientesMono] = await Promise.all([
    leerDatosCliente(admin, clienteId),
    admin
      .from("monotributo_revisiones")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("detectada_at", { ascending: false }),
    traerPaginado<{ id: string; nombre: string }>((d, h) =>
      admin.from("liquidadoras").select("id, nombre").order("id").range(d, h)
    ),
    traerPaginado<{ cliente_id: string; clientes: { nombre: string } | null }>((d, h) =>
      admin
        .from("servicios_cliente")
        .select("cliente_id, clientes(nombre)")
        .eq("servicio", "monotributo")
        .order("cliente_id")
        .range(d, h)
    ),
  ]);

  const nombres = new Map(equipo.map((e) => [e.id, e.nombre]));
  const { responsable_id } = servicio as { responsable_id: string | null };

  const puedeEditar =
    !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" && (yo.isAdmin || areas.includes("monotributo"));

  return {
    mostrar: true,
    puedeEditar,
    datos,
    responsable: responsable_id ? (nombres.get(responsable_id) ?? null) : null,
    revisiones: ((revsRaw ?? []) as Revision[]).map((r) => ({
      ...r,
      resuelta_por_nombre: r.resuelta_por ? (nombres.get(r.resuelta_por) ?? null) : null,
    })),
    opcionesPagaDesde: clientesMono
      .filter((c) => c.cliente_id !== clienteId && c.clientes)
      .map((c) => ({ id: c.cliente_id, nombre: c.clientes!.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

export type CambiosMonotributo = Partial<
  Omit<DatosMonotributoCliente, "alta_por_importacion" | "updated_at">
>;

function limpiarTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function guardarFichaMonotributo(
  clienteId: string,
  cambios: CambiosMonotributo
): Promise<{ error: string } | { ok: true; ficha: FichaMonotributo | null }> {
  let yoId: string;
  try {
    yoId = (await requireEditorMonotributo()).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const fila: Record<string, unknown> = {};

  if ("forma_pago" in cambios) {
    const v = cambios.forma_pago ?? null;
    if (v !== null && !FORMAS_PAGO.includes(v)) return { error: "Forma de pago inválida." };
    fila.forma_pago = v;
  }
  if ("medio" in cambios) {
    const v = cambios.medio ?? null;
    if (v !== null && !MEDIOS.includes(v)) return { error: "Medio inválido." };
    fila.medio = v;
  }
  if ("mails" in cambios) {
    const mails = (cambios.mails ?? []).map((m) => m.trim()).filter(Boolean);
    const malo = mails.find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
    if (malo) return { error: `Mail inválido: ${malo}` };
    fila.mails = mails;
  }
  if ("paga_desde_cliente_id" in cambios) {
    const v = cambios.paga_desde_cliente_id || null;
    if (v === clienteId) return { error: "Un cliente no puede pagar desde su propia cuenta." };
    fila.paga_desde_cliente_id = v;
  }
  if ("saldo_a_favor" in cambios) {
    const v = cambios.saldo_a_favor;
    if (v !== null && v !== undefined && !Number.isFinite(v)) return { error: "Saldo a favor inválido." };
    fila.saldo_a_favor = v ?? null;
  }
  for (const k of ["avisa", "envia_vep"] as const) {
    if (k in cambios) fila[k] = !!cambios[k];
  }
  for (const k of [
    "paga_desde_texto",
    "destinatario",
    "whatsapp",
    "empresa_grupo",
    "resolucion_arba",
    "observaciones",
  ] as const) {
    if (k in cambios) fila[k] = limpiarTexto(cambios[k]);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("monotributo_clientes")
    .upsert(
      { cliente_id: clienteId, ...fila, updated_at: new Date().toISOString(), updated_por: yoId },
      { onConflict: "cliente_id" }
    );
  if (error) return { error: error.message };

  try {
    await sincronizarRevisionesCliente(admin, clienteId, yoId);
  } catch {
    // La marca de revisión nunca corta el guardado.
  }

  revalidatePath("/monotributo");
  return { ok: true, ficha: await obtenerFichaMonotributo(clienteId) };
}
