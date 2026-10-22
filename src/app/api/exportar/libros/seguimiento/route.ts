import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { fmtFecha, ORIGEN_TAREA_LABEL } from "@/lib/libros";
import { obtenerColaLibros } from "@/app/(dashboard)/libros/datos";

export const maxDuration = 60;

// Excel formateado del Seguimiento de Libros (cola de tareas + puesta al
// día) — a diferencia de BackupButton (volcado crudo de tablas), acá las
// columnas tienen nombre y las fechas se ven legibles. Usa
// obtenerColaLibros(), los mismos datos que ve la pantalla.

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

  const datos = await obtenerColaLibros();
  const nombreEstado = new Map(datos.estados.map((e) => [e.id, e.nombre]));
  const wb = new ExcelJS.Workbook();

  const wsCola = wb.addWorksheet("Cola de tareas");
  wsCola.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "CUIT", key: "cuit", width: 16 },
    { header: "Libro", key: "libro", width: 24 },
    { header: "Tomo", key: "tomo", width: 8 },
    { header: "Origen", key: "origen", width: 16 },
    { header: "Estado", key: "estado", width: 18 },
    { header: "Prioridad", key: "prioridad", width: 10 },
    { header: "Responsable", key: "responsable", width: 18 },
    { header: "Último copiado", key: "ultimo", width: 14 },
    { header: "Exigible desde", key: "exigible", width: 14 },
    { header: "Fecha límite", key: "limite", width: 14 },
  ];
  encabezado(wsCola);
  for (const t of datos.tareas.filter((t) => !t.esFinal)) {
    wsCola.addRow({
      cliente: t.clienteNombre,
      cuit: t.clienteCuit ?? "",
      libro: t.libroNombre,
      tomo: t.tomo,
      origen: ORIGEN_TAREA_LABEL[t.origen],
      estado: nombreEstado.get(t.estado_id) ?? "",
      prioridad: t.prioridad,
      responsable: t.responsableNombre ?? "",
      ultimo: fmtFecha(t.ultimoCopiado),
      exigible: fmtFecha(t.exigible),
      limite: fmtFecha(t.fecha_limite),
    });
  }

  const wsPuesta = wb.addWorksheet("Puesta al día");
  wsPuesta.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "CUIT", key: "cuit", width: 16 },
    { header: "Al día", key: "alDia", width: 10 },
    { header: "Total", key: "total", width: 10 },
    { header: "Sin cargar", key: "sinCargar", width: 12 },
    { header: "Libro atrasado", key: "libro", width: 24 },
    { header: "Tomo", key: "tomo", width: 8 },
    { header: "Último copiado", key: "ultimo", width: 14 },
    { header: "Exigible desde", key: "exigible", width: 14 },
    { header: "En cola", key: "enCola", width: 10 },
  ];
  encabezado(wsPuesta);
  for (const c of datos.puestaAlDia) {
    if (c.atrasados.length === 0 && c.sinDato.length === 0) {
      wsPuesta.addRow({ cliente: c.nombre, cuit: c.cuit ?? "", alDia: c.alDia, total: c.total, sinCargar: c.sinCargar });
      continue;
    }
    for (const l of [...c.atrasados, ...c.sinDato]) {
      wsPuesta.addRow({
        cliente: c.nombre,
        cuit: c.cuit ?? "",
        alDia: c.alDia,
        total: c.total,
        sinCargar: c.sinCargar,
        libro: l.nombre,
        tomo: l.tomo,
        ultimo: fmtFecha(l.ultimo),
        exigible: fmtFecha(l.exigible),
        enCola: l.enCola ? "Sí" : "No",
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="libros-seguimiento-${stampArchivo(new Date())}.xlsx"`,
    },
  });
}
