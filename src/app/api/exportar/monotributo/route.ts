import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { ESTADOS_MES, ESTADO_MES_LABEL } from "@/lib/monotributo";
import { armarTableroMonotributo, type Conteo } from "@/lib/monotributoTablero";

// Excel del Dashboard de Monotributo: mismos números que la pantalla (mismo
// cálculo, armarTableroMonotributo) + el detalle por cliente. Alcanza con poder
// VER el módulo (admin, área monotributo, Cobranzas o Administrativo).

const BORDE = { style: "thin" as const, color: { argb: "FFE5E7EB" } };

function ahoraAR() {
  return new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export async function GET(req: NextRequest) {
  const yo = await getCurrentLiquidadora();
  if (!yo) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!yo.isAdmin) {
    const areas = await getAreasDelUsuario();
    if (!areas.includes("monotributo")) {
      return NextResponse.json({ error: "No tenés acceso a Monotributo." }, { status: 401 });
    }
  }

  const def = getMesTrabajoActual();
  const mes = Number(req.nextUrl.searchParams.get("mes")) || def.mes;
  const anio = Number(req.nextUrl.searchParams.get("anio")) || def.anio;
  const resp = req.nextUrl.searchParams.get("resp") || null;
  const t = await armarTableroMonotributo(anio, mes, resp);

  const wb = new ExcelJS.Workbook();
  wb.creator = "BOS";

  // ── Resumen ──
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 38 }, { width: 14 }, { width: 10 }];
  ws.addRow([`Monotributo — Dashboard ${MESES_NOMBRES[mes]} ${anio}`]).font = { bold: true, size: 14 };
  ws.addRow([`Responsable: ${t.respFiltroNombre ?? "Todos"} · Generado: ${ahoraAR()}`]).font = { color: { argb: "FF6B7280" } };
  ws.addRow([`Clientes activos: ${t.total} · Vencimiento de la cuota: ${t.vencimiento.split("-").reverse().join("/")}`]);

  const seccion = (titulo: string, filas: Conteo[] | [string, number | string][]) => {
    ws.addRow([]);
    const h = ws.addRow([titulo, "Cantidad", "%"]);
    h.font = { bold: true };
    h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }; c.border = { bottom: BORDE }; });
    for (const f of filas) {
      const [label, n] = Array.isArray(f) ? f : [f.label, f.n];
      const pct = typeof n === "number" && t.total ? Math.round((n / t.total) * 100) / 100 : null;
      const r = ws.addRow([label, n, pct]);
      if (pct !== null) r.getCell(3).numFmt = "0%";
    }
  };

  seccion("Avance del mes", ESTADOS_MES.map((e) => [ESTADO_MES_LABEL[e], t.estados[e]] as [string, number]));
  seccion("Forma de pago", t.cartera.formaPago);
  seccion("Medio", t.cartera.medio);
  seccion("Envío", t.cartera.envio);
  seccion("Categoría", t.cartera.categoria);
  seccion("Tipo", t.cartera.tipo);
  seccion("Empresa o grupo (los más grandes)", [...t.cartera.grupos, { label: "Sin empresa/grupo", n: t.cartera.sinGrupo }]);
  seccion("Deuda", [
    ["Con deuda", t.deuda.conDeuda], ["Sin deuda", t.deuda.sinDeuda], ["Sin verificar", t.deuda.sinVerificar],
    ["Deuda avisada", t.deuda.avisados], ["Deuda no avisada", t.deuda.noAvisados],
  ]);
  ws.addRow(["Importe total de deuda cargado", t.deuda.importeTotal]).getCell(2).numFmt = '"$" #,##0.00';
  seccion("Intimaciones", t.deuda.intimaciones);
  seccion("Automatización", [
    ["No requieren envío mensual", t.automatizacion.sinEnvio],
    ["Envíos de VEP/QR por mes", t.automatizacion.enviosVep],
    ["Avisos por mes", t.automatizacion.avisos],
    ["Destinatarios de VEP/QR", t.automatizacion.destinatariosVep],
    ["Destinatarios de aviso", t.automatizacion.destinatariosAviso],
    ["Adheridos a débito o tarjeta", t.automatizacion.adheridosDebito],
    ["Paga por su cuenta", t.automatizacion.pagaPorSuCuenta],
    [`Con categoría (de ${t.total})`, t.conCategoria],
  ]);
  seccion("Datos a revisar (marcas pendientes)", [
    ["En rojo", t.revisiones.rojo], ["En amarillo", t.revisiones.amarillo],
    ...t.revisiones.porResponsable.map((r) => [`· ${r.nombre} (rojas / amarillas: ${r.rojo} / ${r.amarillo})`, r.rojo + r.amarillo] as [string, number]),
  ]);

  // ── Por responsable ──
  const wr = wb.addWorksheet("Por responsable");
  wr.columns = [{ header: "Responsable", width: 26 }, { header: "Total", width: 8 },
    ...ESTADOS_MES.map((e) => ({ header: ESTADO_MES_LABEL[e], width: 13 })), { header: "% pagado", width: 10 }];
  wr.getRow(1).font = { bold: true };
  for (const r of t.porResponsable) {
    const fila = wr.addRow([r.nombre, r.total, ...ESTADOS_MES.map((e) => r.estados[e]), r.total ? r.estados.pagado / r.total : 0]);
    fila.getCell(ESTADOS_MES.length + 3).numFmt = "0%";
  }

  // ── Clientes ──
  const wc = wb.addWorksheet("Clientes");
  wc.columns = [
    { header: "Cliente", key: "nombre", width: 34 },
    { header: "CUIT", key: "cuit", width: 14 },
    { header: "Responsable", key: "responsable", width: 18 },
    { header: "Estado del mes", key: "estado", width: 14 },
    { header: "Forma de pago", key: "forma_pago", width: 20 },
    { header: "Medio", key: "medio", width: 11 },
    { header: "Envío", key: "envio", width: 22 },
    { header: "Destinatario", key: "destinatario", width: 40 },
    { header: "Categoría", key: "categoria", width: 12 },
    { header: "Tipo", key: "tipo", width: 15 },
    { header: "Empresa / grupo", key: "grupo", width: 20 },
    { header: "Deuda", key: "deuda", width: 13 },
    { header: "Importe deuda", key: "deuda_monto", width: 14 },
    { header: "Deuda avisada", key: "deuda_avisada", width: 13 },
    { header: "Intimación", key: "intimacion", width: 11 },
    { header: "A revisar (rojo)", key: "marcas_rojo", width: 14 },
    { header: "A revisar (amarillo)", key: "marcas_amarillo", width: 17 },
    { header: "Campos a revisar", key: "marcas_detalle", width: 32 },
  ];
  wc.getRow(1).font = { bold: true };
  wc.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  wc.autoFilter = { from: "A1", to: "R1" };
  for (const c of t.clientes) {
    const r = wc.addRow({ ...c, estado: ESTADO_MES_LABEL[c.estado], deuda_avisada: c.deuda_avisada ? "Sí" : "" });
    r.getCell("deuda_monto").numFmt = '"$" #,##0.00';
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `monotributo_${anio}-${String(mes).padStart(2, "0")}${t.respFiltroNombre ? "_" + t.respFiltroNombre.replace(/[^\w]+/g, "-") : ""}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
