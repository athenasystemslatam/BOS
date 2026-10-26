import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { obtenerSeguimientoSueldos } from "@/app/(dashboard)/seguimiento/datos";
import type { Tarea } from "@/types";

export const maxDuration = 60;

// Excel formateado del Seguimiento de Sueldos (checklist de recibos, F.931,
// etc. por cliente del período de trabajo actual) — ítem 147, mismo patrón
// que /api/exportar/libros/seguimiento. Usa obtenerSeguimientoSueldos(), los
// mismos clientes y tareas que ve la pantalla. Distinto de
// /api/exportar/nomina-sueldos (nómina para facturar, no el checklist).

function generadoEn(d: Date) {
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function stampArchivo(d: Date) {
  return d
    .toLocaleString("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    })
    .replace(" ", "_")
    .replace(":", "-");
}

function encabezado(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.insertRow(1, [`Generado: ${generadoEn(new Date())}`]);
  ws.mergeCells(1, 1, 1, ws.columns?.length ?? 1);
  ws.getRow(1).font = { italic: true, color: { argb: "FF888888" } };
}

// Mismo criterio que CheckboxCell en SeguimientoClient.tsx: confirmado
// (manual + drive), manual sin confirmar por Drive, o solo sincronizado por
// Drive sin tildar a mano.
function estadoCasilla(manual: boolean, drive: boolean) {
  if (manual && drive) return "Confirmado";
  if (manual) return "Manual (sin Drive)";
  if (drive) return "Drive (sin confirmar)";
  return "";
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const { clientes, tareas, periodo } = await obtenerSeguimientoSueldos();
  const tareasPorCliente = new Map(tareas.map((t) => [t.cliente_id, t]));
  const esMesSAC = periodo?.mes === 6 || periodo?.mes === 12;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Seguimiento");
  ws.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "CUIT", key: "cuit", width: 16 },
    { header: "Liquidador/a", key: "liquidadora", width: 20 },
    { header: "Legajos", key: "legajos", width: 10 },
    { header: "Recibos", key: "recibos", width: 18 },
    { header: "Recibos Q1", key: "recQ1", width: 18 },
    { header: "F.931", key: "f931", width: 18 },
    { header: "Boleta sindical", key: "bolSind", width: 18 },
    { header: "Rúbrica LSD", key: "rubLsd", width: 18 },
    ...(esMesSAC ? [{ header: "SAC", key: "sac", width: 18 }] : []),
    { header: "Alícuota ART", key: "alicuotaArt", width: 14 },
    { header: "Observaciones", key: "observaciones", width: 30 },
    { header: "Nota → Sig. mes", key: "recordatorio", width: 30 },
  ];
  encabezado(ws);

  const vacia: Partial<Tarea> = {
    rec_q1_manual: false, rec_q1_drive: false,
    recibos_manual: false, recibos_drive: false,
    f931_manual: false, f931_drive: false,
    bol_sind_manual: false, bol_sind_drive: false,
    rub_lsd_manual: false, rub_lsd_drive: false,
    sac_manual: false, sac_drive: false,
  };

  for (const c of clientes) {
    const t = tareasPorCliente.get(c.id) ?? vacia;
    ws.addRow({
      cliente: c.nombre,
      cuit: c.cuit ?? "",
      liquidadora: c.liquidadora?.nombre ?? "",
      legajos: t.legajos_cantidad ?? 0,
      recibos: estadoCasilla(!!t.recibos_manual, !!t.recibos_drive),
      recQ1: estadoCasilla(!!t.rec_q1_manual, !!t.rec_q1_drive),
      f931: estadoCasilla(!!t.f931_manual, !!t.f931_drive),
      bolSind: estadoCasilla(!!t.bol_sind_manual, !!t.bol_sind_drive),
      rubLsd: estadoCasilla(!!t.rub_lsd_manual, !!t.rub_lsd_drive),
      ...(esMesSAC ? { sac: estadoCasilla(!!t.sac_manual, !!t.sac_drive) } : {}),
      alicuotaArt: c.alicuota_art ?? "",
      observaciones: t.observaciones ?? "",
      recordatorio: t.recordatorio ?? "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombrePeriodo = periodo ? `${periodo.anio}-${String(periodo.mes).padStart(2, "0")}` : "sin-periodo";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sueldos-seguimiento-${nombrePeriodo}-${stampArchivo(new Date())}.xlsx"`,
    },
  });
}
