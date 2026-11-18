import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyArgentina } from "@/lib/monotributo";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { fmtFecha, ventana12, type Control } from "@/lib/monotributoFacturacion";
import { controlSiguiente, leerControles, leerUmbral, leerVersiones, versionVigente } from "@/lib/monotributoFacturacionServer";
import type { DatosFicha } from "@/lib/pdf-ficha-facturacion";

// La ficha se genera a pedido, de a una, y no se guarda en ningún lado.
export const dynamic = "force-dynamic";

function aviso(texto: string, status = 400) {
  const html = `<!doctype html><meta charset="utf-8"><title>Ficha</title>
<body style="font-family:system-ui,sans-serif;padding:40px;color:#1f2430">
<p style="font-size:15px">${texto}</p><p><a href="javascript:history.back()" style="color:#7A1F2E">Volver</a></p></body>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const fmtCuit = (c: string) => {
  const d = c.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : c;
};

export async function GET(req: NextRequest) {
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || (!yo.isAdmin && !areas.includes("monotributo"))) return aviso("No tenés acceso a Monotributo.", 403);

  const clienteId = req.nextUrl.searchParams.get("cliente") ?? "";
  const controlId = req.nextUrl.searchParams.get("control") ?? "";
  const admin = createAdminClient();
  const hoy = hoyArgentina();
  const ref = Number(hoy.slice(0, 4)) * 100 + Number(hoy.slice(5, 7));

  const [{ data: cliente }, { data: control }, { data: carga }, { data: tareas }, { versiones }, umbral] = await Promise.all([
    admin.from("clientes").select("nombre, cuit").eq("id", clienteId).maybeSingle(),
    admin.from("monotributo_controles").select("id, anio, mes, fecha_corte, es_cierre_semestre, nota").eq("id", controlId).maybeSingle(),
    admin.from("monotributo_facturacion").select("total_facturado").eq("cliente_id", clienteId).eq("control_id", controlId).maybeSingle(),
    admin.from("monotributo_tareas")
      .select("anio, mes, categoria, deuda_estado, deuda_periodos, deuda_monto, deuda_resuelta")
      .eq("cliente_id", clienteId)
      .order("anio", { ascending: false }).order("mes", { ascending: false }).limit(24),
    leerVersiones(admin),
    leerUmbral(admin),
  ]);
  if (!cliente || !control) return aviso("No se encontró el cliente o el control.", 404);

  type T = { anio: number; mes: number; categoria: string | null; deuda_estado: string; deuda_periodos: string | null; deuda_monto: number | null; deuda_resuelta: boolean };
  const hasta = ((tareas ?? []) as T[]).filter((t) => t.anio * 100 + t.mes <= ref);
  const categoria = hasta.find((t) => t.categoria)?.categoria ?? null;
  if (!categoria) return aviso("Cargá la categoría primero (en la ficha del cliente).");

  const total = (carga as { total_facturado: number | null } | null)?.total_facturado;
  if (total === null || total === undefined) return aviso("Cargá lo facturado en los últimos 12 meses primero.");

  // Categoría y tope SIEMPRE de la tabla vigente en la fecha de generación.
  const version = versionVigente(versiones, hoy);
  const tope = version?.filas.find((f) => f.categoria === categoria)?.tope_anual;
  if (!version || !tope) return aviso("Falta cargar la tabla de categorías de ARCA vigente (Monotributo → Categorías).");

  // Deuda: solo si hay deuda registrada ("Sí") y no está abonada; "sin verificar" no aparece.
  const ultima = hasta[0];
  const deuda = ultima && ultima.deuda_estado === "si" && !ultima.deuda_resuelta
    ? {
        periodos: ultima.deuda_periodos,
        importe: ultima.deuda_monto ? "$ " + Number(ultima.deuda_monto).toLocaleString("es-AR", { minimumFractionDigits: 2 }) : null,
      }
    : null;

  const c = control as Control;
  const { controles } = await leerControles(admin, [c.anio, c.anio + 1]);
  const sig = controlSiguiente(controles, c);
  const v = ventana12(c.fecha_corte);

  const datos: DatosFicha = {
    nombre: (cliente as { nombre: string }).nombre,
    cuit: fmtCuit((cliente as { cuit: string | null }).cuit ?? ""),
    categoria,
    tope,
    vigenteDesde: fmtFecha(version.vigente_desde),
    total: Number(total),
    pct: Math.round((Number(total) * 1000) / tope) / 10,
    ventanaDesde: fmtFecha(v.desde),
    ventanaHasta: fmtFecha(v.hasta),
    mesControl: `${MESES_NOMBRES[c.mes]} ${c.anio}`,
    umbral,
    deuda: deuda && (deuda.periodos || deuda.importe) ? deuda : deuda ? { periodos: "a confirmar", importe: null } : null,
    proximoControl: `${MESES_NOMBRES[sig.mes]} ${sig.anio}${sig.es_cierre_semestre ? ", cierre del semestre" : ""}. Te enviamos la actualización con lo facturado hasta esa fecha.`,
    generado: fmtFecha(hoy),
  };

  const [{ renderToBuffer }, { FichaFacturacionPDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/lib/pdf-ficha-facturacion"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await renderToBuffer(createElement(FichaFacturacionPDF, { d: datos }) as any);
  const archivo = `Control de facturacion - ${datos.nombre} - ${datos.mesControl}.pdf`.replace(/[^\w .-]/g, "");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
