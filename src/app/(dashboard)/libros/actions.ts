"use server";

import { Resend } from "resend";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, requireAreaOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  TAG_LIBROS,
  UMBRAL_FOLIOS,
  diasHasta,
  fmtFecha,
  foliosLibres,
  vencimientoFinal,
  vencimientoMandato,
  type DatosMandato,
} from "@/lib/libros";
import { configLibros } from "@/lib/librosAutomaticos";
import { METRICAS, type MetricaObjetivo } from "@/lib/librosObjetivosMetricas";
import type {
  AutoridadCliente,
  ClienteSocietario,
  CopiadoFactura,
  DestinoMovimiento,
  EstadoPedido,
  ItemChecklist,
  Libro,
  LibroIncidencia,
  LibroTarea,
  OrigenTareaLibro,
  PrioridadLibro,
  TipoIncidencia,
  TipoMovimiento,
  TipoPedido,
} from "@/types";

type DatosAutoridad = { cargo: string; nombre: string; dni_cuit?: string; fecha_desde?: string; observaciones?: string };

type Resultado = { error?: string };

// Después de guardar algo en Libros: las pantallas, el cartel de objetivos y
// lo automático (que quedan en caché unos minutos) se recalculan al toque.
function refrescarLibros() {
  revalidatePath("/libros", "layout");
  revalidateTag(TAG_LIBROS);
}

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
  const invalido = validarMandato({ ...datos, mandato_vence_preciso: datos.mandato_vence_preciso ?? null });
  if (invalido) return { error: invalido };

  const admin = createAdminClient();
  const { error } = await admin.from("clientes_societario").upsert({
    cliente_id: clienteId,
    ...datos,
    actualizado_por: yo.id,
    actualizado_en: new Date().toISOString(),
  });
  if (error) return { error: traducirErrorMandato(error.message) };
  await cerrarRenovacionSiVigente(admin, clienteId, yo.id);
  refrescarLibros();
  return {};
}

function traducirErrorMandato(message: string): string {
  return message.includes("mandato_vence_preciso") ? "Falta correr add_libros_etapa8.sql en Supabase." : message;
}

export type DatosMandatoForm = { mandato_designacion: string | null; mandato_anios: number | null; mandato_vence_preciso: string | null };

function validarMandato(m: DatosMandatoForm): string | null {
  if (m.mandato_anios != null && (!Number.isInteger(m.mandato_anios) || m.mandato_anios < 1)) {
    return "Los años de mandato tienen que ser un número entero mayor a 0 (vacío = indeterminado).";
  }
  if (m.mandato_vence_preciso && m.mandato_designacion && m.mandato_vence_preciso <= m.mandato_designacion) {
    return "El vencimiento preciso tiene que ser posterior a la designación.";
  }
  return null;
}

/** Edita solo el mandato (desde la lista de Clientes). */
export async function guardarMandato(clienteId: string, m: DatosMandatoForm): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const invalido = validarMandato(m);
  if (invalido) return { error: invalido };
  const admin = createAdminClient();
  const { error } = await admin.from("clientes_societario").upsert({
    cliente_id: clienteId,
    mandato_designacion: m.mandato_designacion,
    mandato_anios: m.mandato_anios,
    mandato_vence_preciso: m.mandato_vence_preciso,
    actualizado_por: yo.id,
    actualizado_en: new Date().toISOString(),
  });
  if (error) return { error: traducirErrorMandato(error.message) };
  await cerrarRenovacionSiVigente(admin, clienteId, yo.id);
  refrescarLibros();
  return {};
}

// Si el mandato editado queda vigente por más que el primer aviso (90 días por
// defecto) o pasó a indeterminado, la renovación abierta del cliente ya no hace
// falta: se cierra sola, dejando el motivo en su historial.
async function cerrarRenovacionSiVigente(admin: Admin, clienteId: string, yoId: string): Promise<void> {
  const [{ data: soc }, config] = await Promise.all([
    admin.from("clientes_societario").select("*").eq("cliente_id", clienteId).maybeSingle(),
    configLibros(admin),
  ]);
  if (!soc?.mandato_designacion && !soc?.mandato_vence_preciso) return;
  const vence = vencimientoFinal(soc as DatosMandato);
  const primerAviso = config.avisosMandato[0] ?? 90;
  if (vence && diasHasta(vence) <= primerAviso) return;

  const { data: abiertas } = await admin
    .from("libros_pedidos")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("tipo", "renovacion_autoridades")
    .in("estado", ["abierto", "esperando_cliente", "esperando_tercero", "aprobado"]);
  const ahora = new Date().toISOString();
  for (const p of abiertas ?? []) {
    await admin.from("libros_pedidos_seguimientos").insert({
      pedido_id: p.id,
      fecha: ahora.slice(0, 10),
      nota: vence
        ? `Cerrado solo: se actualizó el mandato en la ficha y queda vigente hasta el ${fmtFecha(vence)}.`
        : "Cerrado solo: se actualizó el mandato en la ficha y quedó como indeterminado.",
      registrado_por: yoId,
    });
    await admin
      .from("libros_pedidos")
      .update({ estado: "cerrado", proximo_seguimiento: null, actualizado_en: ahora })
      .eq("id", p.id);
  }
}

export async function getAutoridades(clienteId: string): Promise<AutoridadCliente[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clientes_autoridades")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("vigente", { ascending: false })
    .order("cargo");
  return (data ?? []) as AutoridadCliente[];
}

export async function guardarAutoridades(
  clienteId: string,
  nuevas: DatosAutoridad[],
  pedidoId: string | null = null,
  fechaHasta: string | null = null
): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const hoy = ahora.slice(0, 10);
  await admin
    .from("clientes_autoridades")
    .update({ vigente: false, fecha_hasta: fechaHasta ?? hoy, actualizado_en: ahora })
    .eq("cliente_id", clienteId)
    .eq("vigente", true);
  if (nuevas.length > 0) {
    const { error } = await admin.from("clientes_autoridades").insert(
      nuevas.map((a) => ({
        cliente_id: clienteId,
        cargo: a.cargo,
        nombre: a.nombre,
        dni_cuit: a.dni_cuit?.trim() || null,
        fecha_desde: a.fecha_desde || hoy,
        observaciones: a.observaciones?.trim() || null,
        renovacion_id: pedidoId,
        vigente: true,
      }))
    );
    if (error) return { error: error.message };
  }
  refrescarLibros();
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
  refrescarLibros();
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
  refrescarLibros();
  return {};
}

