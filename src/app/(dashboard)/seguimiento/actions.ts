"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireLiquidadoraOrAdmin, requireAreaOrAdmin } from "@/lib/auth";

import { MESES_NOMBRES, getMesTrabajoActual } from "@/lib/vencimientos";
import { ClaveAcceso, EmailContacto, Periodo, Tarea } from "@/types";
import type { CampoManual } from "@/lib/drive";
export type { CampoManual } from "@/lib/drive";

const CAMPOS_DRIVE = [
  "rec_q1",
  "recibos",
  "f931",
  "bol_sind",
  "rub_lsd",
  "sac",
] as const;

const MAX_EMAILS_CONTACTO = 5;

/** Edita los datos de contacto/accesos de un cliente desde el recuadro de
 * la llavecita en Seguimiento — mismos campos que la ficha completa
 * (emails_contacto, cuil_arca, claves_acceso), así el cambio se ve también
 * en Clientes de Sueldos y Panel General. No toca nombre/CUIT/liquidadora
 * ni el estado. */
export async function editarDatosCliente(
  clienteId: string,
  datos: {
    emails_contacto_detalle: EmailContacto[];
    cuil_arca: string | null;
    telefono: string | null;
    observaciones: string | null;
    claves_acceso: ClaveAcceso[];
  }
) {
  try {
    await requireAreaOrAdmin("sueldos");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();

  // emails_contacto_detalle es la fuente nueva (email + aclaración de
  // área). emails_contacto (solo direcciones, la columna vieja) se sigue
  // derivando y guardando en paralelo para no tener que tocar lo que ya la
  // lee (exportar a Excel, tarjetas mobile) — ver types/index.ts.
  const emails_contacto_detalle = (Array.isArray(datos.emails_contacto_detalle) ? datos.emails_contacto_detalle : [])
    .map((e) => ({ email: String(e?.email ?? "").trim(), aclaracion: String(e?.aclaracion ?? "").trim() }))
    .filter((e) => e.email)
    .slice(0, MAX_EMAILS_CONTACTO);
  const emails_contacto = emails_contacto_detalle.map((e) => e.email);

  const cuil_arca = datos.cuil_arca?.trim() || null;
  const telefono = datos.telefono?.trim() || null;
  const observaciones = datos.observaciones?.trim() || null;

  const claves_acceso = (Array.isArray(datos.claves_acceso) ? datos.claves_acceso : [])
    .map((c) => ({
      sistema: String(c?.sistema ?? "").trim(),
      usuario: String(c?.usuario ?? "").trim(),
      contrasena: String(c?.contrasena ?? ""),
      modulo: String(c?.modulo ?? ""),
    }))
    .filter((c) => c.sistema || c.usuario || c.contrasena);

  const { error } = await admin
    .from("clientes")
    .update({
      emails_contacto,
      emails_contacto_detalle,
      cuil_arca,
      telefono,
      observaciones,
      claves_acceso,
      fecha_modificacion: new Date().toISOString(),
    })
    .eq("id", clienteId);

  if (error) {
    if (error.message.includes("claves_acceso")) {
      return {
        error: 'Para guardar claves, ejecutá primero "alter_clientes_y_liquidadoras.sql" en Supabase.',
      };
    }
    if (error.message.includes("telefono")) {
      return {
        error: 'Para guardar el teléfono, ejecutá primero en Supabase: alter table clientes add column if not exists telefono text;',
      };
    }
    if (error.message.includes("emails_contacto_detalle")) {
      return {
        error: 'Para guardar la aclaración de los emails, ejecutá primero en Supabase: alter table clientes add column if not exists emails_contacto_detalle jsonb default \'[]\'::jsonb;',
      };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function toggleManual(
  clienteId: string,
  periodoId: string,
  campo: CampoManual,
  valor: boolean
) {
  try {
    await requireLiquidadoraOrAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const camposConTimestamp = ["f931", "recibos"] as const;
  type CampoTs = typeof camposConTimestamp[number];
  const timestampField = camposConTimestamp.includes(campo as CampoTs)
    ? { [`${campo}_manual_en`]: valor ? new Date().toISOString() : null }
    : {};

  const { error } = await admin
    .from("tareas")
    .upsert(
      {
        cliente_id: clienteId,
        periodo_id: periodoId,
        [`${campo}_manual`]: valor,
        ...timestampField,
      },
      { onConflict: "cliente_id,periodo_id" }
    );

  if (!error) {
    const { mes: mesActivo, anio: anioActivo } = getMesTrabajoActual();
    const { data: periodo } = await admin
      .from("periodos")
      .select("mes, anio")
      .eq("id", periodoId)
      .single();
    if (periodo) {
      const esCerrado =
        periodo.anio < anioActivo ||
        (periodo.anio === anioActivo && periodo.mes < mesActivo);
      if (esCerrado) {
        await admin.from("alertas_postcierre").insert({
          cliente_id: clienteId,
          periodo_id: periodoId,
          campo,
        });
      }
    }
  }

  return error ? { error: error.message } : { success: true };
}

export async function updateLegajos(
  clienteId: string,
  periodoId: string,
  cantidad: number
) {
  try {
    await requireLiquidadoraOrAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tareas")
    .upsert(
      { cliente_id: clienteId, periodo_id: periodoId, legajos_cantidad: cantidad },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}

// A propósito sin requireLiquidadoraOrAdmin: cualquier usuario autenticado y
// permitido (ver middleware.ts) puede dejar una observación, incluidos los
// de modo consulta. Es la única escritura habilitada para ese modo.
export async function updateObservaciones(
  clienteId: string,
  periodoId: string,
  observaciones: string
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("tareas")
    .upsert(
      { cliente_id: clienteId, periodo_id: periodoId, observaciones },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}

// A diferencia de Legajos/Observaciones/Recordatorio, la alícuota ART no es
// un dato por período — vive en `clientes`, igual que el nombre de la ART.
// Se edita acá igual (columna directa en la tabla) para no obligar a pasar
// por Clientes → Editar para un dato que se consulta seguido en Seguimiento.
export async function updateAlicuotaArt(clienteId: string, alicuota: string) {
  try {
    await requireLiquidadoraOrAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("clientes")
    .update({ alicuota_art: alicuota.trim() || null })
    .eq("id", clienteId);
  return error ? { error: error.message } : { success: true };
}

export async function fetchPeriodo(
  anio: number,
  mes: number
): Promise<Periodo | null> {
  const admin = createAdminClient();
  let { data } = await admin
    .from("periodos")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();

  if (!data) {
    const { data: nuevo } = await admin
      .from("periodos")
      .upsert(
        { anio, mes, nombre_mes: `${MESES_NOMBRES[mes]} ${anio}` },
        { onConflict: "anio,mes" }
      )
      .select()
      .single();
    data = nuevo;
  }

  // Repetir legajos_cantidad para clientes que todavía no lo tienen en este
  // período — el número de legajos casi nunca cambia mes a mes, así que no
  // tiene sentido pedirlo de nuevo cada vez. Antes solo miraba el mes
  // inmediatamente anterior: si un mes se saltaba (nadie entró a Seguimiento
  // ese mes, o el período se creó desde Dashboard sin pasar por acá), la
  // cadena se cortaba ahí y de ahí en más había que volver a cargarlo a
  // mano. Ahora busca, período por período hacia atrás, el último valor
  // cargado de cada cliente (sin importar cuántos meses de por medio),
  // así "repite" indefinidamente hasta que alguien lo cambie.
  if (data) {
    await copiarLegajosDelHistorial(admin, (data as Periodo).id, anio, mes);
  }

  return data as Periodo | null;
}

/** Completa legajos_cantidad en `periodoId` para todo cliente que no lo
 * tenga cargado ahí todavía, usando el último valor > 0 que ese cliente
 * tuvo en cualquier período anterior a (anio, mes) — no solo el mes previo.
 * No pisa nada ya cargado en `periodoId`. Helper interno de fetchPeriodo —
 * sin `export` a propósito: este archivo es "use server" y todo lo
 * exportado se trata como Server Action (necesita argumentos serializables
 * para la RPC cliente→servidor); acá se le pasa el client de Supabase
 * directo, así que tiene que quedar privado. Dashboard de Sueldos, que
 * antes creaba el período por su cuenta sin este paso, ahora llama a
 * fetchPeriodo (sí exportada, solo recibe anio/mes) en vez de duplicar la
 * lógica. */
async function copiarLegajosDelHistorial(
  admin: ReturnType<typeof createAdminClient>,
  periodoId: string,
  anio: number,
  mes: number
) {
  const [{ data: periodos }, { data: yaExistentes }, { data: tareasConLegajos }] = await Promise.all([
    admin.from("periodos").select("id, anio, mes"),
    admin.from("tareas").select("cliente_id").eq("periodo_id", periodoId).gt("legajos_cantidad", 0),
    admin.from("tareas").select("cliente_id, periodo_id, legajos_cantidad").gt("legajos_cantidad", 0),
  ]);

  const ordenPeriodo = new Map((periodos ?? []).map((p) => [p.id, p.anio * 100 + p.mes]));
  const ordenActual = anio * 100 + mes;
  const conLegajos = new Set((yaExistentes ?? []).map((t) => t.cliente_id));

  // Último valor > 0 de cada cliente en un período estrictamente anterior.
  const masReciente = new Map<string, { orden: number; legajos: number }>();
  for (const t of tareasConLegajos ?? []) {
    const orden = ordenPeriodo.get(t.periodo_id);
    if (orden === undefined || orden >= ordenActual) continue;
    const actual = masReciente.get(t.cliente_id);
    if (!actual || orden > actual.orden) {
      masReciente.set(t.cliente_id, { orden, legajos: t.legajos_cantidad });
    }
  }

  const toCopy = Array.from(masReciente.entries()).filter(([clienteId]) => !conLegajos.has(clienteId));
  if (toCopy.length > 0) {
    await admin.from("tareas").upsert(
      toCopy.map(([cliente_id, v]) => ({
        cliente_id,
        periodo_id: periodoId,
        legajos_cantidad: v.legajos,
      })),
      { onConflict: "cliente_id,periodo_id" }
    );
  }
}

export async function updateRecordatorio(
  clienteId: string,
  periodoId: string,
  recordatorio: string
) {
  try {
    await requireLiquidadoraOrAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tareas")
    .upsert(
      { cliente_id: clienteId, periodo_id: periodoId, recordatorio },
      { onConflict: "cliente_id,periodo_id" }
    );
  return error ? { error: error.message } : { success: true };
}

// Devuelve un mapa clienteId → recordatorio del período anterior al dado
export async function fetchRecordatoriosPrevios(
  periodoId: string
): Promise<Record<string, string>> {
  const admin = createAdminClient();

  const { data: periodo } = await admin
    .from("periodos")
    .select("mes, anio")
    .eq("id", periodoId)
    .single();

  if (!periodo) return {};

  const mesPrev = periodo.mes === 1 ? 12 : periodo.mes - 1;
  const anioPrev = periodo.mes === 1 ? periodo.anio - 1 : periodo.anio;

  const { data: periodoAnterior } = await admin
    .from("periodos")
    .select("id")
    .eq("anio", anioPrev)
    .eq("mes", mesPrev)
    .maybeSingle();

  if (!periodoAnterior) return {};

  const { data: tareas } = await admin
    .from("tareas")
    .select("cliente_id, recordatorio")
    .eq("periodo_id", periodoAnterior.id)
    .not("recordatorio", "is", null)
    .neq("recordatorio", "");

  if (!tareas) return {};
  return Object.fromEntries(
    tareas.map((t) => [t.cliente_id, t.recordatorio as string])
  );
}

export async function fetchTareas(periodoId: string): Promise<Tarea[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tareas")
    .select("*")
    .eq("periodo_id", periodoId);
  return (data as Tarea[]) ?? [];
}

export type SyncDriveResult = {
  archivosDetectados: number;
  clientesConArchivos: number;
  errorCodes: Record<string, number>;
  error?: string;
};

export async function syncDrive(
  periodoId: string,
  mes: number,
  anio: number
): Promise<SyncDriveResult> {
  try {
    await requireLiquidadoraOrAdmin();
  } catch (e) {
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      errorCodes: {},
      error: e instanceof Error ? e.message : "No autorizado.",
    };
  }

  console.log("[syncDrive] inicio — periodoId:", periodoId, "mes:", mes, "anio:", anio);
  console.log("[syncDrive] GOOGLE_SERVICE_ACCOUNT_JSON definida:", !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON, "longitud:", (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").length);

  const supabase = createAdminClient();

  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre, drive_folder_id")
    .eq("estado", "activo");

  console.log("[syncDrive] clientes:", clientes?.length ?? 0, "error:", clientesError?.message ?? "ninguno");

  if (clientesError || !clientes) {
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      errorCodes: {},
      error: clientesError?.message ?? "No se pudieron cargar los clientes",
    };
  }

  let results;
  try {
    console.log("[syncDrive] importando drive module...");
    const { scanClientesForMonth } = await import("@/lib/drive");
    console.log("[syncDrive] llamando scanClientesForMonth...");
    results = await scanClientesForMonth(clientes, mes, anio);
    console.log("[syncDrive] scanClientesForMonth completó, resultados:", results.length);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[syncDrive] ERROR en scanClientesForMonth:", msg);
    return {
      archivosDetectados: 0,
      clientesConArchivos: 0,
      errorCodes: {},
      error: msg,
    };
  }

  let archivosDetectados = 0;
  let clientesConArchivos = 0;
  const errorCodes: Record<string, number> = {};

  const tareaUpserts: Record<string, unknown>[] = [];
  const driveLogRows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const result of results) {
    if (result.errorCode) {
      errorCodes[result.errorCode] = (errorCodes[result.errorCode] ?? 0) + 1;
    }

    const updates: Record<string, boolean> = {};
    for (const campo of CAMPOS_DRIVE) {
      updates[`${campo}_drive`] = result.encontrados.has(campo);
    }

    tareaUpserts.push({
      cliente_id: result.clienteId,
      periodo_id: periodoId,
      ...updates,
      drive_error: result.errorCode ?? null,
    });

    if (result.encontrados.size > 0) {
      clientesConArchivos++;
      result.encontrados.forEach((file, campo) => {
        archivosDetectados++;
        driveLogRows.push({
          cliente_id: result.clienteId,
          periodo_id: periodoId,
          archivo_nombre: file.name,
          archivo_url: file.url,
          tarea_detectada: campo,
          fecha_deteccion: now,
        });
      });
    }

    // Loguear extras (ej: recibos_vac) sin contar como archivo detectado para checkboxes
    result.extras?.forEach((file, campo) => {
      driveLogRows.push({
        cliente_id: result.clienteId,
        periodo_id: periodoId,
        archivo_nombre: file.name,
        archivo_url: file.url,
        tarea_detectada: campo,
        fecha_deteccion: now,
      });
    });
  }

  // Upsert tareas in batches of 100
  for (let i = 0; i < tareaUpserts.length; i += 100) {
    await supabase
      .from("tareas")
      .upsert(tareaUpserts.slice(i, i + 100), {
        onConflict: "cliente_id,periodo_id",
      });
  }

  // Limpiar drive_log anterior para este período antes de insertar (evita duplicados)
  await supabase.from("drive_log").delete().eq("periodo_id", periodoId);

  if (driveLogRows.length > 0) {
    for (let i = 0; i < driveLogRows.length; i += 100) {
      const { error: logError } = await supabase.from("drive_log").insert(driveLogRows.slice(i, i + 100));
      if (logError) console.error("[syncDrive] drive_log insert error:", logError.message);
    }
  }

  return { archivosDetectados, clientesConArchivos, errorCodes };
}
