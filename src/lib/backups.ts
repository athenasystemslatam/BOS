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
  | "libros";

export const BACKUPS: Record<BackupModulo, { label: string; tablas: string[] }> = {
  "panel-general": {
    label: "Panel General",
    // "equipo" se unificó en "liquidadoras" (ver supabase/unificar_equipo.sql)
    // — no existe como tabla propia en la base.
    tablas: ["clientes", "servicios_cliente", "asignaciones_servicio", "equipo_modulos", "liquidadoras"],
  },
  sueldos: {
    label: "Sueldos",
    tablas: ["periodos", "tareas", "asignaciones", "historial_asignaciones", "sueldos_notas"],
  },
  impuestos: {
    label: "Impuestos",
    tablas: ["impuestos_tareas"],
  },
  contable: {
    label: "Contable",
    tablas: ["balances", "balance_frenados"],
  },
  monotributo: {
    label: "Monotributo",
    tablas: ["monotributo_tareas"],
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
    ],
  },
};

export function esBackupModuloValido(valor: string): valor is BackupModulo {
  return Object.prototype.hasOwnProperty.call(BACKUPS, valor);
}

// PostgREST corta en 1000 filas por defecto — tablas como tareas o
// libros_movimientos ya lo superan.
async function traerTodas(
  admin: ReturnType<typeof createAdminClient>,
  tabla: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas: Record<string, any>[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from(tabla).select("*").order("id").range(desde, desde + 999);
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
 * completa, vía la función SQL listar_tablas_backup). */
export async function armarWorkbookBackup(
  admin: ReturnType<typeof createAdminClient>,
  label: string,
  tablas: string[]
): Promise<ExcelJS.Workbook> {
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
  const nombresUsados = new Set<string>(["Info"]);
  for (const tabla of tablas) {
    let nombre = tabla.slice(0, 31);
    let i = 2;
    while (nombresUsados.has(nombre)) {
      const sufijo = `~${i++}`;
      nombre = tabla.slice(0, 31 - sufijo.length) + sufijo;
    }
    nombresUsados.add(nombre);

    const filas = await traerTodas(admin, tabla);
    const ws = wb.addWorksheet(nombre);

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

  return wb;
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
