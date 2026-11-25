// Registro de qué tablas componen el "backup" de cada tablero — volcado
// crudo (todas las columnas, sin formatear) pensado para restaurar info si
// se pierde algo, no para leer prolijo. Lo usan /api/backup/[modulo] (un
// tablero puntual) y /api/backup/completo (toda la base, para poder
// recuperar y retomar todo si hiciera falta).
// Separado del patrón "Exportar" (src/app/api/exportar/*), que arma un
// reporte prolijo para mandar afuera (facturación, ficha de cliente, etc).

import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";

export type BackupModulo =
  | "panel-general"
  | "sueldos"
  | "impuestos"
  | "contable"
  | "monotributo"
  | "libros"
  | "productividad";

export const BACKUPS: Record<BackupModulo, { label: string; tablas: string[] }> = {
  "panel-general": {
    label: "Panel General",
    // "equipo" se unificó en "liquidadoras" (ver supabase/unificar_equipo.sql)
    // — no existe como tabla propia en la base.
    tablas: [
      "clientes",
      "servicios_cliente",
      "asignaciones_servicio",
      "equipo_modulos",
      "liquidadoras",
      "accesos_bloqueados",
    ],
  },
  sueldos: {
    label: "Sueldos",
    tablas: [
      "periodos",
      "tareas",
      "asignaciones",
      "historial_asignaciones",
      "sueldos_notas",
      "clientes_fal",
      "drive_log",
    ],
  },
  impuestos: {
    label: "Impuestos",
    tablas: ["impuestos_tareas", "impuestos_clientes"],
  },
  contable: {
    label: "Contable",
    tablas: [
      "balances",
      "balance_frenados",
      "contable_vto_prorrogas",
      "contable_vto_manual",
      "clientes_cierre_cambios",
    ],
  },
  monotributo: {
    label: "Monotributo",
    tablas: [
      "monotributo_tareas", "monotributo_clientes", "monotributo_revisiones", "monotributo_eventos",
      "monotributo_alertas_resueltas", "monotributo_historial", "calendario_arca",
      "monotributo_categorias_versiones", "monotributo_categorias", "monotributo_controles",
      "monotributo_facturacion", "monotributo_facturacion_archivos", "monotributo_config",
    ],
  },
  libros: {
    label: "Libros",
    tablas: [
      "clientes_societario",
      "libros_catalogo",
      "libros",
      "libros_estados",
      "libros_pedidos",
      "libros_pedidos_seguimientos",
      "libros_tareas",
      "libros_movimientos",
      "libros_incidencias",
      "copiadora_facturas",
      "copiadora_facturas_tareas",
      "libros_config",
      "libros_avisos_mandato",
      "libros_objetivos",
      "libros_snapshot",
      "libros_preferencias",
      "clientes_autoridades",
      "libros_relevamiento",
    ],
  },
  productividad: {
    label: "Productividad",
    tablas: ["objetivos_area", "objetivos_excepcion_cliente"],
  },
};

export function esBackupModuloValido(valor: string): valor is BackupModulo {
  return Object.prototype.hasOwnProperty.call(BACKUPS, valor);
}

// Una letra por módulo (no el nombre completo: "monotributo_" ya es parte
// del nombre de casi todas sus tablas, y duplicarlo entero se pasa del
// límite de 31 caracteres que tiene el nombre de una hoja de Excel).
const PREFIJO_MODULO: Record<BackupModulo, string> = {
  "panel-general": "G",
  sueldos: "S",
  impuestos: "I",
  contable: "C",
  monotributo: "M",
  libros: "L",
  productividad: "P",
};

// A qué módulo pertenece cada tabla — para prefijar las hojas del Excel
// (ej. "S_periodos") y poder ubicar de un vistazo las de un módulo en el
// backup completo, donde las hojas vienen en orden alfabético y no
// agrupadas. Una tabla que no esté en ningún módulo (ej. un log interno
// como monitoreo_crecimiento) queda sin prefijo.
const PREFIJO_POR_TABLA: Record<string, string> = {};
for (const [modulo, { tablas }] of Object.entries(BACKUPS)) {
  for (const tabla of tablas) PREFIJO_POR_TABLA[tabla] = PREFIJO_MODULO[modulo as BackupModulo];
}

// Tablas sin columna "id": se ordenan por su clave primaria. Antes todo se
// ordenaba por "id" y estas tablas hacían fallar el backup entero.
const ORDEN_TABLA: Record<string, string[]> = {
  accesos_bloqueados: ["email"],
  clientes_fal: ["cliente_id"],
  clientes_societario: ["cliente_id"],
  copiadora_facturas_tareas: ["factura_id", "tarea_id"],
  libros_avisos_mandato: ["cliente_id", "mandato_vence", "umbral"],
  libros_snapshot: ["fecha"],
  libros_preferencias: ["email"],
  objetivos_area: ["area"],
};