// Cierra el tomo activo y abre el siguiente (tomo + 1). El cierre va
// primero porque el índice libros_un_activo_idx no admite dos activos; si
// el alta falla, se reabre el anterior para no dejar el libro sin tomo.
/** Alta de un libro (tomo 1) sin datos de rúbrica ni folios, desde Seguimiento → "+ Agregar". */
export async function altaLibroRapida(clienteId: string, catalogoId: string): Promise<Resultado & { id?: string }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { data: existente } = await admin
    .from("libros")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("catalogo_id", catalogoId)
    .in("estado", ["activo", "sin_libro"])
    .order("tomo", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existente) return { id: existente.id as string };
  const { data, error } = await admin
    .from("libros")
    .insert({
      cliente_id: clienteId,
      catalogo_id: catalogoId,
      tomo: 1,
      estado: "activo",
      observaciones: "Alta desde Seguimiento: completar rúbrica, folios, último copiado y ubicación.",
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: traducirError(error?.message ?? "No se pudo dar de alta el libro.") };
  refrescarLibros();
  return { id: data.id as string };
}

/**
 * Último paso del circuito de un presupuesto aprobado: abre el tomo en la
 * ficha. Si el libro estaba como "sin libro" (presupuesto de libro nuevo) se
 * activa ese mismo registro; si no, se cierra el tomo actual y se abre el
 * siguiente. El pedido queda cerrado con el detalle en su historial.
 */
export async function abrirTomoDesdePedido(
  pedidoId: string,
  libroId: string,
  datos: Pick<DatosLibro, "rubrica_nro" | "rubrica_fecha" | "folios_totales">
): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (datos.folios_totales != null && (!Number.isInteger(datos.folios_totales) || datos.folios_totales < 1)) {
    return { error: "Los folios del tomo nuevo tienen que ser un número entero mayor a 0." };
  }
  const admin = createAdminClient();
  const [{ data: pedido }, { data: libro }] = await Promise.all([
    admin.from("libros_pedidos").select("id, cliente_id, tipo, estado").eq("id", pedidoId).maybeSingle(),
    admin.from("libros").select("id, cliente_id, estado, tomo, libros_catalogo(nombre)").eq("id", libroId).maybeSingle(),
  ]);
  if (!pedido || !libro) return { error: "No se encontró el pedido o el libro." };
  if (libro.cliente_id !== pedido.cliente_id) return { error: "El libro no es del cliente del pedido." };
  if (pedido.estado !== "aprobado") return { error: "Primero marcá el presupuesto como aprobado." };

  const ahora = new Date().toISOString();
  if (libro.estado === "sin_libro") {
    const { error } = await admin
      .from("libros")
      .update({ ...datos, estado: "activo", folios_usados: 0, actualizado_en: ahora })
      .eq("id", libroId);
    if (error) return { error: traducirError(error.message) };
  } else {
    const res = await abrirNuevoTomo(libroId, datos);
    if (res.error) return res;
  }

  const nombre = (libro.libros_catalogo as unknown as { nombre: string } | null)?.nombre ?? "Libro";
  const tomo = libro.estado === "sin_libro" ? libro.tomo : (libro.tomo as number) + 1;
  await admin.from("libros_pedidos_seguimientos").insert({
    pedido_id: pedidoId,
    fecha: ahora.slice(0, 10),
    nota: `Se abrió ${nombre} tomo ${tomo}${datos.rubrica_nro ? ` (rúbrica ${datos.rubrica_nro})` : ""}${
      datos.folios_totales ? `, ${datos.folios_totales} folios` : ""
    }.`,
    registrado_por: yo.id,
  });
  const { error } = await admin
    .from("libros_pedidos")
    .update({ estado: "cerrado", proximo_seguimiento: null, actualizado_en: ahora })
    .eq("id", pedidoId);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

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

  refrescarLibros();
  return {};
}

// ── Cola de trabajo ─────────────────────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>;

async function estadosFinales(admin: Admin): Promise<string[]> {
  const { data } = await admin.from("libros_estados").select("id").eq("es_final", true);
  return (data ?? []).map((e) => e.id as string);
}

function listaIn(ids: string[]): string {
  return `(${ids.join(",")})`;
}

export type NuevaTarea = {
  cliente_id: string;
  libro_ids: string[];
  origen: OrigenTareaLibro;
  material_listo: boolean;
  fecha_limite: string | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  responsable_id: string | null;
  observaciones: string | null;
};

export async function crearTareas(datos: NuevaTarea): Promise<Resultado & { creadas?: number; omitidas?: number }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (datos.libro_ids.length === 0) return { error: "Elegí al menos un libro." };

  const admin = createAdminClient();
  const finales = await estadosFinales(admin);
  const { data: pendiente } = await admin.from("libros_estados").select("id").eq("codigo", "pendiente").maybeSingle();
  if (!pendiente) return { error: "Falta el estado Pendiente en libros_estados." };

  let abiertasQ = admin.from("libros_tareas").select("libro_id, cliente_id, orden_manual");
  if (finales.length) abiertasQ = abiertasQ.not("estado_id", "in", listaIn(finales));
  const { data: abiertas, error: errAbiertas } = await abiertasQ;
  if (errAbiertas) return { error: errAbiertas.message };

  const yaEnCola = new Set((abiertas ?? []).map((t) => t.libro_id as string));
  const nuevas = datos.libro_ids.filter((id) => !yaEnCola.has(id));
  if (nuevas.length === 0) return { creadas: 0, omitidas: datos.libro_ids.length };

  // Las tareas nuevas se suman al bloque del cliente si ya está en la cola;
  // si no, el cliente entra al final.
  const delCliente = (abiertas ?? []).filter((t) => t.cliente_id === datos.cliente_id);
  const orden = delCliente.length
    ? Math.min(...delCliente.map((t) => t.orden_manual as number))
    : Math.max(0, ...(abiertas ?? []).map((t) => t.orden_manual as number)) + 10;

  const { error } = await admin.from("libros_tareas").insert(
    nuevas.map((libro_id) => ({
      cliente_id: datos.cliente_id,
      libro_id,
      origen: datos.origen,
      material_listo: datos.material_listo,
      fecha_limite: datos.fecha_limite,
      periodo_desde: datos.periodo_desde,
      periodo_hasta: datos.periodo_hasta,
      responsable_id: datos.responsable_id,
      observaciones: datos.observaciones,
      estado_id: pendiente.id,
      orden_manual: orden,
      creado_por: yo.id,
    }))
  );
  if (error) return { error: error.message };
  refrescarLibros();
  return { creadas: nuevas.length, omitidas: datos.libro_ids.length - nuevas.length };
}

