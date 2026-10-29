import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { obtenerDatosDashboardSueldos, type ConteoObjetivo } from "@/app/(dashboard)/dashboard/datos";

function resumenObjetivo(c: ConteoObjetivo) {
  const total = c.verde + c.amarillo + c.rojo + c.vencido + c.gris + c.sin_fecha;
  const partes = [`${c.verde}/${total} en objetivo`, `${c.amarillo + c.rojo} fuera`, `${c.gris + c.vencido} pendientes`];
  if (c.sin_fecha > 0) partes.push(`${c.sin_fecha} sin fecha`);
  return partes.join(" · ");
}

export const maxDuration = 60;

// Excel formateado del Dashboard de Sueldos (avance por liquidadora,
// vencimientos F.931, modificaciones fuera de término) — ítem 147, mismo
// patrón que /api/exportar/libros/dashboard. Usa obtenerDatosDashboardSueldos(),
// los mismos números que ve el tablero en pantalla (respeta el mes elegido
// con el MonthSelector).

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

function fmtFecha(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function encabezado(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.insertRow(1, [`Generado: ${generadoEn(new Date())}`]);
  ws.mergeCells(1, 1, 1, ws.columns?.length ?? 1);
  ws.getRow(1).font = { italic: true, color: { argb: "FF888888" } };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const datos = await obtenerDatosDashboardSueldos({
    mes: searchParams.get("mes") ?? undefined,
    anio: searchParams.get("anio") ?? undefined,
  });

  const wb = new ExcelJS.Workbook();

  const wsAvance = wb.addWorksheet("Avance por liquidadora");
  wsAvance.columns = [
    { header: "Liquidadora", key: "nombre", width: 22 },
    { header: "Clientes", key: "clientes", width: 10 },
    { header: "Legajos", key: "legajos", width: 10 },
    { header: "Recibos", key: "recibos", width: 12 },
    { header: "F.931", key: "f931", width: 12 },
    { header: "En objetivo F.931", key: "objF931", width: 44 },
    { header: "En objetivo Recibos", key: "objRecibos", width: 44 },
    ...(datos.esMesSAC ? [{ header: "SAC", key: "sac", width: 10 }] : []),
    { header: "Pendientes", key: "pendientes", width: 12 },
  ];
  encabezado(wsAvance);
  for (const r of datos.resumen) {
    wsAvance.addRow({
      nombre: r.liq.nombre,
      clientes: r.total,
      legajos: r.legajos,
      recibos: `${r.recibosOk}/${r.total}`,
      f931: `${r.f931Ok}/${r.total}`,
      objF931: resumenObjetivo(r.objF931),
      objRecibos: resumenObjetivo(r.objRecibos),
      ...(datos.esMesSAC ? { sac: `${r.sacOk}/${r.total}` } : {}),
      pendientes: r.pendientes,
    });
  }
  wsAvance.addRow({});
  wsAvance.addRow({ nombre: "Total", clientes: datos.total, legajos: datos.totalLegajos });

  const wsF931 = wb.addWorksheet("Vencimientos F.931");
  wsF931.columns = [
    { header: "Grupo (terminación CUIT)", key: "grupo", width: 24 },
    { header: "Objetivo", key: "objetivo", width: 14 },
    { header: "Vencimiento", key: "vencimiento", width: 14 },
    { header: "F.931 presentados", key: "ok", width: 16 },
    { header: "Total", key: "total", width: 10 },
    { header: "Días restantes", key: "dias", width: 14 },
  ];
  encabezado(wsF931);
  for (const g of datos.gruposF931) {
    wsF931.addRow({
      grupo: g.label,
      objetivo: fmtFecha(g.objetivo),
      vencimiento: fmtFecha(g.fecha),
      ok: g.ok,
      total: g.total,
      dias: g.diasRestantes,
    });
  }

  if (datos.alertasPostcierre.length > 0) {
    const wsAlertas = wb.addWorksheet("Modif. fuera de término");
    wsAlertas.columns = [
      { header: "Cliente", key: "cliente", width: 32 },
      { header: "Ítem", key: "campo", width: 18 },
      { header: "Período", key: "periodo", width: 16 },
      { header: "Fecha", key: "fecha", width: 14 },
    ];
    encabezado(wsAlertas);
    const CAMPO_LABELS: Record<string, string> = {
      f931: "F.931", recibos: "Recibos", rec_q1: "Recibos Q1",
      bol_sind: "Boleta sindical", rub_lsd: "Rúbrica LSD", sac: "SAC",
    };
    for (const a of datos.alertasPostcierre) {
      wsAlertas.addRow({
        cliente: (a.cliente as { nombre: string } | null)?.nombre ?? "—",
        campo: CAMPO_LABELS[a.campo] ?? a.campo,
        periodo: (a.periodo as { nombre_mes: string } | null)?.nombre_mes ?? "—",
        fecha: fmtFecha(a.modificado_at),
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sueldos-dashboard-${MESES_NOMBRES[datos.mesActual]}-${datos.anioActual}-${stampArchivo(new Date())}.xlsx"`,
    },
  });
}
