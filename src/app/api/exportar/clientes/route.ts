import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cliente, VistEmpresa } from "@/types";

// Exportación de la ficha completa de clientes a Excel — un botón "Exportar
// todo" en Panel General (sin ?id) y un ícono por fila para exportar uno
// solo (?id=<uuid>). Incluye las contraseñas de las claves de acceso a
// pedido explícito (ver README/CLAUDE.md): el archivo queda tan sensible
// como esos sistemas, ojo con dónde se guarda o se manda.

function formatCuit(raw: string) {
  return raw.length === 11 ? `${raw.slice(0, 2)}-${raw.slice(2, 10)}-${raw.slice(10)}` : raw;
}

function si(v: boolean | null | undefined) {
  return v ? "Sí" : "No";
}

function fecha(raw: string | null | undefined) {
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("es-AR");
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No autorizado." },
      { status: 401 }
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  const admin = createAdminClient();

  const [{ data: vista, error: errVista }, { data: clientes, error: errClientes }] =
    await Promise.all([
      id
        ? admin.from("vista_empresas").select("*").eq("id", id)
        : admin.from("vista_empresas").select("*").order("nombre"),
      id
        ? admin.from("clientes").select("*").eq("id", id)
        : admin.from("clientes").select("*").order("nombre"),
    ]);

  if (errVista || errClientes || !clientes) {
    return NextResponse.json(
      { error: errVista?.message ?? errClientes?.message ?? "Error al leer los clientes." },
      { status: 500 }
    );
  }
  if (clientes.length === 0) {
    return NextResponse.json({ error: "No se encontró el cliente." }, { status: 404 });
  }

  const vistaPorId = new Map((vista as VistEmpresa[] | null ?? []).map((v) => [v.id, v]));

  const wb = new ExcelJS.Workbook();

  const wsClientes = wb.addWorksheet("Clientes");
  wsClientes.columns = [
    { header: "Nombre", key: "nombre", width: 32 },
    { header: "CUIT", key: "cuit", width: 16 },
    { header: "Tipo", key: "tipo", width: 14 },
    { header: "Estado", key: "estado", width: 10 },
    { header: "Resp. Sueldos", key: "resp_sueldos", width: 18 },
    { header: "Resp. Impuestos IVA", key: "resp_iva", width: 18 },
    { header: "Resp. Impuestos IIBB", key: "resp_iibb", width: 18 },
    { header: "Resp. Impuestos Seg.Hig.", key: "resp_seh", width: 20 },
    { header: "Resp. Contable", key: "resp_contable", width: 18 },
    { header: "Resp. Monotributo", key: "resp_monotributo", width: 18 },
    { header: "Resp. Libros", key: "resp_libros", width: 18 },
    { header: "Emails de contacto", key: "emails", width: 35 },
    { header: "CUIL ARCA", key: "cuil_arca", width: 16 },
    { header: "ART", key: "art", width: 16 },
    { header: "Alícuota ART", key: "alicuota_art", width: 14 },
    { header: "Red bancaria", key: "red_bancaria", width: 16 },
    { header: "Quincenal", key: "quincenal", width: 10 },
    { header: "Sindicato", key: "sindicato", width: 10 },
    { header: "Nombre sindicato", key: "sindicato_nombre", width: 20 },
    { header: "Rúbrica LSD", key: "lsd", width: 11 },
    { header: "Jurisdicción", key: "jurisdiccion", width: 12 },
    { header: "Fecha alta empleador", key: "fecha_alta_empleador", width: 18 },
    { header: "Observaciones", key: "observaciones", width: 30 },
    { header: "Fecha alta en BOS", key: "fecha_alta", width: 16 },
  ];
  wsClientes.getRow(1).font = { bold: true };

  const wsClaves = wb.addWorksheet("Claves de acceso");
  wsClaves.columns = [
    { header: "Cliente", key: "cliente", width: 32 },
    { header: "CUIT", key: "cuit", width: 16 },
    { header: "Sistema", key: "sistema", width: 20 },
    { header: "Usuario", key: "usuario", width: 20 },
    { header: "Contraseña", key: "contrasena", width: 20 },
    { header: "Módulo", key: "modulo", width: 14 },
  ];
  wsClaves.getRow(1).font = { bold: true };

  for (const c of clientes as Cliente[]) {
    const v = vistaPorId.get(c.id);
    wsClientes.addRow({
      nombre: c.nombre,
      cuit: formatCuit(c.cuit),
      tipo: c.tipo_contribuyente,
      estado: c.estado === "activo" ? "Activa" : "Inactiva",
      resp_sueldos: v?.responsable_sueldos ?? "",
      resp_iva: v?.responsable_impuestos_iva ?? "",
      resp_iibb: v?.responsable_impuestos_iibb ?? "",
      resp_seh: v?.responsable_impuestos_seh ?? "",
      resp_contable: v?.responsable_contable ?? "",
      resp_monotributo: v?.responsable_monotributo ?? "",
      resp_libros: v?.responsable_libros ?? "",
      emails: (c.emails_contacto ?? []).join(", "),
      cuil_arca: c.cuil_arca ?? "",
      art: c.art ?? "",
      alicuota_art: c.alicuota_art ?? "",
      red_bancaria: c.red_bancaria ?? "",
      quincenal: si(c.es_quincenal),
      sindicato: si(c.tiene_sindicato),
      sindicato_nombre: c.sindicato_nombre ?? "",
      lsd: si(c.tiene_rubrica_lsd),
      jurisdiccion: c.jurisdiccion ?? "",
      fecha_alta_empleador: fecha(c.fecha_alta_empleador),
      observaciones: c.observaciones ?? "",
      fecha_alta: fecha(c.fecha_alta),
    });

    for (const clave of c.claves_acceso ?? []) {
      wsClaves.addRow({
        cliente: c.nombre,
        cuit: formatCuit(c.cuit),
        sistema: clave.sistema,
        usuario: clave.usuario,
        contrasena: clave.contrasena,
        modulo: clave.modulo || "General",
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombreArchivo = id
    ? `${(clientes[0] as Cliente).nombre.replace(/[^\w\-]+/g, "_")}.xlsx`
    : `clientes-BOS-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