const CAMPOS_EDITABLES = [
  "estado_id",
  "responsable_id",
  "material_listo",
  "fecha_limite",
  "periodo_desde",
  "periodo_hasta",
  "fecha_envio_copiar",
  "fecha_retiro",
  "requiere_reformateo",
  "observaciones",
] as const;

export type CambiosTarea = Partial<Pick<LibroTarea, (typeof CAMPOS_EDITABLES)[number]>>;

export async function actualizarTarea(id: string, cambios: CambiosTarea): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;

  const admin = createAdminClient();
  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(cambios).filter(([k]) => (CAMPOS_EDITABLES as readonly string[]).includes(k))
  );
  if (typeof patch.estado_id === "string") {
    const finales = await estadosFinales(admin);
    if (finales.includes(patch.estado_id)) {
      return { error: "Para terminar una tarea usá \"Registrar copiado\": así se actualizan los folios del libro." };
    }
  }
  const { error } = await admin
    .from("libros_tareas")
    .update({ ...patch, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export async function sumarInsistencia(id: string): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;

  const admin = createAdminClient();
  const { data, error: errLeer } = await admin.from("libros_tareas").select("insistencias").eq("id", id).maybeSingle();
  if (errLeer || !data) return { error: errLeer?.message ?? "No se encontró la tarea." };
  const { error } = await admin
    .from("libros_tareas")
    .update({ insistencias: (data.insistencias as number) + 1, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

/** prioridad null = volver a la que propone el sistema. */
export async function cambiarPrioridad(id: string, prioridad: PrioridadLibro | null, motivo: string): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (prioridad && !motivo.trim()) return { error: "Contá por qué cambiás la prioridad." };

  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const { error } = await admin
    .from("libros_tareas")
    .update({
      prioridad_manual: prioridad,
      prioridad_motivo: prioridad ? motivo.trim() : null,
      prioridad_cambiada_por: prioridad ? yo.id : null,
      prioridad_cambiada_en: prioridad ? ahora : null,
      actualizado_en: ahora,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

/** Recibe los clientes de un nivel en el orden nuevo y renumera sus tareas abiertas. */
export async function reordenarBloques(clienteIds: string[]): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;

  const admin = createAdminClient();
  const finales = await estadosFinales(admin);
  const resultados = await Promise.all(
    clienteIds.map((clienteId, i) => {
      let q = admin.from("libros_tareas").update({ orden_manual: (i + 1) * 10 }).eq("cliente_id", clienteId);
      if (finales.length) q = q.not("estado_id", "in", listaIn(finales));
      return q;
    })
  );
  const conError = resultados.find((r) => r.error);
  if (conError?.error) return { error: conError.error.message };
  refrescarLibros();
  return {};
}

export type DatosEnvioCopiadora = { fecha: string; persona: string | null; es_mensajeria: boolean };

// Primer paso del flujo: registra solo la salida a la copiadora (un
// movimiento por libro) y pasa las tareas a Copiándose.
export async function enviarACopiar(tareaIds: string[], datos: DatosEnvioCopiadora): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (tareaIds.length === 0) return { error: "Elegí al menos un libro." };
  if (!datos.fecha) return { error: "Indicá la fecha de envío." };

  const admin = createAdminClient();
  const [finales, { data: copiandose }, { data: tareas, error: errTareas }] = await Promise.all([
    estadosFinales(admin),
    admin.from("libros_estados").select("id").eq("codigo", "copiandose").maybeSingle(),
    admin.from("libros_tareas").select("id, libro_id, cliente_id, estado_id").in("id", tareaIds),
  ]);
  if (errTareas) return { error: errTareas.message };
  if (!copiandose) return { error: "Falta el estado Copiándose en libros_estados." };
  const abiertas = (tareas ?? []).filter((t) => !finales.includes(t.estado_id as string));
  if (abiertas.length === 0) return { error: "Esas tareas ya están terminadas." };

  const { error: errMov } = await admin.from("libros_movimientos").insert(
    abiertas.map((t) => ({
      libro_id: t.libro_id,
      cliente_id: t.cliente_id,
      tarea_id: t.id,
      fecha: datos.fecha,
      tipo: "salida",
      destino: "copiadora",
      persona: datos.persona?.trim() || null,
      es_mensajeria: datos.es_mensajeria,
      registrado_por: yo.id,
    }))
  );
  if (errMov) return { error: errMov.message };

  const ahora = new Date().toISOString();
  const { error: errLibros } = await admin
    .from("libros")
    .update({ ubicacion: "copiadora", actualizado_en: ahora })
    .in("id", abiertas.map((t) => t.libro_id as string));
  if (errLibros) return { error: errLibros.message };

  const { error } = await admin
    .from("libros_tareas")
    .update({ estado_id: copiandose.id, fecha_envio_copiar: datos.fecha, actualizado_en: ahora })
    .in("id", abiertas.map((t) => t.id as string));
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export type ItemCopiado = { tarea_id: string; folios_usados: number; periodo_hasta: string; acta_numero?: string | null };

type TareaConLibro = {
  id: string;
  cliente_id: string;
  estado_id: string;
  fecha_envio_copiar: string | null;
  fecha_retiro: string | null;
  libros: (Libro & { libros_catalogo: { nombre: string } | null }) | null;
};

// Una factura pendiente por cliente: si ya hay una sin recibir ni numerar,
// se le suman las tareas en vez de abrir otra.
async function dejarFacturaPendiente(
  admin: Admin,
  yoId: string,
  clienteId: string,
  tareas: { id: string; nombre: string }[],
  fecha: string
): Promise<string | null> {
  const detalle = `Copiado del ${fmtFecha(fecha)}: ${tareas.map((t) => t.nombre).join(", ")}.`;
  const { data: abierta } = await admin
    .from("copiadora_facturas")
    .select("id, observaciones")
    .eq("cliente_id", clienteId)
    .eq("factura_recibida", false)
    .is("nro_factura", null)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  let facturaId = abierta?.id as string | undefined;
  if (facturaId) {
    const { error } = await admin
      .from("copiadora_facturas")
      .update({
        observaciones: [abierta?.observaciones, detalle].filter(Boolean).join("\n"),
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", facturaId);
    if (error) return error.message;
  } else {
    const { data, error } = await admin
      .from("copiadora_facturas")
      .insert({ cliente_id: clienteId, mes: `${fecha.slice(0, 8)}01`, observaciones: detalle, creado_por: yoId })
      .select("id")
      .maybeSingle();
    if (error || !data) return error?.message ?? "No se pudo crear la factura pendiente.";
    facturaId = data.id as string;
  }
  const { error } = await admin
    .from("copiadora_facturas_tareas")
    .upsert(tareas.map((t) => ({ factura_id: facturaId, tarea_id: t.id })), { ignoreDuplicates: true });
  return error?.message ?? null;
}

// "Retirado / Registrar copiado". Valida todo antes de escribir: si un libro
// no tiene folios suficientes no se registra ninguno, así no queda el envío a
// medias. Lo que estaba en la copiadora registra además la entrada y deja
// pendiente la factura de la copiadora para el cliente.
export async function registrarCopiado(
  items: ItemCopiado[],
  fechaFin: string
): Promise<Resultado & { alertas?: string[]; facturaPendiente?: boolean }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (items.length === 0) return { error: "Elegí al menos un libro." };
  if (items.some((i) => !Number.isInteger(i.folios_usados) || i.folios_usados < 0)) {
    return { error: "Los folios usados tienen que ser números enteros (0 o más)." };
  }
  if (items.some((i) => !i.periodo_hasta)) return { error: "Indicá hasta qué período se copió cada libro." };
  if (!fechaFin) return { error: "Indicá la fecha del copiado." };

  const admin = createAdminClient();
  const umbral = await getUmbralFolios();
  const [{ data: copiado }, { data: copiandose }] = await Promise.all([
    admin.from("libros_estados").select("id").eq("codigo", "copiado").maybeSingle(),
    admin.from("libros_estados").select("id").eq("codigo", "copiandose").maybeSingle(),
  ]);
  if (!copiado) return { error: "Falta el estado Copiado en libros_estados." };

  const { data: tareasRaw, error: errTareas } = await admin
    .from("libros_tareas")
    .select("id, cliente_id, estado_id, fecha_envio_copiar, fecha_retiro, libros(*, libros_catalogo(nombre))")
    .in("id", items.map((i) => i.tarea_id));
  if (errTareas) return { error: errTareas.message };

  const porId = new Map(((tareasRaw ?? []) as unknown as TareaConLibro[]).map((t) => [t.id, t]));
  for (const item of items) {
    const libro = porId.get(item.tarea_id)?.libros;
    if (!libro) return { error: "No se encontró una de las tareas." };
    const libres = foliosLibres(libro.folios_totales, libro.folios_usados);
    if (libres != null && item.folios_usados > libres) {
      return {
        error: `${libro.libros_catalogo?.nombre ?? "Un libro"} tomo ${libro.tomo} tiene ${libres} folios libres y se cargaron ${item.folios_usados}. Abrí un tomo nuevo desde la ficha.`,
      };
    }
  }

  const alertas: string[] = [];
  const ahora = new Date().toISOString();
  const porFacturar = new Map<string, { id: string; nombre: string }[]>();
  for (const item of items) {
    const tarea = porId.get(item.tarea_id)!;
    const libro = tarea.libros!;
    const usados = libro.folios_usados + item.folios_usados;
    const ultimo =
      libro.ultimo_periodo_copiado && libro.ultimo_periodo_copiado > item.periodo_hasta
        ? libro.ultimo_periodo_copiado
        : item.periodo_hasta;
    const enCopiadora = libro.ubicacion === "copiadora";
    const pasoPorCopiadora = enCopiadora || tarea.estado_id === copiandose?.id || !!tarea.fecha_envio_copiar;

    if (enCopiadora) {
      const { error: errMov } = await admin.from("libros_movimientos").insert({
        libro_id: libro.id,
        cliente_id: tarea.cliente_id,
        tarea_id: tarea.id,
        fecha: fechaFin,
        tipo: "entrada",
        destino: "copiadora",
        comentario: "Retirado de la copiadora al registrar el copiado.",
        registrado_por: yo.id,
        acta_numero: item.acta_numero ?? null,
      });
      if (errMov) return { error: errMov.message };
    }

    const { error: errLibro } = await admin
      .from("libros")
      .update({
        folios_usados: usados,
        ultimo_periodo_copiado: ultimo,
        ...(enCopiadora ? { ubicacion: "estudio" } : {}),
        actualizado_en: ahora,
      })
      .eq("id", libro.id);
    if (errLibro) return { error: errLibro.message };

    const { error: errTarea } = await admin
      .from("libros_tareas")
      .update({
        estado_id: copiado.id,
        folios_usados: item.folios_usados,
        periodo_hasta: item.periodo_hasta,
        fecha_fin: fechaFin,
        fecha_retiro: tarea.fecha_retiro ?? (pasoPorCopiadora ? fechaFin : null),
        actualizado_en: ahora,
      })
      .eq("id", item.tarea_id);
    if (errTarea) return { error: errTarea.message };

    if (pasoPorCopiadora) {
      const lista = porFacturar.get(tarea.cliente_id) ?? [];
      lista.push({ id: tarea.id, nombre: `${libro.libros_catalogo?.nombre ?? "Libro"} T${libro.tomo}` });
      porFacturar.set(tarea.cliente_id, lista);
    }

    const libres = foliosLibres(libro.folios_totales, usados);
    if (libres != null && libres <= umbral) {
      const nombre = `${libro.libros_catalogo?.nombre ?? "Libro"} tomo ${libro.tomo}`;
      const { error: errPedido } = await admin.from("libros_pedidos").insert({
        cliente_id: libro.cliente_id,
        libro_id: libro.id,
        tipo: "presupuesto_tomo_nuevo",
        descripcion: `Quedan ${libres} folios libres en ${nombre} (copiado del ${fechaFin}).`,
        automatico: true,
        creado_por: yo.id,
      });
      // 23505 = ya hay un pedido de tomo nuevo abierto para este libro.
      if (errPedido && errPedido.code !== "23505") return { error: errPedido.message };
      alertas.push(
        errPedido
          ? `${nombre}: quedan ${libres} folios libres (ya había un pedido de tomo nuevo abierto).`
          : `${nombre}: quedan ${libres} folios libres. Se creó el pedido de presupuesto de tomo nuevo.`
      );
    }
  }

  for (const [clienteId, tareas] of Array.from(porFacturar.entries())) {
    const errFactura = await dejarFacturaPendiente(admin, yo.id, clienteId, tareas, fechaFin);
    if (errFactura) alertas.push(`El copiado quedó registrado, pero no se pudo dejar la factura pendiente: ${errFactura}`);
  }

  refrescarLibros();
  return { alertas, facturaPendiente: porFacturar.size > 0 };
}

export type FilaHistorial = {
  id: string;
  tomo: number;
  origen: OrigenTareaLibro;
  periodo_hasta: string | null;
  folios_usados: number | null;
  fecha_fin: string | null;
  responsable: string | null;
  observaciones: string | null;
};

type TareaHistorialRaw = Omit<FilaHistorial, "tomo" | "responsable"> & {
  libros: { tomo: number } | null;
  responsable: { nombre: string } | null;
};

/** Copiados terminados del libro, de todos sus tomos. */
export async function historialLibro(libroId: string): Promise<FilaHistorial[]> {
  const admin = createAdminClient();
  const { data: libro } = await admin.from("libros").select("cliente_id, catalogo_id").eq("id", libroId).maybeSingle();
  if (!libro) return [];
  const [{ data: tomos }, finales] = await Promise.all([
    admin.from("libros").select("id").eq("cliente_id", libro.cliente_id).eq("catalogo_id", libro.catalogo_id),
    estadosFinales(admin),
  ]);
  if (finales.length === 0) return [];

  const { data } = await admin
    .from("libros_tareas")
    .select(
      "id, origen, periodo_hasta, folios_usados, fecha_fin, observaciones, libros(tomo), " +
        "responsable:liquidadoras!libros_tareas_responsable_id_fkey(nombre)"
    )
    .in("libro_id", (tomos ?? []).map((t) => t.id as string))
    .in("estado_id", finales)
    .order("fecha_fin", { ascending: false });

  return ((data ?? []) as unknown as TareaHistorialRaw[]).map((t) => ({
    id: t.id,
    tomo: t.libros?.tomo ?? 1,
    origen: t.origen,
    periodo_hasta: t.periodo_hasta,
    folios_usados: t.folios_usados,
    fecha_fin: t.fecha_fin,
    responsable: t.responsable?.nombre ?? null,
    observaciones: t.observaciones,
  }));
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

export type DatosPedido = {
  cliente_id: string;
  libro_id: string | null;
  tipo: TipoPedido;
  descripcion: string | null;
  solicitante: string | null;
  responsable_id: string | null;
  fecha_pedido: string;
  fecha_limite: string | null;
  monto: string | null;
};

export async function crearPedido(datos: DatosPedido): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { error } = await admin.from("libros_pedidos").insert({
    ...datos,
    monto: datos.monto ? parseFloat(datos.monto) : null,
    creado_por: yo.id,
  });
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export type CambiosPedido = Partial<Omit<DatosPedido, "cliente_id">> & {
  estado?: EstadoPedido;
  respuesta?: string | null;
  fecha_envio_cliente?: string | null;
  fecha_respuesta?: string | null;
};

export async function actualizarPedido(id: string, cambios: CambiosPedido): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  if (cambios.estado === "cerrado") {
    const { data: actual } = await admin.from("libros_pedidos").select("tipo").eq("id", id).maybeSingle();
    if (actual?.tipo === "renovacion_autoridades") {
      return { error: "Para cerrar una renovación usá \"Cerrar renovación\": así se carga el mandato nuevo." };
    }
  }
  const patch: Record<string, unknown> = { ...cambios, actualizado_en: new Date().toISOString() };
  if (typeof patch.monto === "string") patch.monto = patch.monto ? parseFloat(patch.monto as string) : null;
  const { error } = await admin.from("libros_pedidos").update(patch).eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export async function agregarSeguimiento(
  pedidoId: string,
  nota: string,
  proximoSeguimiento: string | null
): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (!nota.trim()) return { error: "La nota no puede estar vacía." };
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const hoy = ahora.slice(0, 10);
  const { error: errSeg } = await admin.from("libros_pedidos_seguimientos").insert({
    pedido_id: pedidoId,
    fecha: hoy,
    nota: nota.trim(),
    proximo_seguimiento: proximoSeguimiento || null,
    registrado_por: yo.id,
  });
  if (errSeg) return { error: errSeg.message };
  await admin.from("libros_pedidos").update({
    ultimo_seguimiento: hoy,
    proximo_seguimiento: proximoSeguimiento || null,
    actualizado_en: ahora,
  }).eq("id", pedidoId);

  // Avisar por mail al responsable del pedido que se cargó un seguimiento.
  // No bloquea si falla.
  void (async () => {
    try {
      if (!process.env.RESEND_API_KEY) return;
      const { data: pedido } = await admin
        .from("libros_pedidos")
        .select("descripcion, responsable_id, clientes(nombre), responsable:liquidadoras!libros_pedidos_responsable_id_fkey(nombre, email)")
        .eq("id", pedidoId)
        .maybeSingle();
      if (!pedido) return;
      const p = pedido as unknown as {
        descripcion: string | null;
        responsable_id: string | null;
        clientes: { nombre: string } | null;
        responsable: { nombre: string; email: string } | null;
      };
      if (!p.responsable?.email || p.responsable_id === yo.id) return;
      const resend = new Resend(process.env.RESEND_API_KEY);
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cliente = p.clientes?.nombre ?? "un cliente";
      const desc = p.descripcion ? ` — ${esc(p.descripcion)}` : "";
      const prox = proximoSeguimiento ? `<p>Próximo seguimiento: ${esc(proximoSeguimiento)}.</p>` : "";
      await resend.emails.send({
        from: "bos@kmaconsultores.com.ar",
        to: p.responsable.email,
        subject: `Seguimiento cargado: ${cliente}${p.descripcion ? ` — ${p.descripcion}` : ""}`,
        html: `<p>Se cargó un seguimiento en el pedido de <strong>${esc(cliente)}</strong>${esc(desc)}.</p><p><strong>Nota:</strong> ${esc(nota.trim())}</p>${prox}`,
      });
    } catch { /* no-op */ }
  })();

  refrescarLibros();
  return {};
}

export async function actualizarChecklist(pedidoId: string, checklist: ItemChecklist[]): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const limpio = checklist
    .map((i) => ({ texto: i.texto.trim(), hecho: !!i.hecho }))
    .filter((i) => i.texto);
  const admin = createAdminClient();
  const { error } = await admin
    .from("libros_pedidos")
    .update({ checklist: limpio, actualizado_en: new Date().toISOString() })
    .eq("id", pedidoId);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

// Cierra la renovación de autoridades cargando el mandato nuevo en
// clientes_societario. El mandato anterior queda en el historial del pedido.
export async function cerrarRenovacion(
  pedidoId: string,
  designacion: string,
  anios: number,
  vencePreciso: string | null = null,
  nuevasAutoridades: DatosAutoridad[] | null = null
): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (!designacion) return { error: "Indicá la fecha de designación del mandato nuevo." };
  if (!Number.isInteger(anios) || anios < 1) return { error: "La duración tiene que ser un número entero de años." };
  if (vencePreciso && vencePreciso <= designacion) return { error: "El vencimiento preciso tiene que ser posterior a la designación." };

  const admin = createAdminClient();
  const { data: pedido, error: errPedido } = await admin
    .from("libros_pedidos")
    .select("cliente_id, tipo, estado")
    .eq("id", pedidoId)
    .maybeSingle();
  if (errPedido || !pedido) return { error: errPedido?.message ?? "No se encontró el pedido." };
  if (pedido.tipo !== "renovacion_autoridades") return { error: "El pedido no es una renovación de autoridades." };
  if (pedido.estado === "cerrado") return { error: "La renovación ya está cerrada." };

  const { data: soc } = await admin
    .from("clientes_societario")
    .select("*")
    .eq("cliente_id", pedido.cliente_id)
    .maybeSingle();
  const venceAnterior = vencimientoFinal(soc as DatosMandato | null);
  const anterior = soc?.mandato_designacion
    ? `designación ${fmtFecha(soc.mandato_designacion)}${soc.mandato_anios ? ` por ${soc.mandato_anios} años` : ", duración sin cargar"}${
        venceAnterior ? ` (vencía el ${fmtFecha(venceAnterior)})` : ""
      }`
    : "sin cargar";
  const venceNuevo = vencePreciso || vencimientoMandato(designacion, anios);
  const nuevo = `designación ${fmtFecha(designacion)} por ${anios} años (vence el ${fmtFecha(venceNuevo)}${vencePreciso ? ", vencimiento preciso" : ""})`;

  const ahora = new Date().toISOString();
  const { error: errSoc } = await admin.from("clientes_societario").upsert({
    cliente_id: pedido.cliente_id,
    mandato_designacion: designacion,
    mandato_anios: anios,
    // El preciso del mandato anterior no tiene que pisar al nuevo. Sin la
    // etapa 8 corrida la columna no existe y no se manda.
    ...(soc && "mandato_vence_preciso" in soc ? { mandato_vence_preciso: vencePreciso } : {}),
    actualizado_por: yo.id,
    actualizado_en: ahora,
  });
  if (errSoc) return { error: traducirErrorMandato(errSoc.message) };

  const { error: errSeg } = await admin.from("libros_pedidos_seguimientos").insert({
    pedido_id: pedidoId,
    fecha: ahora.slice(0, 10),
    nota: `Renovación cerrada. Mandato anterior: ${anterior}. Mandato nuevo: ${nuevo}.`,
    registrado_por: yo.id,
  });
  if (errSeg) return { error: errSeg.message };

  const { error } = await admin
    .from("libros_pedidos")
    .update({ estado: "cerrado", proximo_seguimiento: null, actualizado_en: ahora })
    .eq("id", pedidoId);
  if (error) return { error: error.message };
  if (nuevasAutoridades !== null) {
    await guardarAutoridades(pedido.cliente_id as string, nuevasAutoridades, pedidoId, designacion);
  }
  refrescarLibros();
  return {};
}

// Aprueba el pedido. Para tipos que no son presupuesto, crea también tareas
// de copiado en la cola por cada libro seleccionado.
// Presupuestos se aprueban solo (el nuevo tomo se abre desde la ficha).
export async function aprobarPedido(
  pedidoId: string,
  libroIds: string[]
): Promise<Resultado & { creadas?: number }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();

  const { data: pedido, error: errPedido } = await admin
    .from("libros_pedidos")
    .select("tipo, cliente_id, estado")
    .eq("id", pedidoId)
    .maybeSingle();
  if (errPedido || !pedido) return { error: errPedido?.message ?? "No se encontró el pedido." };
  if (pedido.estado === "aprobado") return { error: "El pedido ya está aprobado." };

  const { error: errUpd } = await admin
    .from("libros_pedidos")
    .update({ estado: "aprobado", actualizado_en: ahora })
    .eq("id", pedidoId);
  if (errUpd) return { error: errUpd.message };

  const esPresupuesto = pedido.tipo === "presupuesto_libro_nuevo" || pedido.tipo === "presupuesto_tomo_nuevo";
  if (esPresupuesto || libroIds.length === 0) {
    refrescarLibros();
    return { creadas: 0 };
  }

  const origen: OrigenTareaLibro = pedido.tipo === "asamblea" ? "asamblea" : "pedido";
  const res = await crearTareas({
    cliente_id: pedido.cliente_id as string,
    libro_ids: libroIds,
    origen,
    material_listo: false,
    fecha_limite: null,
    periodo_desde: null,
    periodo_hasta: null,
    responsable_id: null,
    observaciones: null,
  });
  refrescarLibros();
  if (res.error) return { error: res.error };
  // Vincular tareas creadas al pedido (best-effort: si falla no bloquea).
  // pedido_id no está seteado todavía — lo seteamos en las tareas del cliente
  // que tienen origen=asamblea|pedido y pedido_id IS NULL, creadas hace <5s
  const limite = new Date(Date.now() - 5000).toISOString();
  await admin
    .from("libros_tareas")
    .update({ pedido_id: pedidoId })
    .eq("cliente_id", pedido.cliente_id as string)
    .eq("origen", origen)
    .is("pedido_id", null)
    .gte("creado_en", limite);

  return { creadas: res.creadas ?? 0 };
}

// ── Movimientos ──────────────────────────────────────────────────────────────

export type DatosMovimiento = {
  fecha: string;
  tipo: TipoMovimiento;
  destino: DestinoMovimiento;
  persona: string | null;
  es_mensajeria: boolean;
  comentario: string | null;
};

export async function registrarMovimiento(
  libroIds: string[],
  datos: DatosMovimiento
): Promise<Resultado & { alertas?: string[] }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (libroIds.length === 0) return { error: "Elegí al menos un libro." };

  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const { data: librosCliente } = await admin.from("libros").select("id, cliente_id").in("id", libroIds);
  const clienteDe = new Map((librosCliente ?? []).map((l) => [l.id as string, l.cliente_id as string]));

  // Insertar un movimiento por libro
  const { error: errMov } = await admin.from("libros_movimientos").insert(
    libroIds.map((libro_id) => ({
      libro_id,
      cliente_id: clienteDe.get(libro_id) ?? null,
      fecha: datos.fecha,
      tipo: datos.tipo,
      destino: datos.destino,
      persona: datos.persona || null,
      es_mensajeria: datos.es_mensajeria,
      comentario: datos.comentario || null,
      registrado_por: yo.id,
    }))
  );
  if (errMov) return { error: errMov.message };

  // Salida: actualizar ubicacion del libro al destino
  // Entrada: el libro vuelve al estudio
  const nuevaUbicacion = datos.tipo === "salida" ? datos.destino : "estudio";
  const { error: errUbic } = await admin
    .from("libros")
    .update({ ubicacion: nuevaUbicacion, actualizado_en: ahora })
    .in("id", libroIds);
  if (errUbic) return { error: errUbic.message };

  const alertas: string[] = [];

  if (datos.tipo === "salida" && datos.destino === "copiadora") {
    // Cambiar tareas abiertas de estos libros a estado 'copiandose'
    const [finales, { data: copiandose }] = await Promise.all([
      estadosFinales(admin),
      admin.from("libros_estados").select("id").eq("codigo", "copiandose").maybeSingle(),
    ]);
    if (copiandose) {
      for (const libroId of libroIds) {
        let q = admin
          .from("libros_tareas")
          .update({ estado_id: copiandose.id, fecha_envio_copiar: datos.fecha, actualizado_en: ahora })
          .eq("libro_id", libroId)
          .neq("estado_id", copiandose.id);
        if (finales.length) q = q.not("estado_id", "in", listaIn(finales));
        await q;
      }
    }
  }

  if (datos.tipo === "entrada" && datos.destino === "copiadora") {
    // Volvió de la copiadora: avisar que se puede registrar el copiado
    alertas.push("Acordate de registrar el copiado para actualizar los folios.");
  }

  refrescarLibros();
  return { alertas: alertas.length ? alertas : undefined };
}

export async function reordenarPedidos(pedidoIds: string[]): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  await Promise.all(
    pedidoIds.map((id, i) =>
      admin.from("libros_pedidos").update({ orden_manual: (i + 1) * 10, actualizado_en: ahora }).eq("id", id)
    )
  );
  refrescarLibros();
  return {};
}

export async function marcarRelevamiento(
  clienteId: string,
  estado: "pendiente" | "relevada"
): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const fecha = estado === "relevada" ? ahora.slice(0, 10) : null;
  const { error } = await admin.from("libros_relevamiento").upsert(
    { cliente_id: clienteId, estado, fecha, relevado_por: yo.id, actualizado_en: ahora },
    { onConflict: "cliente_id" }
  );
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

// ── Incidencias ──────────────────────────────────────────────────────────────

export type DatosIncidencia = {
  libro_id: string;
  tipo: TipoIncidencia;
  situacion: string;
};

export async function registrarIncidencia(datos: DatosIncidencia): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (!datos.situacion.trim()) return { error: "Describí la situación." };
  const admin = createAdminClient();
  const { data: libro } = await admin.from("libros").select("cliente_id").eq("id", datos.libro_id).maybeSingle();
  const { error } = await admin.from("libros_incidencias").insert({
    ...datos,
    cliente_id: libro?.cliente_id ?? null,
    situacion: datos.situacion.trim(),
    registrado_por: yo.id,
  });
  if (error) return { error: error.message };
  if (datos.tipo === "extravio") {
    await admin.from("libros").update({ extraviado: true, actualizado_en: new Date().toISOString() }).eq("id", datos.libro_id);
  }
  refrescarLibros();
  return {};
}

export async function resolverIncidencia(id: string, resolucion: string): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const { data: inc, error: errLeer } = await admin
    .from("libros_incidencias")
    .select("libro_id, tipo")
    .eq("id", id)
    .maybeSingle();
  if (errLeer || !inc) return { error: errLeer?.message ?? "No se encontró la incidencia." };

  const { error } = await admin
    .from("libros_incidencias")
    .update({ resuelto: true, resolucion: resolucion.trim() || null, actualizado_en: ahora })
    .eq("id", id);
  if (error) return { error: error.message };

  if ((inc as unknown as LibroIncidencia).tipo === "extravio" && (inc as unknown as LibroIncidencia).libro_id) {
    // Limpiar extraviado solo si no quedan otros extravíos abiertos
    const { count } = await admin
      .from("libros_incidencias")
      .select("id", { count: "exact", head: true })
      .eq("libro_id", (inc as unknown as LibroIncidencia).libro_id!)
      .eq("tipo", "extravio")
      .eq("resuelto", false)
      .neq("id", id);
    if ((count ?? 0) === 0) {
      await admin
        .from("libros")
        .update({ extraviado: false, actualizado_en: ahora })
        .eq("id", (inc as unknown as LibroIncidencia).libro_id!);
    }
  }
  refrescarLibros();
  return {};
}

