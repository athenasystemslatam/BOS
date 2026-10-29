"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, requireAreaOrAdmin } from "@/lib/auth";
import { getObjetivoSueldos } from "@/lib/objetivos";
import { COLUMNAS_FAL } from "@/lib/falServer";
import { filaFalVacia, type FilaFal, type MotivoDefaultFal, type PasoFal } from "@/lib/fal";

type Resultado = { error: string } | { fila: FilaFal; idFal: string | null };

const PASOS: PasoFal[] = ["aviso_enviado", "respondio", "confirmado_arca"];
const MOTIVOS: MotivoDefaultFal[] = ["no_respondio", "respondio_sin_confirmar"];

async function leer(clienteId: string): Promise<{ fila: FilaFal; idFal: string | null }> {
  const admin = createAdminClient();
  const [{ data: fila }, { data: cliente }] = await Promise.all([
    admin.from("clientes_fal").select(COLUMNAS_FAL).eq("cliente_id", clienteId).maybeSingle(),
    admin.from("clientes").select("id_fal").eq("id", clienteId).maybeSingle(),
  ]);
  return {
    fila: (fila as unknown as FilaFal) ?? filaFalVacia(clienteId),
    idFal: (cliente?.id_fal as string | null) ?? null,
  };
}

async function guardarFila(clienteId: string, cambios: Record<string, unknown>, porId: string): Promise<Resultado> {
  const admin = createAdminClient();
  const { error } = await admin.from("clientes_fal").upsert(
    { cliente_id: clienteId, ...cambios, actualizado_en: new Date().toISOString(), actualizado_por: porId },
    { onConflict: "cliente_id" }
  );
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return leer(clienteId);
}

/** Para la sección FAL de la ficha: se muestra si el cliente tiene Sueldos
 * activo o ya tiene algo cargado de FAL. */
export async function obtenerFalCliente(clienteId: string): Promise<{
  fila: FilaFal;
  idFal: string | null;
  mostrar: boolean;
  puedeEditar: boolean;
  fechaCorte: string;
}> {
  const admin = createAdminClient();
  const [datos, { data: servicio }, objetivo, yo] = await Promise.all([
    leer(clienteId),
    admin
      .from("servicios_cliente")
      .select("cliente_id")
      .eq("cliente_id", clienteId)
      .eq("servicio", "sueldos")
      .eq("estado", true)
      .limit(1),
    getObjetivoSueldos(),
    getCurrentLiquidadora(),
  ]);
  let puedeEditar = false;
  if (yo && !yo.esCobranzas) {
    try {
      await requireAreaOrAdmin("sueldos");
      puedeEditar = true;
    } catch {
      puedeEditar = false;
    }
  }
  const tieneAlgo = datos.fila.aviso_enviado || datos.fila.respondio || datos.fila.confirmado_arca || datos.fila.asignado_default || !!datos.idFal;
  return { ...datos, mostrar: (servicio?.length ?? 0) > 0 || tieneAlgo, puedeEditar, fechaCorte: objetivo.fal_fecha_corte };
}

export async function marcarPasoFal(clienteId: string, paso: PasoFal, valor: boolean): Promise<Resultado> {
  let yo;
  try {
    yo = await requireAreaOrAdmin("sueldos");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (!PASOS.includes(paso)) return { error: "Paso inválido." };
  return guardarFila(clienteId, {
    [paso]: valor,
    [`${paso}_en`]: valor ? new Date().toISOString() : null,
    [`${paso}_por`]: valor ? yo.id : null,
  }, yo.id);
}

/** El ID FAL vive en clientes.id_fal (el mismo campo que se edita desde
 * Panel General y Empresas); acá además queda la fecha de carga. */
export async function guardarIdFal(clienteId: string, idFal: string): Promise<Resultado> {
  let yo;
  try {
    yo = await requireAreaOrAdmin("sueldos");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  const valor = idFal.trim() || null;
  const admin = createAdminClient();
  const { error } = await admin.from("clientes").update({ id_fal: valor }).eq("id", clienteId);
  if (error) return { error: error.message };
  return guardarFila(clienteId, {
    id_fal_en: valor ? new Date().toISOString() : null,
    id_fal_por: valor ? yo.id : null,
  }, yo.id);
}

/** Corrección a mano del resultado al corte ("Asignado por default"). */
export async function guardarDefaultFal(
  clienteId: string,
  asignado: boolean,
  motivo: MotivoDefaultFal | null
): Promise<Resultado> {
  let yo;
  try {
    yo = await requireAreaOrAdmin("sueldos");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
  if (asignado && (!motivo || !MOTIVOS.includes(motivo))) return { error: "Elegí el motivo." };
  return guardarFila(clienteId, {
    asignado_default: asignado,
    default_motivo: asignado ? motivo : null,
  }, yo.id);
}
