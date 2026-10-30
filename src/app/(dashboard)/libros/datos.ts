import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import {
  diasHasta,
  vencimientoFinal,
  foliosLibres,
  hoyISO,
  libroAlDia,
  mandatoVencido,
  prioridadSugerida,
} from "@/lib/libros";
import { configLibros, sincronizarLibrosAutomaticos } from "@/lib/librosAutomaticos";
import type { ClienteSocietario, Libro, LibroCatalogo, LibroEstado, LibroPedido, LibroTarea } from "@/types";
import type {
  AvisoBalance,
  AvisoMandatos,
  ClienteAgregar,
  ClienteCola,
  PuestaAlDiaCliente,
  TareaVista,
} from "./SeguimientoLibrosClient";
import type { Persona } from "./NuevaTareaModal";

type ServicioRaw = {
  cliente_id: string;
  responsable_id: string | null;
  responsable: { nombre: string } | null;
  clientes: { id: string; nombre: string; cuit: string | null; cierre_ejercicio_mes: number | null; cierre_ejercicio_dia: number | null } | null;
};

type BalanceRaw = { id: string; cliente_id: string; anio_fiscal: number; fecha_cierre: string; estado: string };

export type DatosColaLibros = {
  tareas: TareaVista[];
  clientes: ClienteCola[];
  puestaAlDia: PuestaAlDiaCliente[];
  avisosBalance: AvisoBalance[];
  avisoMandatos: AvisoMandatos;
  clientesAgregar: ClienteAgregar[];
  estados: LibroEstado[];
  equipo: Persona[];
  puedeEditar: boolean;
  esAdmin: boolean;
};

// Extraído de page.tsx (antes todo esto vivía ahí adentro) para que
// /api/exportar/libros/seguimiento pueda generar el Excel con la misma cola
// y puesta al día que ve la pantalla, sin duplicar esta lógica aparte.
export async function obtenerColaLibros(): Promise<DatosColaLibros> {
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
    { data: actasRaw },
  ] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, responsable:liquidadoras(nombre), clientes!inner(id, nombre, cuit, estado, cierre_ejercicio_mes, cierre_ejercicio_dia)")
      .eq("servicio", "libros")
      .eq("clientes.estado", "activo")
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
    admin
      .from("libros_movimientos")
      .select("libro_id, acta_numero, fecha")
      .eq("tipo", "entrada")
      .eq("destino", "copiadora")
      .not("acta_numero", "is", null)
      .order("fecha", { ascending: false }),
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
  const renovacionesVencidas = new Set(
    ((renovacionesRaw ?? []) as LibroPedido[]).filter((p) => p.mandato_vence && p.mandato_vence < hoy).map((p) => p.id)
  );
  // Última acta copiada por libro_id (los más recientes vienen primero por el order).
  const ultimaActaPorLibroId = new Map<string, { acta: string; fecha: string }>();
  for (const a of ((actasRaw ?? []) as { libro_id: string | null; acta_numero: string | null; fecha: string }[])) {
    if (a.libro_id && a.acta_numero && !ultimaActaPorLibroId.has(a.libro_id)) {
      ultimaActaPorLibroId.set(a.libro_id, { acta: a.acta_numero, fecha: a.fecha });
    }
  }
  const primerAviso = (await configLibros(admin)).avisosMandato[0] ?? 90;

  const clientes = new Map<string, ClienteCola & { cierre: { mes: number | null; dia: number | null } }>();
  for (const s of servicios) {
    const c = s.clientes!;
    const soc = societarios.get(c.id);
    clientes.set(c.id, {
      id: c.id,
      nombre: c.nombre,
      cuit: c.cuit,
      responsableId: s.responsable_id,
      responsableNombre: s.responsable?.nombre ?? null,
      mandatoVencido: mandatoVencido(soc, hoy),
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

  const vistas: TareaVista[] = tareas.filter((t) => clientes.has(t.cliente_id)).map((t) => {
    const libro = librosPorId.get(t.libro_id) ?? null;
    const item = libro ? catalogo.get(libro.catalogo_id) : undefined;
    const cliente = clientes.get(t.cliente_id);
    const balance = t.balance_id ? balances.get(t.balance_id) : undefined;
    const sugerida = prioridadSugerida(t, {
      pedidoConFecha: !!t.pedido_id && pedidosConFecha.has(t.pedido_id),
      balanceEstado: balance?.estado ?? null,
      renovacionVencida: !!t.pedido_id && renovacionesVencidas.has(t.pedido_id),
      sinLibro: libro?.estado === "sin_libro",
    });
    const ultimo = libro ? ultimoPorLibro.get(`${libro.cliente_id}|${libro.catalogo_id}`) ?? null : null;
    const exigible =
      libro && item && cliente
        ? libroAlDia(libro, ultimo, libro.periodicidad ?? item.periodicidad, cliente.cierre, hoy).exigible
        : null;
    return {
      ...t,
      clienteNombre: cliente?.nombre ?? "(cliente sin servicio Libros)",
      clienteCuit: cliente?.cuit ?? null,
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
      ultimaCopiadaActa: t.libro_id ? (ultimaActaPorLibroId.get(t.libro_id) ?? null) : null,
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

  const avisoMandatos: AvisoMandatos = { vencidos: 0, proximos: 0, dias: primerAviso };
  for (const c of Array.from(clientes.values())) {
    const vence = vencimientoFinal(societarios.get(c.id));
    if (!vence) continue;
    const dias = diasHasta(vence);
    if (dias < 0) avisoMandatos.vencidos++;
    else if (dias <= primerAviso) avisoMandatos.proximos++;
  }

  // "+ Agregar": libros cargados de cada cliente y los del catálogo que faltan.
  const clientesAgregar: ClienteAgregar[] = Array.from(clientes.values())
    .map((c) => {
      const tipo = societarios.get(c.id)?.tipo_societario ?? null;
      const delCliente = libros.filter((l) => l.cliente_id === c.id && l.estado !== "cerrado");
      const cargados = new Set(delCliente.map((l) => l.catalogo_id));
      return {
        id: c.id,
        nombre: c.nombre,
        cuit: c.cuit,
        responsableId: c.responsableId,
        tipo,
        libros: delCliente
          .map((l) => ({
            id: l.id,
            nombre: catalogo.get(l.catalogo_id)?.nombre ?? "Libro",
            tomo: l.tomo,
            sinLibro: l.estado === "sin_libro",
            enCola: enCola.has(l.id),
          }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
        faltantes: tipo
          ? Array.from(catalogo.values())
              .filter((k) => k.activo && k.tipo_societario === tipo && !cargados.has(k.id))
              .map((k) => ({ catalogoId: k.id, nombre: k.nombre }))
          : [],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

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
      cuit: cliente.cuit,
      responsableId: cliente.responsableId,
      alDia,
      total,
      sinCargar,
      atrasados,
      sinDato,
    });
  }
  puestaAlDia.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    tareas: vistas,
    clientes: Array.from(clientes.values()).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      cuit: c.cuit,
      responsableId: c.responsableId,
      responsableNombre: c.responsableNombre,
      mandatoVencido: c.mandatoVencido,
    })),
    puestaAlDia,
    avisosBalance: Array.from(avisos.values()).sort(
      (a, b) => Number(b.legalizado) - Number(a.legalizado) || a.nombre.localeCompare(b.nombre, "es")
    ),
    avisoMandatos,
    clientesAgregar,
    estados: estados.filter((e) => e.activo),
    equipo,
    puedeEditar: !yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros")),
    esAdmin: !!yo?.isAdmin,
  };
}