// ── Copiadora ────────────────────────────────────────────────────────────────

export type DatosFactura = Omit<CopiadoFactura, "id" | "creado_por" | "creado_en" | "actualizado_en">;

export async function crearFactura(datos: DatosFactura): Promise<Resultado & { id?: string }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("copiadora_facturas")
    .insert({ ...datos, creado_por: yo.id })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  refrescarLibros();
  return { id: (data as { id: string } | null)?.id };
}

export type PatchFactura = Partial<
  Pick<
    CopiadoFactura,
    | "cliente_id"
    | "proveedor"
    | "nro_factura"
    | "fecha_factura"
    | "mes"
    | "monto"
    | "factura_recibida"
    | "reenviada_cliente"
    | "pagado"
    | "comprobante_enviado"
    | "libros_texto"
    | "observaciones"
  >
>;

export async function actualizarFactura(id: string, patch: PatchFactura): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { error } = await admin
    .from("copiadora_facturas")
    .update({ ...patch, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

/**
 * Suma copiados (tareas terminadas) a una factura: una factura puede cubrir
 * varios libros o varios envíos del mismo cliente. Solo tareas de ese cliente.
 */
export async function vincularTareasFactura(facturaId: string, tareaIds: string[]): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (tareaIds.length === 0) return { error: "Elegí al menos un copiado." };
  const admin = createAdminClient();
  const [{ data: factura }, { data: tareas }] = await Promise.all([
    admin.from("copiadora_facturas").select("cliente_id").eq("id", facturaId).maybeSingle(),
    admin.from("libros_tareas").select("id, cliente_id").in("id", tareaIds),
  ]);
  if (!factura) return { error: "No se encontró la factura." };
  if ((tareas ?? []).some((t) => t.cliente_id !== factura.cliente_id)) {
    return { error: "Solo se pueden sumar copiados del mismo cliente de la factura." };
  }
  const { error } = await admin
    .from("copiadora_facturas_tareas")
    .upsert(tareaIds.map((tarea_id) => ({ factura_id: facturaId, tarea_id })), { ignoreDuplicates: true });
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export async function desvincularTareaFactura(facturaId: string, tareaId: string): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { error } = await admin.from("copiadora_facturas_tareas").delete().eq("factura_id", facturaId).eq("tarea_id", tareaId);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export async function eliminarFactura(id: string): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { error } = await admin.from("copiadora_facturas").delete().eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

// ── Dashboard: orden de tarjetas por usuario ─────────────────────────────────

export async function guardarOrdenDashboard(orden: string[]): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No hay sesión." };
  const admin = createAdminClient();
  const { error } = await admin.from("libros_preferencias").upsert({
    email: user.email.toLowerCase(),
    dashboard_orden: orden.slice(0, 50),
    actualizado_en: new Date().toISOString(),
  });
  if (error) return { error: error.message.includes("libros_preferencias") ? "Falta correr add_libros_etapa9.sql en Supabase." : error.message };
  return {};
}

// ── Configuración (admin) ────────────────────────────────────────────────────

/** Lee el umbral de folios desde libros_config; cae en la constante si no existe la tabla. */
export async function getUmbralFolios(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("libros_config").select("umbral_folios").maybeSingle();
    return (data as { umbral_folios: number } | null)?.umbral_folios ?? UMBRAL_FOLIOS;
  } catch {
    return UMBRAL_FOLIOS;
  }
}

