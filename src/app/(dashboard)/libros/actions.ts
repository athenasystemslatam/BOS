"use server";

import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClienteSocietario, Libro } from "@/types";

type Resultado = { error?: string };

async function autorizar(): Promise<{ id: string } | { error: string }> {
  try {
    return await requireAreaOrAdmin("libros");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }
}

export type DatosSocietario = Omit<ClienteSocietario, "cliente_id" | "actualizado_en">;

export async function guardarSocietario(clienteId: string, datos: DatosSocietario): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;

  const admin = createAdminClient();
  const { error } = await admin.from("clientes_societario").upsert({
    cliente_id: clienteId,
    ...datos,
    actualizado_por: yo.id,
    actualizado_en: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/libros", "layout");
  return {};
}

export type DatosLibro = Omit<Libro, "id" | "cliente_id" | "catalogo_id">;

function validarFolios(datos: Pick<DatosLibro, "folios_totales" | "folios_usados">): string | null {
  if (datos.folios_usados < 0) return "Los folios usados no pueden ser negativos.";
  if (datos.folios_totales != null && datos.folios_usados > datos.folios_totales) {
    return "Los folios usados no pueden superar los folios totales.";
  }
  return null;
}

function traducirError(message: string): string {
  if (message.includes("libros_un_activo_idx")) {
    return "Este libro ya tiene un tomo activo. Cerralo o usá \"Nuevo tomo\".";
  }
  if (message.includes("libros_cliente_id_catalogo_id_tomo_key")) {
    return "Ya existe ese número de tomo para este libro.";
  }
  return message;
}

export async function crearLibro(clienteId: string, catalogoId: string, datos: DatosLibro): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const invalido = validarFolios(datos);
  if (invalido) return { error: invalido };

  const admin = createAdminClient();
  const { error } = await admin
    .from("libros")
    .insert({ cliente_id: clienteId, catalogo_id: catalogoId, ...datos });
  if (error) return { error: traducirError(error.message) };
  revalidatePath("/libros", "layout");
  return {};
}

export async function editarLibro(id: string, datos: DatosLibro): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const invalido = validarFolios(datos);
  if (invalido) return { error: invalido };

  const admin = createAdminClient();
  const { error } = await admin
    .from("libros")
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: traducirError(error.message) };
  revalidatePath("/libros", "layout");
  return {};
}

// Cierra el tomo activo y abre el siguiente (tomo + 1). El cierre va
// primero porque el índice libros_un_activo_idx no admite dos activos; si
// el alta falla, se reabre el anterior para no dejar el libro sin tomo.
export async function abrirNuevoTomo(
  libroId: string,
  datos: Pick<DatosLibro, "rubrica_nro" | "rubrica_fecha" | "folios_totales">
): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;

  const admin = createAdminClient();
  const { data: actual, error: errLeer } = await admin
    .from("libros")
    .select("*")
    .eq("id", libroId)
    .maybeSingle();
  if (errLeer || !actual) return { error: errLeer?.message ?? "No se encontró el libro." };

  const { data: ultimo } = await admin
    .from("libros")
    .select("tomo")
    .eq("cliente_id", actual.cliente_id)
    .eq("catalogo_id", actual.catalogo_id)
    .order("tomo", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ahora = new Date().toISOString();
  const { error: errCerrar } = await admin
    .from("libros")
    .update({ estado: "cerrado", actualizado_en: ahora })
    .eq("id", libroId);
  if (errCerrar) return { error: errCerrar.message };

  const { error: errAlta } = await admin.from("libros").insert({
    cliente_id: actual.cliente_id,
    catalogo_id: actual.catalogo_id,
    tomo: (ultimo?.tomo ?? actual.tomo) + 1,
    soporte: actual.soporte,
    estado: "activo",
    periodicidad: actual.periodicidad,
    ubicacion: actual.ubicacion,
    ubicacion_detalle: actual.ubicacion_detalle,
    folios_usados: 0,
    ...datos,
  });
  if (errAlta) {
    await admin.from("libros").update({ estado: actual.estado }).eq("id", libroId);
    return { error: traducirError(errAlta.message) };
  }

  revalidatePath("/libros", "layout");
  return {};
}
