import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import type { LibroIncidencia, LibroMovimiento } from "@/types";
import { MovimientosClient, type LibroParaMovimiento, type ResumenUbicacion } from "./MovimientosClient";

type ServicioRaw = {
  cliente_id: string;
  clientes: { id: string; nombre: string } | null;
};

type LibroRaw = {
  id: string;
  cliente_id: string;
  catalogo_id: string;
  tomo: number;
  estado: string;
  ubicacion: string;
  extraviado: boolean;
};

type MovimientoRaw = LibroMovimiento & {
  registrador: { nombre: string } | null;
};

export default async function MovimientosPage() {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [
    { data: serviciosRaw },
    { data: librosRaw },
    { data: catalogoRaw },
    { data: movimientosRaw },
    { data: incidenciasRaw },
    { data: equipoRaw },
    { data: modulosRaw },
  ] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre)")
      .eq("servicio", "libros")
      .eq("estado", true),
    admin.from("libros").select("id, cliente_id, catalogo_id, tomo, estado, ubicacion, extraviado"),
    admin.from("libros_catalogo").select("id, nombre").order("orden"),
    admin
      .from("libros_movimientos")
      .select("*, registrador:liquidadoras!libros_movimientos_registrado_por_fkey(nombre)")
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(1000),
    admin.from("libros_incidencias").select("*").order("creado_en", { ascending: false }),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "libros"),
  ]);

  const idsEquipo = new Set((modulosRaw ?? []).map((m) => m.equipo_id as string));
  const equipo = ((equipoRaw ?? []) as { id: string; nombre: string }[]).filter((p) =>
    idsEquipo.has(p.id)
  );

  const catalogoPorId = new Map(
    ((catalogoRaw ?? []) as { id: string; nombre: string }[]).map((k) => [k.id, k])
  );

  const libros = (librosRaw ?? []) as LibroRaw[];

  // Resumen de ubicaciones (solo libros activos/cerrados, no sin_libro)
  const resumen: ResumenUbicacion = { estudio: 0, copiadora: 0, cliente: 0, otro: 0, extraviados: 0 };
  for (const l of libros) {
    if (l.extraviado) { resumen.extraviados++; continue; }
    if (l.estado === "sin_libro") continue;
    if (l.ubicacion === "estudio") resumen.estudio++;
    else if (l.ubicacion === "copiadora") resumen.copiadora++;
    else if (l.ubicacion === "cliente") resumen.cliente++;
    else resumen.otro++;
  }

  // Clientes con sus libros
  type ClienteConLibros = { id: string; nombre: string; libros: LibroParaMovimiento[] };
  const librosPorCliente = new Map<string, LibroParaMovimiento[]>();
  for (const l of libros) {
    const nombre = catalogoPorId.get(l.catalogo_id)?.nombre ?? "Libro";
    const arr = librosPorCliente.get(l.cliente_id) ?? [];
    arr.push({
      id: l.id,
      nombre: `${nombre} T.${l.tomo}`,
      tomo: l.tomo,
      ubicacion: l.ubicacion as LibroParaMovimiento["ubicacion"],
      extraviado: l.extraviado,
    });
    librosPorCliente.set(l.cliente_id, arr);
  }

  const clientes: ClienteConLibros[] = (
    (serviciosRaw ?? []) as unknown as ServicioRaw[]
  )
    .filter((s) => s.clientes)
    .map((s) => ({
      id: s.clientes!.id,
      nombre: s.clientes!.nombre,
      libros: librosPorCliente.get(s.clientes!.id) ?? [],
    }))
    .filter((c) => c.libros.length > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // Enriquecer movimientos con nombre del libro y cliente. Los importados del
  // sheet pueden no tener libro (libros_texto) y ser de clientes que hoy no
  // tienen el servicio Libros (o están inactivos): se buscan aparte.
  const libroPorId = new Map(libros.map((l) => [l.id, l]));
  const movs = (movimientosRaw ?? []) as unknown as MovimientoRaw[];
  const incs = (incidenciasRaw ?? []) as unknown as LibroIncidencia[];
  const clienteDe = (x: { libro_id: string | null; cliente_id?: string | null }) =>
    x.cliente_id ?? (x.libro_id ? libroPorId.get(x.libro_id)?.cliente_id ?? null : null);
  const clienteNombrePorId = new Map(clientes.map((c) => [c.id, c.nombre]));
  const faltan = Array.from(
    new Set([...movs, ...incs].map(clienteDe).filter((id): id is string => !!id && !clienteNombrePorId.has(id)))
  );
  if (faltan.length > 0) {
    const { data: otros } = await admin.from("clientes").select("id, nombre").in("id", faltan);
    for (const c of (otros ?? []) as { id: string; nombre: string }[]) clienteNombrePorId.set(c.id, c.nombre);
  }
  const nombreLibro = (x: { libro_id: string | null; libros_texto?: string | null }) => {
    const libro = x.libro_id ? libroPorId.get(x.libro_id) : undefined;
    if (libro) return `${catalogoPorId.get(libro.catalogo_id)?.nombre ?? "Libro"} T.${libro.tomo}`;
    return x.libros_texto?.trim() || "—";
  };

  const movimientos = movs.map((m) => {
    const clienteId = clienteDe(m);
    return {
      ...m,
      importado: m.importado ?? false,
      clienteId,
      libroNombre: nombreLibro(m),
      clienteNombre: clienteId ? clienteNombrePorId.get(clienteId) ?? "—" : "—",
      registradorNombre: m.registrador?.nombre ?? null,
    };
  });

  const incidencias = incs.map((inc) => {
    const clienteId = clienteDe(inc);
    return {
      ...inc,
      importado: inc.importado ?? false,
      clienteId,
      libroNombre: nombreLibro(inc),
      clienteNombre: clienteId ? clienteNombrePorId.get(clienteId) ?? "—" : "—",
    };
  });

  return (
    <MovimientosClient
      clientes={clientes}
      movimientos={movimientos}
      incidencias={incidencias}
      resumen={resumen}
      equipo={equipo}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
    />
  );
}
