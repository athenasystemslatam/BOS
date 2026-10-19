import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { diasHasta, hoyISO, prioridadSugerida, vencimientoMandato } from "@/lib/libros";
import { configLibros } from "@/lib/librosAutomaticos";
import {
  FECHA_BASE,
  armarSnapshot,
  calcularAtraso,
  guardarSnapshots,
  type Snapshot,
} from "@/lib/librosTablero";
import type { LibroTarea, PrioridadLibro } from "@/types";
import { TableroClient, type DatosTablero } from "./TableroClient";

function restarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00");
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lunes de la semana de la fecha, para agrupar la evolución por semana.
function lunes(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return restarDias(fecha, (d.getDay() + 6) % 7);
}

export default async function TableroLibrosPage() {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const hoy = hoyISO();

  const atraso = await calcularAtraso(admin, hoy);
  const tablaSnapshots = await guardarSnapshots(admin, hoy, atraso);

  const [
    { data: snapshotsRaw },
    config,
    { data: tareasRaw },
    { data: estadosRaw },
    { data: balancesRaw },
    { data: pedidosRaw },
    { data: serviciosRaw },
    { data: societariosRaw },
  ] = await Promise.all([
    tablaSnapshots
      ? admin.from("libros_snapshot").select("*").order("fecha")
      : Promise.resolve({ data: [] as Snapshot[] }),
    configLibros(admin),
    admin
      .from("libros_tareas")
      .select("id, cliente_id, origen, balance_id, pedido_id, fecha_limite, material_listo, prioridad_manual, estado_id, fecha_fin, creado_en"),
    admin.from("libros_estados").select("id, es_final"),
    admin.from("balances").select("id, estado"),
    admin.from("libros_pedidos").select("id").not("fecha_limite", "is", null),
    admin.from("servicios_cliente").select("cliente_id, clientes(nombre)").eq("servicio", "libros").eq("estado", true),
    admin.from("clientes_societario").select("cliente_id, tipo_societario, mandato_designacion, mandato_anios"),
  ]);

  // ── Línea base, hoy y fotos de referencia ──────────────────────────────────
  const snapshots = (snapshotsRaw ?? []) as Snapshot[];
  const hoySnap = armarSnapshot(hoy, atraso);
  // Sin la tabla (etapa 7 sin correr) la base se calcula al vuelo.
  const base =
    snapshots.find((s) => s.es_base) ?? armarSnapshot(FECHA_BASE, await calcularAtraso(admin, FECHA_BASE), true);
  const referencia = (dias: number): Snapshot => {
    const hasta = restarDias(hoy, dias);
    return [...snapshots].reverse().find((s) => s.fecha <= hasta && s.fecha >= base.fecha) ?? base;
  };
  const puestosAlDia = (ref: Snapshot) =>
    Object.entries(hoySnap.por_libro).filter(([id, v]) => v === 0 && ref.por_libro[id] !== undefined && ref.por_libro[id] !== 0)
      .length;

  const finales = new Set((estadosRaw ?? []).filter((e) => e.es_final).map((e) => e.id as string));
  const tareas = (tareasRaw ?? []) as (Pick<
    LibroTarea,
    "id" | "cliente_id" | "origen" | "balance_id" | "pedido_id" | "fecha_limite" | "material_listo" | "prioridad_manual" | "estado_id" | "fecha_fin" | "creado_en"
  >)[];
  const enviosDesde = (desde: string) =>
    tareas.filter((t) => t.origen === "balance" && finales.has(t.estado_id) && !!t.fecha_fin && t.fecha_fin >= desde).length;

  // ── Evolución semanal: última foto de cada semana, desde la base ───────────
  const porSemana = new Map<string, Snapshot>();
  for (const s of [base, ...snapshots.filter((s) => !s.es_base), hoySnap].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (s.fecha < base.fecha) continue;
    porSemana.set(s.es_base ? s.fecha : lunes(s.fecha), s);
  }
  const evolucion = Array.from(porSemana.entries()).map(([semana, s]) => ({
    semana,
    fecha: s.fecha,
    periodos: s.periodos_pendientes,
    atrasados: s.libros_atrasados,
  }));

  // ── Prioridad de las tareas abiertas ───────────────────────────────────────
  const balanceEstado = new Map((balancesRaw ?? []).map((b) => [b.id as string, b.estado as string]));
  const pedidosConFecha = new Set((pedidosRaw ?? []).map((p) => p.id as string));
  const prioridad: Record<PrioridadLibro, { abiertas: number; dias: number }> = {
    P1: { abiertas: 0, dias: 0 },
    P2: { abiertas: 0, dias: 0 },
    P3: { abiertas: 0, dias: 0 },
  };
  for (const t of tareas.filter((x) => !finales.has(x.estado_id))) {
    const p =
      t.prioridad_manual ??
      prioridadSugerida(t, {
        pedidoConFecha: !!t.pedido_id && pedidosConFecha.has(t.pedido_id),
        balanceEstado: t.balance_id ? balanceEstado.get(t.balance_id) ?? null : null,
      }).prioridad;
    prioridad[p].abiertas++;
    prioridad[p].dias += -diasHasta(t.creado_en.slice(0, 10));
  }

  // ── Mandatos ───────────────────────────────────────────────────────────────
  const nombres = new Map(
    ((serviciosRaw ?? []) as unknown as { cliente_id: string; clientes: { nombre: string } | null }[])
      .filter((s) => s.clientes)
      .map((s) => [s.cliente_id, s.clientes!.nombre])
  );
  const primerAviso = config.avisosMandato[0] ?? 90;
  const mandatos: DatosTablero["mandatos"] = { vigentes: 0, porVencer: [], vencidos: [], sinCargar: [] };
  for (const s of (societariosRaw ?? []) as {
    cliente_id: string;
    tipo_societario: string | null;
    mandato_designacion: string | null;
    mandato_anios: number | null;
  }[]) {
    const nombre = nombres.get(s.cliente_id);
    if (!nombre) continue;
    if (!s.mandato_designacion) {
      if (s.tipo_societario === "SA" || s.tipo_societario === "SAS") mandatos.sinCargar.push({ clienteId: s.cliente_id, nombre });
      continue;
    }
    const vence = vencimientoMandato(s.mandato_designacion, s.mandato_anios);
    if (!vence) {
      mandatos.vigentes++;
      continue;
    }
    const dias = diasHasta(vence);
    if (dias < 0) mandatos.vencidos.push({ clienteId: s.cliente_id, nombre, vence, dias });
    else if (dias <= primerAviso) mandatos.porVencer.push({ clienteId: s.cliente_id, nombre, vence, dias });
    else mandatos.vigentes++;
  }
  mandatos.vencidos.sort((a, b) => a.dias - b.dias);
  mandatos.porVencer.sort((a, b) => a.dias - b.dias);
  mandatos.sinCargar.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // ── Por responsable (solo admin) ───────────────────────────────────────────
  let porResponsable: DatosTablero["porResponsable"] = null;
  if (yo?.isAdmin) {
    const grupos = new Map<string, NonNullable<DatosTablero["porResponsable"]>[number]>();
    for (const l of atraso.libros) {
      const clave = l.responsableId ?? "";
      const g = grupos.get(clave) ?? {
        id: clave,
        nombre: l.responsableNombre ?? "Sin responsable",
        libros: 0,
        periodosBase: 0,
        periodosHoy: 0,
        alDia: 0,
        sinDato: 0,
        puestosAlDia: 0,
      };
      const enBase = base.por_libro[l.libroId];
      g.libros++;
      g.periodosHoy += l.periodos;
      g.periodosBase += enBase && enBase > 0 ? enBase : 0;
      if (l.estado === "al_dia") g.alDia++;
      if (l.estado === "sin_dato") g.sinDato++;
      if (l.estado === "al_dia" && enBase !== undefined && enBase !== 0) g.puestosAlDia++;
      grupos.set(clave, g);
    }
    porResponsable = Array.from(grupos.values()).sort((a, b) => b.periodosHoy - a.periodosHoy);
  }

  const datos: DatosTablero = {
    hoy,
    fechaMeta: config.fechaMeta,
    tablaSnapshots,
    esAdmin: !!yo?.isAdmin,
    base: {
      fecha: base.fecha,
      periodos: base.periodos_pendientes,
      alDia: base.libros_al_dia,
      atrasados: base.libros_atrasados,
    },
    actual: {
      periodos: hoySnap.periodos_pendientes,
      alDia: hoySnap.libros_al_dia,
      atrasados: hoySnap.libros_atrasados,
      sinDato: hoySnap.libros_sin_dato,
      sinLibro: hoySnap.libros_sin_libro,
      sinCargar: atraso.sinCargar,
      total: atraso.libros.length,
    },
    masAtrasados: atraso.libros
      .filter((l) => l.estado === "atrasado")
      .sort((a, b) => b.periodos - a.periodos || a.clienteNombre.localeCompare(b.clienteNombre, "es"))
      .slice(0, 12),
    logrado: {
      puestos: { semana: puestosAlDia(referencia(7)), mes: puestosAlDia(referencia(30)), total: puestosAlDia(base) },
      envios: { semana: enviosDesde(restarDias(hoy, 7)), mes: enviosDesde(restarDias(hoy, 30)), total: enviosDesde(base.fecha) },
    },
    evolucion,
    envios: {
      completos: atraso.envios.filter((e) => e.faltan === 0).length,
      total: atraso.envios.length,
      pendientes: atraso.envios.filter((e) => e.faltan > 0).sort((a, b) => Number(b.legalizado) - Number(a.legalizado) || b.faltan - a.faltan),
    },
    prioridad: (["P1", "P2", "P3"] as const).map((p) => ({
      prioridad: p,
      abiertas: prioridad[p].abiertas,
      antiguedad: prioridad[p].abiertas ? Math.round(prioridad[p].dias / prioridad[p].abiertas) : null,
    })),
    mandatos,
    porResponsable,
  };

  return <TableroClient datos={datos} />;
}
