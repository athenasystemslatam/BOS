import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { foliosLibres, vencimientoFinal } from "@/lib/libros";
import { configLibros } from "@/lib/librosAutomaticos";
import type { ClienteSocietario, Libro, LibroCatalogo } from "@/types";
import { ClientesLibrosClient, type FilaClienteLibros } from "./ClientesLibrosClient";

export default async function LibrosClientesPage() {
  const admin = createAdminClient();

  const [
    { data: serviciosRaw },
    { data: societariosRaw },
    { data: catalogoRaw },
    { data: librosRaw },
    { data: balancesRaw },
    config,
  ] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable:liquidadoras(nombre), clientes(id, nombre, cuit, estado)")
      .eq("servicio", "libros")
      .eq("estado", true),
    admin.from("clientes_societario").select("*"),
    admin.from("libros_catalogo").select("*").eq("activo", true),
    admin.from("libros").select("cliente_id, catalogo_id, estado, folios_totales, folios_usados"),
    admin.from("balances").select("cliente_id, anio_fiscal, estado").order("anio_fiscal", { ascending: false }),
    configLibros(admin),
  ]);

  const societarios = new Map(
    ((societariosRaw ?? []) as ClienteSocietario[]).map((s) => [s.cliente_id, s])
  );
  const catalogo = (catalogoRaw ?? []) as LibroCatalogo[];
  const libros = (librosRaw ?? []) as Pick<
    Libro,
    "cliente_id" | "catalogo_id" | "estado" | "folios_totales" | "folios_usados"
  >[];

  // El primer balance de cada cliente (orden desc) es el más reciente
  const ultimoBalance = new Map<string, { estado: string; anio: number }>();
  for (const b of (balancesRaw ?? []) as { cliente_id: string; anio_fiscal: number; estado: string }[]) {
    if (!ultimoBalance.has(b.cliente_id)) {
      ultimoBalance.set(b.cliente_id, { estado: b.estado, anio: b.anio_fiscal });
    }
  }

  const filas: FilaClienteLibros[] = (serviciosRaw ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any): FilaClienteLibros | null => {
      const c = s.clientes;
      if (!c) return null;
      const soc = societarios.get(c.id) ?? null;
      const corresponden = soc?.tipo_societario
        ? catalogo.filter((k) => k.tipo_societario === soc.tipo_societario)
        : [];
      const idsCorresponden = new Set(corresponden.map((k) => k.id));
      const delCliente = libros.filter((l) => l.cliente_id === c.id && idsCorresponden.has(l.catalogo_id));
      const activos = delCliente.filter((l) => l.estado === "activo");
      const cargados = new Set(delCliente.filter((l) => l.estado !== "cerrado").map((l) => l.catalogo_id));
      const bal = ultimoBalance.get(c.id) ?? null;

      return {
        id: c.id,
        nombre: c.nombre,
        cuit: c.cuit,
        responsable: s.responsable?.nombre ?? null,
        tipo: soc?.tipo_societario ?? null,
        organismo: soc?.organismo ?? null,
        librosCorresponden: corresponden.length,
        librosCargados: cargados.size,
        sinLibro: delCliente.filter((l) => l.estado === "sin_libro").length,
        pocosFolios: activos.filter((l) => {
          const libres = foliosLibres(l.folios_totales, l.folios_usados);
          return libres != null && libres <= config.umbralFolios;
        }).length,
        mandatoVence: vencimientoFinal(soc),
        // SA y SAS tienen directorio/administración con mandato: sin la designación no hay aviso.
        mandatoSinCargar:
          (soc?.tipo_societario === "SA" || soc?.tipo_societario === "SAS") &&
          !soc?.mandato_designacion &&
          !soc?.mandato_vence_preciso,
        mandato: soc
          ? { mandato_designacion: soc.mandato_designacion, mandato_anios: soc.mandato_anios, mandato_vence_preciso: soc.mandato_vence_preciso ?? null }
          : null,
        balanceEstado: bal?.estado ?? null,
        balanceAnio: bal?.anio ?? null,
      };
    })
    .filter((f): f is FilaClienteLibros => f !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();
  return (
    <ClientesLibrosClient filas={filas} puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))} />
  );
}
