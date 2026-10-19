import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import type { CopiadoFactura } from "@/types";
import { FacturasClient, type CopiadoItem, type FacturaVista } from "./FacturasClient";

type ServicioRaw = {
  cliente_id: string;
  clientes: { id: string; nombre: string } | null;
};

type FacturaRaw = CopiadoFactura & {
  cliente: { nombre: string } | null;
  creador: { nombre: string } | null;
};

type TareaRaw = {
  id: string;
  cliente_id: string;
  libro_id: string;
  estado_id: string;
  fecha_fin: string | null;
  periodo_hasta: string | null;
};

export default async function FacturasPage() {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [
    { data: facturasRaw },
    { data: serviciosRaw },
    { data: vinculosRaw },
    { data: tareasRaw },
    { data: estadosRaw },
    { data: librosRaw },
    { data: catalogoRaw },
    { error: errLibrosTexto },
  ] = await Promise.all([
    admin
      .from("copiadora_facturas")
      .select(
        "*, " +
          "cliente:clientes!copiadora_facturas_cliente_id_fkey(nombre), " +
          "creador:liquidadoras!copiadora_facturas_creado_por_fkey(nombre)"
      )
      .order("creado_en", { ascending: false }),
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre)")
      .eq("servicio", "libros")
      .eq("estado", true),
    admin.from("copiadora_facturas_tareas").select("factura_id, tarea_id"),
    admin.from("libros_tareas").select("id, cliente_id, libro_id, estado_id, fecha_fin, periodo_hasta"),
    admin.from("libros_estados").select("id, es_final"),
    admin.from("libros").select("id, catalogo_id, tomo"),
    admin.from("libros_catalogo").select("id, nombre"),
    // Sin add_libros_etapa9.sql la columna no existe: los libros van en observaciones.
    admin.from("copiadora_facturas").select("libros_texto").limit(1),
  ]);

  const clientes = ((serviciosRaw ?? []) as unknown as ServicioRaw[])
    .filter((s) => s.clientes)
    .map((s) => ({ id: s.clientes!.id, nombre: s.clientes!.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const facturas: FacturaVista[] = ((facturasRaw ?? []) as unknown as FacturaRaw[]).map((f) => ({
    ...f,
    libros_texto: f.libros_texto ?? null,
    clienteNombre: f.cliente?.nombre ?? "—",
  }));

  // Copiados (tareas terminadas) para vincular a las facturas.
  const finales = new Set((estadosRaw ?? []).filter((e) => e.es_final).map((e) => e.id as string));
  const catalogo = new Map((catalogoRaw ?? []).map((k) => [k.id as string, k.nombre as string]));
  const libros = new Map(
    ((librosRaw ?? []) as { id: string; catalogo_id: string; tomo: number }[]).map((l) => [
      l.id,
      `${catalogo.get(l.catalogo_id) ?? "Libro"}${l.tomo > 1 ? ` T${l.tomo}` : ""}`,
    ])
  );
  const vinculadas = new Set((vinculosRaw ?? []).map((v) => v.tarea_id as string));
  const itemPorTarea = new Map<string, CopiadoItem & { clienteId: string }>();
  for (const t of (tareasRaw ?? []) as TareaRaw[]) {
    if (!finales.has(t.estado_id)) continue;
    itemPorTarea.set(t.id, {
      tareaId: t.id,
      clienteId: t.cliente_id,
      nombre: libros.get(t.libro_id) ?? "Libro",
      fecha: t.fecha_fin,
      hasta: t.periodo_hasta,
    });
  }

  const vinculadosPorFactura: Record<string, CopiadoItem[]> = {};
  for (const v of (vinculosRaw ?? []) as { factura_id: string; tarea_id: string }[]) {
    const item = itemPorTarea.get(v.tarea_id);
    if (!item) continue;
    (vinculadosPorFactura[v.factura_id] ??= []).push(item);
  }
  const clientesConFactura = new Set(facturas.map((f) => f.cliente_id));
  const disponiblesPorCliente: Record<string, CopiadoItem[]> = {};
  for (const item of Array.from(itemPorTarea.values())) {
    if (vinculadas.has(item.tareaId) || !clientesConFactura.has(item.clienteId)) continue;
    (disponiblesPorCliente[item.clienteId] ??= []).push(item);
  }
  const porFechaDesc = (a: CopiadoItem, b: CopiadoItem) => (b.fecha ?? "").localeCompare(a.fecha ?? "");
  Object.values(vinculadosPorFactura).forEach((xs) => xs.sort(porFechaDesc));
  Object.values(disponiblesPorCliente).forEach((xs) => xs.sort(porFechaDesc));

  return (
    <FacturasClient
      facturas={facturas}
      clientes={clientes}
      vinculadosPorFactura={vinculadosPorFactura}
      disponiblesPorCliente={disponiblesPorCliente}
      tieneLibrosTexto={!errLibrosTexto}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
    />
  );
}
