import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { fmtFecha, textoPeriodos } from "@/lib/libros";
import { obtenerDatosTablero } from "@/app/(dashboard)/libros/dashboard/datos";

export const maxDuration = 60;

// Excel formateado del tablero de Libros (atrasados, mandatos, envíos) — a
// diferencia de BackupButton (volcado crudo de tablas), acá las columnas
// tienen nombre y las fechas se ven legibles, listo para abrir y leer. Usa
// obtenerDatosTablero(), los mismos números que ve el tablero en pantalla.

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

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 401 });
  }

  const datos = await obtenerDatosTablero();
  const wb = new ExcelJS.Workbook();

  const wsAtrasados = wb.addWorksheet("Más atrasados");
  wsAtrasados.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "CUIT/Tipo societario", key: "tipo", width: 18 },
    { header: "Libro", key: "libro", width: 24 },
    { header: "Atraso", key: "atraso", width: 16 },
    { header: "Responsable", key: "responsable", width: 18 },
  ];
  encabezado(wsAtrasados);
  for (const l of datos.masAtrasados) {
    wsAtrasados.addRow({
      cliente: l.clienteNombre,
      tipo: l.tipoSocietario,
      libro: l.libroNombre,
      atraso: textoPeriodos(l.periodos, l.periodicidad),
      responsable: l.responsableNombre ?? "",
    });
  }

  const wsMandatos = wb.addWorksheet("Mandatos");
  wsMandatos.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "Estado", key: "estado", width: 16 },
    { header: "Vence", key: "vence", width: 14 },
    { header: "Días", key: "dias", width: 10 },
  ];
  encabezado(wsMandatos);
  for (const m of datos.mandatos.vencidos) {
    wsMandatos.addRow({ cliente: m.nombre, estado: "Vencido", vence: fmtFecha(m.vence), dias: m.dias });
  }
  for (const m of datos.mandatos.porVencer) {
    wsMandatos.addRow({ cliente: m.nombre, estado: "Por vencer", vence: fmtFecha(m.vence), dias: m.dias });
  }
  for (const m of datos.mandatos.sinCargar) {
    wsMandatos.addRow({ cliente: m.nombre, estado: "Sin cargar", vence: "", dias: "" });
  }

  const wsEnvios = wb.addWorksheet("Envíos pendientes");
  wsEnvios.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "Año fiscal", key: "anio", width: 12 },
    { header: "Estado balance", key: "estado", width: 16 },
    { header: "Libros faltantes", key: "faltan", width: 16 },
  ];
  encabezado(wsEnvios);
  for (const e of datos.envios.pendientes) {
    wsEnvios.addRow({
      cliente: e.nombre,
      anio: e.anio,
      estado: e.legalizado ? "Legalizado" : "Finalizado",
      faltan: e.faltan,
    });
  }

  if (datos.porResponsable) {
    const wsResp = wb.addWorksheet("Por responsable");
    wsResp.columns = [
      { header: "Responsable", key: "nombre", width: 22 },
      { header: "Empresas a cargo", key: "empresas", width: 16 },
      { header: "Empresas atrasadas (hoy)", key: "empresasHoy", width: 20 },
      { header: "Libros atrasados (hoy)", key: "librosHoy", width: 18 },
      { header: "Puestos al día", key: "puestos", width: 14 },
    ];
    encabezado(wsResp);
    for (const r of datos.porResponsable) {
      wsResp.addRow({
        nombre: r.nombre,
        empresas: r.empresas,
        empresasHoy: r.empresasHoy,
        librosHoy: r.librosHoy,
        puestos: r.puestosAlDia,
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="libros-dashboard-${stampArchivo(new Date())}.xlsx"`,
    },
  });
}