// PostgREST corta en 1000 filas por defecto — tablas como tareas o
// libros_movimientos ya lo superan.
async function traerTodas(
  admin: ReturnType<typeof createAdminClient>,
  tabla: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas: Record<string, any>[] = [];
  let orden = ORDEN_TABLA[tabla] ?? ["id"];
  for (let desde = 0; ; desde += 1000) {
    let consulta = admin.from(tabla).select("*");
    for (const c of orden) consulta = consulta.order(c);
    let { data, error } = await consulta.range(desde, desde + 999);
    // Tabla nueva sin "id" que todavía no está en ORDEN_TABLA (backup completo):
    // se ordena por todas sus columnas, que es estable aunque no haya clave.
    if (error && desde === 0 && orden[0] === "id" && /column .*id.* does not exist|42703/i.test(`${error.code} ${error.message}`)) {
      const { data: muestra, error: e2 } = await admin.from(tabla).select("*").limit(1);
      if (e2) throw new Error(`${tabla}: ${e2.message}`);
      orden = Object.keys(muestra?.[0] ?? {});
      let reintento = admin.from(tabla).select("*");
      for (const c of orden) reintento = reintento.order(c);
      ({ data, error } = await reintento.range(desde, desde + 999));
    }
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

// jsonb/array/objetos no entran directo en una celda — se guardan como texto
// para no perder el dato (ej. claves_acceso, emails_contacto).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function celda(valor: any) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return valor;
}

/** Arma el workbook de un backup: una hoja "Info" + una hoja por tabla, con
 * todas sus columnas sin formatear. Lo comparten /api/backup/[modulo] (lista
 * fija) y /api/backup/completo (lista resuelta en el momento contra la base
 * completa, vía la función SQL listar_tablas_backup).
 * Si una tabla falla, el resto igual se guarda: el error queda en la hoja
 * "Info" y en la de esa tabla, y se devuelve en `errores` (el cron semanal
 * avisa con eso). */
export async function armarWorkbookBackup(
  admin: ReturnType<typeof createAdminClient>,
  label: string,
  tablas: string[]
): Promise<
  ExcelJS.Workbook & { errores: string[]; filasPorTabla: Record<string, number>; avisosNombre: string[] }
> {
  const errores: string[] = [];
  // Nombres de hoja que superaron los 31 caracteres de Excel y quedaron
  // recortados — un aviso, no una falla (los datos están todos igual). Se
  // guarda aparte de `errores` para no disparar la alerta de "backup
  // falló" del cron semanal por esto.
  const avisosNombre: string[] = [];
  const filasPorTabla: Record<string, number> = {};
  const ahora = new Date();
  const wb = new ExcelJS.Workbook();

  const wsInfo = wb.addWorksheet("Info");
  wsInfo.columns = [{ width: 50 }];
  wsInfo.getCell("A1").value = `Backup — ${label}`;
  wsInfo.getCell("A1").font = { bold: true, size: 13 };
  wsInfo.getCell("A2").value = `Generado: ${ahora.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
  wsInfo.getCell("A2").font = { italic: true, color: { argb: "FF888888" } };
  wsInfo.getCell("A3").value = `Tablas incluidas (${tablas.length}): ${tablas.join(", ")}`;
  wsInfo.getCell("A3").alignment = { wrapText: true };

  // Nombres de sheet repetidos (truncado a 31 u otra colisión real) no
  // deberían pasar con las tablas actuales, pero por las dudas se
  // desambiguan agregando un sufijo en vez de que ExcelJS tire error.
  // Las tablas se leen de a 6 a la vez (antes una atrás de otra); las hojas se arman en orden.
  const lecturas = new Map<string, Promise<Record<string, unknown>[]>>();
  const leer = (t: string) => {
    if (!lecturas.has(t)) lecturas.set(t, traerTodas(admin, t));
    return lecturas.get(t)!;
  };
  for (let k = 0; k < tablas.length; k += 6) {
    await Promise.allSettled(tablas.slice(k, k + 6).map(leer));
  }

  const nombresUsados = new Set<string>(["Info"]);
  for (const tabla of tablas) {
    const prefijo = PREFIJO_POR_TABLA[tabla];
    const base = prefijo ? `${prefijo}_${tabla}` : tabla;
    if (base.length > 31) {
      avisosNombre.push(`"${tabla}" → "${base}" (${base.length} caracteres)`);
    }
    let nombre = base.slice(0, 31);
    let i = 2;
    while (nombresUsados.has(nombre)) {
      const sufijo = `~${i++}`;
      nombre = base.slice(0, 31 - sufijo.length) + sufijo;
    }
    nombresUsados.add(nombre);

    const ws = wb.addWorksheet(nombre);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filas: Record<string, any>[];
    try {
      filas = await leer(tabla);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errores.push(msg);
      ws.getCell("A1").value = `ERROR: no se pudo copiar esta tabla — ${msg}`;
      ws.getCell("A1").font = { bold: true, color: { argb: "FFC0392B" } };
      continue;
    }
    filasPorTabla[tabla] = filas.length;

    if (filas.length === 0) {
      ws.getCell("A1").value = "(sin datos)";
      ws.getCell("A1").font = { italic: true, color: { argb: "FF888888" } };
      continue;
    }

    const columnas = Object.keys(filas[0]);
    ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 2, 12), 40) }));
    ws.getRow(1).font = { bold: true };

    for (const fila of filas) {
      const valores: Record<string, unknown> = {};
      for (const c of columnas) valores[c] = celda(fila[c]);
      ws.addRow(valores);
    }
  }

  if (errores.length) {
    wsInfo.getCell("A4").value = `⚠ ${errores.length} tabla(s) no se pudieron copiar: ${errores.join(" · ")}`;
    wsInfo.getCell("A4").font = { bold: true, color: { argb: "FFC0392B" } };
    wsInfo.getCell("A4").alignment = { wrapText: true };
  }
  if (avisosNombre.length) {
    const fila = errores.length ? 5 : 4;
    wsInfo.getCell(`A${fila}`).value = `ℹ Nombre de hoja recortado (31 car. máx. de Excel): ${avisosNombre.join(" · ")}`;
    wsInfo.getCell(`A${fila}`).font = { italic: true, color: { argb: "FF888888" } };
    wsInfo.getCell(`A${fila}`).alignment = { wrapText: true };
  }
  return Object.assign(wb, { errores, filasPorTabla, avisosNombre });
}

export function stampArchivoBackup(d: Date) {
  return d
    .toLocaleString("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    })
    .replace(" ", "_")
    .replace(":", "-");
}

// Bucket privado (ver supabase/crear_bucket_backups.sql) donde el cron
// semanal guarda una copia además de mandarla por mail — así queda un
// historial real que no depende de que alguien archive los correos.
export const BACKUP_BUCKET = "backups";

// Cuántas copias semanales conservar en el bucket (12 ≈ 3 meses). Las más
// viejas se borran después de subir la nueva — ver limpiarBackupsViejos.
export const BACKUPS_A_CONSERVAR = 12;

export async function subirBackupAStorage(
  admin: ReturnType<typeof createAdminClient>,
  nombreArchivo: string,
  buffer: ExcelJS.Buffer
): Promise<void> {
  const { error } = await admin.storage.from(BACKUP_BUCKET).upload(nombreArchivo, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (error) throw new Error(`No se pudo subir el backup a Storage: ${error.message}`);
}

/** Borra las copias más viejas del bucket, dejando como mucho
 * BACKUPS_A_CONSERVAR (los nombres son `backup-completo_<fecha>.xlsx` con
 * fecha en formato ordenable YYYY-MM-DD_HH-mm, así que ordenar por nombre
 * alcanza — no hace falta leer metadata). */
export async function limpiarBackupsViejos(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data, error } = await admin.storage.from(BACKUP_BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
  });
  if (error) throw new Error(`No se pudo listar el bucket de backups: ${error.message}`);

  // Solo las copias (la carpeta "latidos/" de las tareas automáticas no se toca).
  const sobrantes = (data ?? []).filter((f) => f.name.startsWith("backup-")).slice(BACKUPS_A_CONSERVAR);
  if (sobrantes.length === 0) return;

  const { error: errorBorrado } = await admin.storage
    .from(BACKUP_BUCKET)
    .remove(sobrantes.map((f) => f.name));
  if (errorBorrado) throw new Error(`No se pudieron borrar backups viejos: ${errorBorrado.message}`);
}

// Carpeta aparte dentro del mismo bucket para los backups que se guardan a
// mano (botón "Guardar copia") — separada de las semanales automáticas
// (que viven en la raíz) para que no compitan por los mismos 12 lugares de
// limpiarBackupsViejos.
const CARPETA_MANUAL = "manual";

export async function subirBackupManualAStorage(
  admin: ReturnType<typeof createAdminClient>,
  nombreArchivo: string,
  buffer: ExcelJS.Buffer
): Promise<void> {
  const { error } = await admin.storage.from(BACKUP_BUCKET).upload(`${CARPETA_MANUAL}/${nombreArchivo}`, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (error) throw new Error(`No se pudo subir el backup a Storage: ${error.message}`);
}

/** Igual que limpiarBackupsViejos pero por módulo: los nombres son
 * `backup-<modulo>_<fecha>.xlsx`, así que se agrupan por el prefijo antes
 * del primer "_" y se conservan las últimas BACKUPS_A_CONSERVAR de cada
 * grupo — una racha de guardados en Contable no debería tirar copias
 * viejas de Sueldos. */
export async function limpiarBackupsManualesViejos(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data, error } = await admin.storage.from(BACKUP_BUCKET).list(CARPETA_MANUAL, {
    sortBy: { column: "name", order: "desc" },
  });
  if (error) throw new Error(`No se pudo listar los backups manuales: ${error.message}`);

  const porModulo = new Map<string, string[]>();
  for (const archivo of data ?? []) {
    const modulo = archivo.name.replace(/^backup-/, "").split("_")[0];
    const lista = porModulo.get(modulo) ?? [];
    lista.push(archivo.name);
    porModulo.set(modulo, lista);
  }

  const sobrantes = Array.from(porModulo.values()).flatMap((nombres) => nombres.slice(BACKUPS_A_CONSERVAR));
  if (sobrantes.length === 0) return;

  const { error: errorBorrado } = await admin.storage
    .from(BACKUP_BUCKET)
    .remove(sobrantes.map((n) => `${CARPETA_MANUAL}/${n}`));
  if (errorBorrado) throw new Error(`No se pudieron borrar backups manuales viejos: ${errorBorrado.message}`);
}

// Vercel no deja que una función devuelva más de 4.5 MB por respuesta — es
// el límite real que puede romper la generación de un backup (no Resend ni
// Supabase Storage, que están mucho más holgados). Lo usamos como techo de
// referencia para la barra de estado y la alerta temprana.
export const BACKUP_LIMITE_BYTES = 4.5 * 1024 * 1024;

// A partir de qué porcentaje del límite se manda el mail de aviso.
const UMBRAL_ALERTA_BACKUP = 0.7;

async function avisarBackupCercaDelLimite(modulo: string, tamanioBytes: number) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!process.env.RESEND_API_KEY || !adminEmail) return;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const mb = (tamanioBytes / 1024 / 1024).toFixed(2);
    const limiteMb = (BACKUP_LIMITE_BYTES / 1024 / 1024).toFixed(1);
    await resend.emails.send({
      from: "bos@kmaconsultores.com.ar",
      to: adminEmail,
      subject: "⚠ BOS — un backup se está acercando al límite de tamaño",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
          <h2 style="font-size:16px;color:#c0392b">BOS — backup cerca del límite</h2>
          <p style="font-size:14px">El backup de "${modulo}" pesó <strong>${mb} MB</strong> — se está acercando al límite de ${limiteMb} MB que permite Vercel por respuesta. Si lo supera, ese backup va a empezar a fallar.</p>
        </div>
      `,
    });
  } catch {
    // Mejor silencioso que romper el guardado del backup por esto.
  }
}

