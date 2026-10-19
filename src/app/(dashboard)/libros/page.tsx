import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import {
  diasHasta,
  foliosLibres,
  hoyISO,
  libroAlDia,
  mandatoVencido,
  prioridadSugerida,
} from "@/lib/libros";
import { sincronizarLibrosAutomaticos } from "@/lib/librosAutomaticos";
import type { ClienteSocietario, Libro, LibroCatalogo, LibroEstado, LibroPedido, LibroTarea } from "@/types";
import {
  SeguimientoLibrosClient,
  type AvisoBalance,
  type AvisoRenovacion,
  type ClienteCola,
  type PuestaAlDiaCliente,
  type TareaVista,
} from "./SeguimientoLibrosClient";

type ServicioRaw = {
  cliente_id: string;
  responsable_id: string | null;
  responsable: { nombre: string } | null;
  clientes: { id: string; nombre: string; cierre_ejercicio_mes: number | null; cierre_ejercicio_dia: number | null } | null;
};

type BalanceRaw = { id: string; cliente_id: string; anio_fiscal: number; fecha_cierre: string; estado: string };

export default async function SeguimientoLibrosPage() {
  await sincronizarLibrosAutomaticos();

  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();
  const hoy = hoyISO();

  const [
    { data: serviciosRaw },
    { data: societariosRaw },
    { data: catalogoRaw },
    { data: librosRaw },
    { data: tareasRaw },
    { data: estadosRaw },
    { data: equipoRaw },
    { data: modulosRaw },
    { data: balancesRaw },
    { data: pedidosRaw },
    { data: renovacionesRaw },
  ] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, responsable:liquidadoras(nombre), clientes(id, nombre, cierre_ejercicio_mes, cierre_ejercicio_dia)")
      .eq("servicio", "libros")
      .eq("estado", true),
    admin.from("clientes_societario").select("*"),
    admin.from("libros_catalogo").select("*").order("orden"),
    admin.from("libros").select("*"),
    admin.from("libros_tareas").select("*"),
    admin.from("libros_estados").select("*").order("orden"),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "libros"),
    admin.from("balances").select("id, cliente_id, anio_fiscal, fecha_cierre, estado"),
    admin.from("libros_pedidos").select("id").not("fecha_limite", "is", null),
    admin
      .from("libros_pedidos")
      .select("*")
      .eq("tipo", "renovacion_autoridades")
      .in("estado", ["abierto", "esperando_cliente", "esperando_tercero", "aprobado"]),
  ]);

  const servicios = ((serviciosRaw ?? []) as unknown as ServicioRaw[]).filter((s) => s.clientes);
  const societarios = new Map(((societariosRaw ?? []) as ClienteSocietario[]).map((s) => [s.cliente_id, s]));
  const catalogo = new Map(((catalogoRaw ?? []) as LibroCatalogo[]).map((k) => [k.id, k]));
  const libros = (librosRaw ?? []) as Libro[];
  const librosPorId = new Map(libros.map((l) => [l.id, l]));
  const tareas = (tareasRaw ?? []) as LibroTarea[];
  const estados = (estadosRaw ?? []) as LibroEstado[];
  const finales = new Set(estados.filter((e) => e.es_final).map((e) => e.id));
  const idsEquipo = new Set((modulosRaw ?? []).map((m) => m.equipo_id as string));
  const equipo = (equipoRaw ?? []).filter((p) => idsEquipo.has(p.id as string)) as { id: string; nombre: string }[];
  const nombrePersona = new Map(((equipoRaw ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
  const balances = new Map(((balancesRaw ?? []) as BalanceRaw[]).map((b) => [b.id, b]));
  const pedidosConFecha = new Set((pedidosRaw ?? []).map((p) => p.id as string));

  const clientes = new Map<string, ClienteCola & { cierre: { mes: number | null; dia: number | null } }>();
  for (const s of servicios) {
    const c = s.clientes!;
    const soc = societarios.get(c.id);
    clientes.set(c.id, {
      id: c.id,
      nombre: c.nombre,
      responsableId: s.responsable_id,
      responsableNombre: s.responsable?.nombre ?? null,
      mandatoVencido: mandatoVencido(soc?.mandato_designacion ?? null, soc?.mandato_anios ?? null, hoy),
      cierre: { mes: c.cierre_ejercicio_mes, dia: c.cierre_ejercicio_dia },
    });
  }

  // Último copiado del libro tomando todos sus tomos.
  const ultimoPorLibro = new Map<string, string | null>();
  for (const l of libros) {
    const clave = `${l.cliente_id}|${l.catalogo_id}`;
    const actual = ultimoPorLibro.get(clave) ?? null;
    if (l.ultimo_periodo_copiado && (!actual || l.ultimo_periodo_copiado > actual)) {
      ultimoPorLibro.set(clave, l.ultimo_periodo_copiado);
    } else if (!ultimoPorLibro.has(clave)) {
      ultimoPorLibro.set(clave, null);
    }
  }

  const vistas: TareaVista[] = tareas.map((t) => {
    const libro = librosPorId.get(t.libro_id) ?? null;
    const item = libro ? catalogo.get(libro.catalogo_id) : undefined;
    const cliente = clientes.get(t.cliente_id);
    const balance = t.balance_id ? balances.get(t.balance_id) : undefined;
    const sugerida = prioridadSugerida(t, {
      pedidoConFecha: !!t.pedido_id && pedidosConFecha.has(t.pedido_id),
      balanceEstado: balance?.estado ?? null,
    });
    const ultimo = libro ? ultimoPorLibro.get(`${libro.cliente_id}|${libro.catalogo_id}`) ?? null : null;
    const exigible =
      libro && item && cliente
        ? libroAlDia(libro, ultimo, libro.periodicidad ?? item.periodicidad, cliente.cierre, hoy).exigible
        : null;
    return {
      ...t,
      clienteNombre: cliente?.nombre ?? "(cliente sin servicio Libros)",
      libroNombre: item?.nombre ?? "Libro",
      tomo: libro?.tomo ?? 1,
      libres: libro ? foliosLibres(libro.folios_totales, libro.folios_usados) : null,
      ultimoCopiado: ultimo,
      exigible,
      esFinal: finales.has(t.estado_id),
      prioridad: t.prioridad_manual ?? sugerida.prioridad,
      sugerida: sugerida.prioridad,
      motivoSugerido: sugerida.motivo,
      responsableNombre: t.responsable_id ? nombrePersona.get(t.responsable_id) ?? null : null,
    };
  });

  const abiertas = vistas.filter((t) => !t.esFinal);
  const enCola = new Set(abiertas.map((t) => t.libro_id));

  // Aviso: tareas del envío anual abiertas por un balance legalizado o finalizado.
  const avisos = new Map<string, AvisoBalance>();
  for (const t of abiertas) {
    const b = t.origen === "balance" && t.balance_id ? balances.get(t.balance_id) : undefined;
    if (!b || (b.estado !== "legalizado" && b.estado !== "finalizado")) continue;
    const aviso = avisos.get(t.cliente_id) ?? {
      clienteId: t.cliente_id,
      nombre: t.clienteNombre,
      anio: b.anio_fiscal,
      legalizado: b.estado === "legalizado",
      libros: 0,
    };
    aviso.libros++;
    avisos.set(t.cliente_id, aviso);
  }

  const avisosRenovacion: AvisoRenovacion[] = ((renovacionesRaw ?? []) as LibroPedido[])
    .filter((p) => clientes.has(p.cliente_id))
    .map((p) => ({
      clienteId: p.cliente_id,
      nombre: clientes.get(p.cliente_id)!.nombre,
      vence: p.mandato_vence ?? null,
      dias: p.mandato_vence ? diasHasta(p.mandato_vence) : null,
      hechos: (p.checklist ?? []).filter((i) => i.hecho).length,
      pasos: (p.checklist ?? []).length,
    }))
    .sort((a, b) => (a.dias ?? -9999) - (b.dias ?? -9999));

  const puestaAlDia: PuestaAlDiaCliente[] = [];
  for (const cliente of Array.from(clientes.values())) {
    const tipo = societarios.get(cliente.id)?.tipo_societario;
    if (!tipo) continue;
    const corresponden = Array.from(catalogo.values()).filter((k) => k.activo && k.tipo_societario === tipo);
    let alDia = 0;
    let total = 0;
    let sinCargar = 0;
    const atrasados: PuestaAlDiaCliente["atrasados"] = [];
    const sinDato: PuestaAlDiaCliente["sinDato"] = [];
    for (const item of corresponden) {
      const tomos = libros
        .filter((l) => l.cliente_id === cliente.id && l.catalogo_id === item.id)
        .sort((a, b) => b.tomo - a.tomo);
      const vigente = tomos.find((l) => l.estado === "activo") ?? tomos.find((l) => l.estado === "sin_libro");
      if (!vigente) {
        sinCargar++;
        continue;
      }
      const ultimo = ultimoPorLibro.get(`${cliente.id}|${item.id}`) ?? null;
      const r = libroAlDia(vigente, ultimo, vigente.periodicidad ?? item.periodicidad, cliente.cierre, hoy);
      if (r.alDia === null) continue;
      total++;
      if (r.alDia) {
        alDia++;
        continue;
      }
      const fila = {
        libroId: vigente.id,
        nombre: item.nombre,
        tomo: vigente.tomo,
        ultimo,
        exigible: r.exigible,
        sinLibro: vigente.estado === "sin_libro",
        enCola: enCola.has(vigente.id),
      };
      // Sin último copiado cargado no se sabe si está atrasado: hay que relevar.
      if (!ultimo && !fila.sinLibro) sinDato.push(fila);
      else atrasados.push(fila);
    }
    puestaAlDia.push({
      clienteId: cliente.id,
      nombre: cliente.nombre,
      responsableId: cliente.responsableId,
      alDia,
      total,
      sinCargar,
      atrasados,
      sinDato,
    });
  }
  puestaAlDia.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <SeguimientoLibrosClient
      tareas={vistas}
      clientes={Array.from(clientes.values()).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        responsableId: c.responsableId,
        responsableNombre: c.responsableNombre,
        mandatoVencido: c.mandatoVencido,
      }))}
      puestaAlDia={puestaAlDia}
      avisosBalance={Array.from(avisos.values()).sort(
        (a, b) => Number(b.legalizado) - Number(a.legalizado) || a.nombre.localeCompare(b.nombre, "es")
      )}
      avisosRenovacion={avisosRenovacion}
      estados={estados.filter((e) => e.activo)}
      equipo={equipo}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
    />
  );
}