export async function actualizarUmbralFolios(umbral: number): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  if (!Number.isInteger(umbral) || umbral < 1) return { error: "El umbral tiene que ser un número entero mayor que 0." };
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("libros_config").select("id").maybeSingle();
  if (!cfg) return { error: "Tabla libros_config no encontrada. ¿Corriste la migración de etapa 4?" };
  const { error } = await admin.from("libros_config").update({ umbral_folios: umbral }).eq("id", (cfg as { id: string }).id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}

export async function actualizarAvisosMandato(avisos: number[]): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  const limpios = Array.from(new Set(avisos)).sort((a, b) => b - a);
  if (limpios.length === 0 || limpios.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) {
    return { error: "Cargá uno o más días entre 1 y 365, separados por coma (ej.: 90, 60, 30)." };
  }
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("libros_config").select("id").maybeSingle();
  if (!cfg) return { error: "Tabla libros_config no encontrada. ¿Corriste la migración de etapa 4?" };
  const { error } = await admin.from("libros_config").update({ mandato_avisos: limpios }).eq("id", (cfg as { id: string }).id);
  if (error) {
    return { error: error.message.includes("mandato_avisos") ? "Falta correr add_libros_etapa6.sql en Supabase." : error.message };
  }
  refrescarLibros();
  return {};
}