/** Guarda cuánto pesó un backup generado (manual o automático) para poder
 * mostrar un historial y una barra de estado — ver backup_historial en
 * supabase/crear_tabla_backup_historial.sql — y manda un aviso por mail si
 * ya está cerca de BACKUP_LIMITE_BYTES. */
export async function registrarTamanioBackup(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "manual" | "automatico",
  modulo: string,
  tamanioBytes: number
): Promise<void> {
  const { error } = await admin
    .from("backup_historial")
    .insert({ tipo, modulo, tamanio_bytes: tamanioBytes });
  if (error) throw new Error(`No se pudo registrar el tamaño del backup: ${error.message}`);

  if (tamanioBytes >= BACKUP_LIMITE_BYTES * UMBRAL_ALERTA_BACKUP) {
    await avisarBackupCercaDelLimite(modulo, tamanioBytes);
  }
}

export type UltimoBackupCompleto = {
  tamanioBytes: number;
  creadoEn: string;
} | null;

/** Último backup "completo" conocido (manual o automático, lo que sea más
 * reciente) — es el que importa para la barra de estado porque es el que
 * más tablas junta y el más cercano al límite de Vercel. */
export async function obtenerUltimoBackupCompleto(
  admin: ReturnType<typeof createAdminClient>
): Promise<UltimoBackupCompleto> {
  const { data, error } = await admin
    .from("backup_historial")
    .select("tamanio_bytes, creado_en")
    .eq("modulo", "completo")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el historial de backups: ${error.message}`);
  if (!data) return null;

  return { tamanioBytes: data.tamanio_bytes, creadoEn: data.creado_en };
}
