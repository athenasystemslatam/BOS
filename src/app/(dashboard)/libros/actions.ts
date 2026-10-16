"use server";

import { revalidatePath } from "next/cache";
import { requireAreaOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UMBRAL_FOLIOS, foliosLibres } from "@/lib/libros";
import type {
  ClienteSocietario,
  CopiadoFactura,
  DestinoMovimiento,
  EstadoPedido,
  Libro,
  LibroIncidencia,
  LibroTarea,
  OrigenTareaLibro,
  PrioridadLibro,
  TipoIncidencia,
  TipoMovimiento,
  TipoPedido,
} from "@/types";

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
  revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
  return {};
}

export type ItemCopiado = { tarea_id: string; folios_usados: number; periodo_hasta: string };

type TareaConLibro = {
  id: string;
  libros: (Libro & { libros_catalogo: { nombre: string } | null }) | null;
};

// Valida todo antes de escribir: si un libro no tiene folios suficientes no
// se registra ninguno, así no queda el envío a medias.
export async function registrarCopiado(
  items: ItemCopiado[],
  fechaFin: string
): Promise<Resultado & { alertas?: string[] }> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  if (items.length === 0) return { error: "Elegí al menos un libro." };
  if (items.some((i) => !Number.isInteger(i.folios_usados) || i.folios_usados < 0)) {
    return { error: "Los folios usados tienen que ser números enteros (0 o más)." };
  }
  if (items.some((i) => !i.periodo_hasta)) return { error: "Indicá hasta qué período se copió cada libro." };
  if (!fechaFin) return { error: "Indicá la fecha del copiado." };

  const admin = createAdminClient();
  const { data: copiado } = await admin.from("libros_estados").select("id").eq("codigo", "copiado").maybeSingle();
  if (!copiado) return { error: "Falta el estado Copiado en libros_estados." };

  const { data: tareasRaw, error: errTareas } = await admin
    .from("libros_tareas")
    .select("id, libros(*, libros_catalogo(nombre))")
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
  for (const item of items) {
    const libro = porId.get(item.tarea_id)!.libros!;
    const usados = libro.folios_usados + item.folios_usados;
    const ultimo =
      libro.ultimo_periodo_copiado && libro.ultimo_periodo_copiado > item.periodo_hasta
        ? libro.ultimo_periodo_copiado
        : item.periodo_hasta;

    const { error: errLibro } = await admin
      .from("libros")
      .update({ folios_usados: usados, ultimo_periodo_copiado: ultimo, actualizado_en: ahora })
      .eq("id", libro.id);
    if (errLibro) return { error: errLibro.message };

    const { error: errTarea } = await admin
      .from("libros_tareas")
      .update({
        estado_id: copiado.id,
        folios_usados: item.folios_usados,
        periodo_hasta: item.periodo_hasta,
        fecha_fin: fechaFin,
        actualizado_en: ahora,
      })
      .eq("id", item.tarea_id);
    if (errTarea) return { error: errTarea.message };

    const libres = foliosLibres(libro.folios_totales, usados);
    if (libres != null && libres <= UMBRAL_FOLIOS) {
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

  revalidatePath("/libros", "layout");
  return { alertas };
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
  revalidatePath("/libros", "layout");
  return {};
}

export type CambiosPedido = Partial<Omit<DatosPedido, "cliente_id">> & { estado?: EstadoPedido; respuesta?: string };

export async function actualizarPedido(id: string, cambios: CambiosPedido): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { ...cambios, actualizado_en: new Date().toISOString() };
  if (typeof patch.monto === "string") patch.monto = patch.monto ? parseFloat(patch.monto as string) : null;
  const { error } = await admin.from("libros_pedidos").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
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
    revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
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

  // Insertar un movimiento por libro
  const { error: errMov } = await admin.from("libros_movimientos").insert(
    libroIds.map((libro_id) => ({
      libro_id,
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

  revalidatePath("/libros", "layout");
  return { alertas: alertas.length ? alertas : undefined };
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
  const { error } = await admin.from("libros_incidencias").insert({
    ...datos,
    situacion: datos.situacion.trim(),
    registrado_por: yo.id,
  });
  if (error) return { error: error.message };
  if (datos.tipo === "extravio") {
    await admin.from("libros").update({ extraviado: true, actualizado_en: new Date().toISOString() }).eq("id", datos.libro_id);
  }
  revalidatePath("/libros", "layout");
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

  if ((inc as unknown as LibroIncidencia).tipo === "extravio") {
    // Limpiar extraviado solo si no quedan otros extravíos abiertos
    const { count } = await admin
      .from("libros_incidencias")
      .select("id", { count: "exact", head: true })
      .eq("libro_id", (inc as unknown as LibroIncidencia).libro_id)
      .eq("tipo", "extravio")
      .eq("resuelto", false)
      .neq("id", id);
    if ((count ?? 0) === 0) {
      await admin
        .from("libros")
        .update({ extraviado: false, actualizado_en: ahora })
        .eq("id", (inc as unknown as LibroIncidencia).libro_id);
    }
  }
  revalidatePath("/libros", "layout");
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
  revalidatePath("/libros", "layout");
  return { id: (data as { id: string } | null)?.id };
}

export type PatchFactura = Partial<
  Pick<CopiadoFactura, "proveedor" | "nro_factura" | "fecha_factura" | "mes" | "monto" | "factura_recibida" | "reenviada_cliente" | "pagado" | "comprobante_enviado" | "observaciones">
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
  revalidatePath("/libros", "layout");
  return {};
}

export async function eliminarFactura(id: string): Promise<Resultado> {
  const yo = await autorizar();
  if ("error" in yo) return yo;
  const admin = createAdminClient();
  const { error } = await admin.from("copiadora_facturas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/libros", "layout");
  return {};
}