// ── Objetivos del módulo (admin) ─────────────────────────────────────────────

export type DatosObjetivo = {
  nombre: string;
  metrica: MetricaObjetivo;
  meta: number;
  fecha_limite: string | null;
  estado: "actual" | "cumplido";
  fecha_cumplimiento: string | null;
};

function validarObjetivo(o: DatosObjetivo): string | null {
  if (!o.nombre.trim()) return "Poné un nombre al objetivo.";
  if (!METRICAS.some((m) => m.id === o.metrica)) return "Elegí una métrica de la lista.";
  if (!Number.isFinite(o.meta) || o.meta <= 0 || o.meta > 100) return "La meta es un porcentaje entre 1 y 100.";
  if (o.estado === "cumplido" && !o.fecha_cumplimiento) return "Indicá la fecha en que se cumplió.";
  return null;
}

function errorObjetivos(message: string): string {
  return message.includes("libros_objetivos") ? "Falta correr add_libros_etapa11.sql en Supabase." : message;
}

export async function guardarObjetivo(id: string | null, o: DatosObjetivo): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  const invalido = validarObjetivo(o);
  if (invalido) return { error: invalido };
  const admin = createAdminClient();
  const fila = {
    nombre: o.nombre.trim(),
    metrica: o.metrica,
    meta: o.meta,
    fecha_limite: o.fecha_limite || null,
    estado: o.estado,
    fecha_cumplimiento: o.estado === "cumplido" ? o.fecha_cumplimiento : null,
    actualizado_en: new Date().toISOString(),
  };
  if (id) {
    const { error } = await admin.from("libros_objetivos").update(fila).eq("id", id);
    if (error) return { error: errorObjetivos(error.message) };
  } else {
    const { data: ultimo } = await admin.from("libros_objetivos").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
    const { error } = await admin.from("libros_objetivos").insert({ ...fila, orden: ((ultimo?.orden as number | undefined) ?? 0) + 10 });
    if (error) return { error: errorObjetivos(error.message) };
  }
  refrescarLibros();
  return {};
}

