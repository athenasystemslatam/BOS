import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { sincronizarLibrosAutomaticos } from "@/lib/librosAutomaticos";
import type { LibroPedido, LibroPedidoSeguimiento } from "@/types";
import { PedidosClient, type ClienteConLibros } from "./PedidosClient";

type PedidoRaw = LibroPedido & {
  responsable: { nombre: string } | null;
  creador: { nombre: string } | null;
};

export default async function PedidosPage() {
  await sincronizarLibrosAutomaticos();
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [
    { data: pedidosRaw },
    { data: seguimientosRaw },
    { data: serviciosRaw },
    { data: librosRaw },
    { data: catalogoRaw },
    { data: equipoRaw },
    { data: modulosRaw },
  ] = await Promise.all([
    admin
      .from("libros_pedidos")
      .select(
        "*, " +
          "responsable:liquidadoras!libros_pedidos_responsable_id_fkey(nombre), " +
          "creador:liquidadoras!libros_pedidos_creado_por_fkey(nombre)"
      )
      .order("creado_en", { ascending: false }),
    admin
      .from("libros_pedidos_seguimientos")
      .select("*")
      .order("fecha", { ascending: false }),
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre)")
      .eq("servicio", "libros")
      .eq("estado", true),
    admin.from("libros").select("id, cliente_id, catalogo_id, tomo, estado").neq("estado", "sin_libro"),
    admin.from("libros_catalogo").select("id, nombre").order("orden"),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "libros"),
  ]);

  const idsEquipo = new Set((modulosRaw ?? []).map((m) => m.equipo_id as string));
  const equipo = ((equipoRaw ?? []) as { id: string; nombre: string }[]).filter((p) =>
    idsEquipo.has(p.id)
  );

  const seguimientosPorPedido = new Map<string, LibroPedidoSeguimiento[]>();
  for (const s of (seguimientosRaw ?? []) as LibroPedidoSeguimiento[]) {
    const arr = seguimientosPorPedido.get(s.pedido_id) ?? [];
    arr.push(s);
    seguimientosPorPedido.set(s.pedido_id, arr);
  }

  const catalogoPorId = new Map(
    ((catalogoRaw ?? []) as { id: string; nombre: string }[]).map((k) => [k.id, k])
  );
  const librosPorCliente = new Map<string, { id: string; nombre: string; tomo: number }[]>();
  for (const l of (librosRaw ?? []) as {
    id: string;
    cliente_id: string;
    catalogo_id: string;
    tomo: number;
    estado: string;
  }[]) {
    const nombre = catalogoPorId.get(l.catalogo_id)?.nombre ?? "Libro";
    const arr = librosPorCliente.get(l.cliente_id) ?? [];
    arr.push({ id: l.id, nombre: `${nombre} T.${l.tomo}`, tomo: l.tomo });
    librosPorCliente.set(l.cliente_id, arr);
  }

  const clientes: ClienteConLibros[] = (
    (serviciosRaw ?? []) as unknown as {
      cliente_id: string;
      clientes: { id: string; nombre: string } | null;
    }[]
  )
    .filter((s) => s.clientes)
    .map((s) => ({
      id: s.clientes!.id,
      nombre: s.clientes!.nombre,
      libros: librosPorCliente.get(s.clientes!.id) ?? [],
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const pedidos = ((pedidosRaw ?? []) as unknown as PedidoRaw[]).map((p) => ({
    ...p,
    checklist: p.checklist ?? [],
    prioridad: p.prioridad ?? null,
    mandato_vence: p.mandato_vence ?? null,
    responsableNombre: p.responsable?.nombre ?? null,
    creadorNombre: p.creador?.nombre ?? null,
  }));

  return (
    <PedidosClient
      pedidos={pedidos}
      seguimientosPorPedido={seguimientosPorPedido}
      clientes={clientes}
      equipo={equipo}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
      yoId={yo?.id ?? null}
    />
  );
}