export async function eliminarObjetivo(id: string): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  const admin = createAdminClient();
  const { error } = await admin.from("libros_objetivos").delete().eq("id", id);
  if (error) return { error: errorObjetivos(error.message) };
  refrescarLibros();
  return {};
}

export type ConfigMails ={ diarioExcluidos: string[]; semanalIds: string[] | null; semanalDia: number };

export async function actualizarMailsLibros(cfg: ConfigMails): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  if (!Number.isInteger(cfg.semanalDia) || cfg.semanalDia < 1 || cfg.semanalDia > 5) {
    return { error: "El resumen semanal sale de lunes a viernes." };
  }
  const admin = createAdminClient();
  const { data: actual } = await admin.from("libros_config").select("id").maybeSingle();
  if (!actual) return { error: "Tabla libros_config no encontrada. ¿Corriste la migración de etapa 4?" };
  const { error } = await admin
    .from("libros_config")
    .update({
      mail_diario_excluidos: Array.from(new Set(cfg.diarioExcluidos)),
      mail_semanal_ids: cfg.semanalIds ? Array.from(new Set(cfg.semanalIds)) : null,
      mail_semanal_dia: cfg.semanalDia,
    })
    .eq("id", (actual as { id: string }).id);
  if (error) {
    return { error: error.message.includes("mail_") ? "Falta correr add_libros_etapa10.sql en Supabase." : error.message };
  }
  refrescarLibros();
  return {};
}

export async function actualizarFechaMeta(fecha: string | null): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("libros_config").select("id").maybeSingle();
  if (!cfg) return { error: "Tabla libros_config no encontrada. ¿Corriste la migración de etapa 4?" };
  const { error } = await admin.from("libros_config").update({ fecha_meta_puesta: fecha }).eq("id", (cfg as { id: string }).id);
  if (error) {
    return { error: error.message.includes("fecha_meta_puesta") ? "Falta correr add_libros_etapa7.sql en Supabase." : error.message };
  }
  refrescarLibros();
  return {};
}

export async function actualizarEstado(
  id: string,
  cambios: { nombre?: string; orden?: number; activo?: boolean }
): Promise<Resultado> {
  try { await requireAdmin(); } catch (e) { return { error: e instanceof Error ? e.message : "No autorizado." }; }
  const admin = createAdminClient();
  const { error } = await admin.from("libros_estados").update(cambios).eq("id", id);
  if (error) return { error: error.message };
  refrescarLibros();
  return {};
}
