import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentLiquidadora } from "@/lib/auth";
import { diasHasta, hoyISO, prioridadSugerida, vencimientoFinal } from "@/lib/libros";
import { configLibros } from "@/lib/librosAutomaticos";
import {
  CATEGORIAS_LIBRO,
  FECHA_BASE,
  GRUPOS_SOCIETARIOS,
  armarSnapshot,
  calcularAtraso,
  categoriaDe,
  grupoSocietario,
  guardarSnapshots,
  type CategoriaLibro,
  type GrupoSocietario,
  type Snapshot,
} from "@/lib/librosTablero";
import type { LibroTarea, PrioridadLibro } from "@/types";
import { TableroClient, type DatosTablero, type FilaCategoria } from "./TableroClient";

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

const MARCA_SHEET = "Importado del historial del sheet";

type TareaRaw = Pick<
  LibroTarea,
  | "id"
  | "cliente_id"
  | "libro_id"
  | "origen"
  | "balance_id"
  | "pedido_id"
  | "fecha_limite"
  | "material_listo"
  | "prioridad_manual"
  | "estado_id"
  | "fecha_fin"
  | "creado_en"
  | "observaciones"
>;

export default async function TableroLibrosPage() {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const hoy = hoyISO();

  const atraso = await calcularAtraso(admin, hoy);
  const tablaSnapshots = await guardarSnapshots(admin, hoy, atraso);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: snapshotsRaw },
    config,
    { data: tareasRaw },
    { data: estadosRaw },
    { data: balancesRaw },
    { data: pedidosRaw },
    { data: serviciosRaw },
    { data: societariosRaw },
    { data: librosRaw },
    { data: catalogoRaw },
    { data: prefRaw },
  ] = await Promise.all([
    tablaSnapshots
      ? admin.from("libros_snapshot").select("*").order("fecha")
      : Promise.resolve({ data: [] as Snapshot[] }),
    configLibros(admin),
    admin
      .from("libros_tareas")
      .select(
        "id, cliente_id, libro_id, origen, balance_id, pedido_id, fecha_limite, material_listo, prioridad_manual, estado_id, fecha_fin, creado_en, observaciones"
      ),
    admin.from("libros_estados").select("id, es_final"),
    admin.from("balances").select("id, estado"),
    admin.from("libros_pedidos").select("id, tipo, fecha_limite, mandato_vence"),
    admin.from("servicios_cliente").select("cliente_id, clientes(nombre)").eq("servicio", "libros").eq("estado", true),
    admin.from("clientes_societario").select("*"),
    admin.from("libros").select("id, cliente_id, catalogo_id, estado"),
    admin.from("libros_catalogo").select("id, codigo"),
    user?.email
      ? admin.from("libros_preferencias").select("dashboard_orden").eq("email", user.email.toLowerCase()).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const libroCliente = new Map((librosRaw ?? []).map((l) => [l.id as string, l.cliente_id as string]));
  const libroEstado = new Map((librosRaw ?? []).map((l) => [l.id as string, l.estado as string]));
  const codigoCatalogo = new Map((catalogoRaw ?? []).map((k) => [k.id as string, k.codigo as string]));
  const libroCodigo = new Map((librosRaw ?? []).map((l) => [l.id as string, codigoCatalogo.get(l.catalogo_id as string) ?? ""]));
  const tipoCliente = new Map(
    ((societariosRaw ?? []) as { cliente_id: string; tipo_societario: string | null }[]).map((s) => [s.cliente_id, s.tipo_societario])
  );

  // ── Línea base, hoy y fotos de referencia ──────────────────────────────────
  const snapshots = (snapshotsRaw ?? []) as Snapshot[];
  const hoySnap = armarSnapshot(hoy, atraso);
  // Sin la tabla (etapa 7 sin correr) la base se calcula al vuelo.
  const base =
    snapshots.find((s) => s.es_base) ?? armarSnapshot(FECHA_BASE, await calcularAtraso(admin, FECHA_BASE), true);
  const empresasAtrasadas = (s: Snapshot) => {
    const set = new Set<string>();
    for (const [id, v] of Object.entries(s.por_libro)) {
      const c = libroCliente.get(id);
      if (v > 0 && c) set.add(c);
    }
    return set.size;
  };
  const puestosAlDia = Object.entries(hoySnap.por_libro).filter(
    ([id, v]) => v === 0 && base.por_libro[id] !== undefined && base.por_libro[id] !== 0
  ).length;

  // ── Evolución semanal: última foto de cada semana, desde la base ───────────
  const porSemana = new Map<string, Snapshot>();
  for (const s of [base, ...snapshots.filter((x) => !x.es_base), hoySnap].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (s.fecha < base.fecha) continue;
    porSemana.set(s.es_base ? s.fecha : lunes(s.fecha), s);
  }
  const evolucion = Array.from(porSemana.entries()).map(([semana, s]) => ({
    semana,
    fecha: s.fecha,
    libros: s.libros_atrasados,
    empresas: empresasAtrasadas(s),
  }));

  // ── Pendiente: por tipo de libro y por tipo societario ─────────────────────
  const atrasados = atraso.libros.filter((l) => l.estado === "atrasado");
  const pendienteLibro: FilaCategoria[] = CATEGORIAS_LIBRO.map((cat) => {
    const delTipo = atraso.libros.filter((l) => categoriaDe(l.codigo) === cat.id);
    const at = atrasados.filter((l) => categoriaDe(l.codigo) === cat.id);
    return {
      id: cat.id,
      label: cat.label,
      empresas: new Set(at.map((l) => l.clienteId)).size,
      libros: at.length,
      de: new Set(delTipo.map((l) => l.clienteId)).size,
    };
  });
  const pendienteSocietario: FilaCategoria[] = GRUPOS_SOCIETARIOS.map((g) => {
    const delGrupo = atraso.libros.filter((l) => grupoSocietario(l.tipoSocietario) === g);
    const at = delGrupo.filter((l) => l.estado === "atrasado");
    return {
      id: g,
      label: g,
      empresas: new Set(at.map((l) => l.clienteId)).size,
      libros: at.length,
      de: new Set(delGrupo.map((l) => l.clienteId)).size,
    };
  });
  const sinDato = atraso.libros.filter((l) => l.estado === "sin_dato");
  const sinLibro = atraso.libros.filter((l) => l.estado === "sin_libro");

  // ── Logrado: copiados del historial del sheet + registrados en BOS ─────────
  const finales = new Set((estadosRaw ?? []).filter((e) => e.es_final).map((e) => e.id as string));
  const tareas = (tareasRaw ?? []) as TareaRaw[];
  const copiados = tareas.filter((t) => finales.has(t.estado_id));
  const hace30 = restarDias(hoy, 30);
  const contarLogrado = (
    clave: (t: TareaRaw) => string | null,
    ids: string[],
    labels: Record<string, string>
  ): DatosTablero["logrado"]["porLibro"] =>
    ids.map((id) => {
      const del = copiados.filter((t) => clave(t) === id);
      const ult = del.filter((t) => t.fecha_fin && t.fecha_fin >= hace30);
      return {
        id,
        label: labels[id],
        empresas: new Set(del.map((t) => t.cliente_id)).size,
        libros: new Set(del.map((t) => t.libro_id)).size,
        delSheet: del.filter((t) => (t.observaciones ?? "").startsWith(MARCA_SHEET)).length,
        enBos: del.filter((t) => !(t.observaciones ?? "").startsWith(MARCA_SHEET)).length,
        empresas30: new Set(ult.map((t) => t.cliente_id)).size,
        libros30: new Set(ult.map((t) => t.libro_id)).size,
      };
    });
  const logradoPorLibro = contarLogrado(
    (t) => categoriaDe(libroCodigo.get(t.libro_id) ?? ""),
    CATEGORIAS_LIBRO.map((c) => c.id),
    Object.fromEntries(CATEGORIAS_LIBRO.map((c) => [c.id, c.label])) as Record<CategoriaLibro, string>
  );
  const logradoPorSocietario = contarLogrado(
    (t) => grupoSocietario(tipoCliente.get(t.cliente_id)),
    [...GRUPOS_SOCIETARIOS],
    Object.fromEntries(GRUPOS_SOCIETARIOS.map((g) => [g, g])) as Record<GrupoSocietario, string>
  );
  const enviosCopiados = copiados.filter((t) => t.origen === "balance" && t.fecha_fin && t.fecha_fin >= base.fecha).length;

  // ── Prioridad de las tareas abiertas ───────────────────────────────────────
  const balanceEstado = new Map((balancesRaw ?? []).map((b) => [b.id as string, b.estado as string]));
  const pedidos = (pedidosRaw ?? []) as { id: string; tipo: string; fecha_limite: string | null; mandato_vence?: string | null }[];
  const pedidosConFecha = new Set(pedidos.filter((p) => p.fecha_limite).map((p) => p.id));
  const renovacionesVencidas = new Set(
    pedidos.filter((p) => p.tipo === "renovacion_autoridades" && p.mandato_vence && p.mandato_vence < hoy).map((p) => p.id)
  );
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
        renovacionVencida: !!t.pedido_id && renovacionesVencidas.has(t.pedido_id),
        sinLibro: libroEstado.get(t.libro_id) === "sin_libro",
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
    mandato_vence_preciso?: string | null;
  }[]) {
    const nombre = nombres.get(s.cliente_id);
    if (!nombre) continue;
    if (!s.mandato_designacion && !s.mandato_vence_preciso) {
      if (s.tipo_societario === "SA" || s.tipo_societario === "SAS") mandatos.sinCargar.push({ clienteId: s.cliente_id, nombre });
      continue;
    }
    const vence = vencimientoFinal(s);
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
    const grupos = new Map<
      string,
      { id: string; nombre: string; empresas: Set<string>; atrHoy: Set<string>; atrBase: Set<string>; librosHoy: number; librosBase: number; puestos: number }
    >();
    for (const l of atraso.libros) {
      const clave = l.responsableId ?? "";
      const g = grupos.get(clave) ?? {
        id: clave,
        nombre: l.responsableNombre ?? "Sin responsable",
        empresas: new Set<string>(),
        atrHoy: new Set<string>(),
        atrBase: new Set<string>(),
        librosHoy: 0,
        librosBase: 0,
        puestos: 0,
      };
      const enBase = base.por_libro[l.libroId];
      g.empresas.add(l.clienteId);
      if (l.estado === "atrasado") {
        g.atrHoy.add(l.clienteId);
        g.librosHoy++;
      }
      if (enBase !== undefined && enBase > 0) {
        g.atrBase.add(l.clienteId);
        g.librosBase++;
      }
      if (l.estado === "al_dia" && enBase !== undefined && enBase !== 0) g.puestos++;
      grupos.set(clave, g);
    }
    porResponsable = Array.from(grupos.values())
      .map((g) => ({
        id: g.id,
        nombre: g.nombre,
        empresas: g.empresas.size,
        empresasBase: g.atrBase.size,
        empresasHoy: g.atrHoy.size,
        librosBase: g.librosBase,
        librosHoy: g.librosHoy,
        puestosAlDia: g.puestos,
      }))
      .sort((a, b) => b.librosHoy - a.librosHoy);
  }

  const datos: DatosTablero = {
    hoy,
    fechaMeta: config.fechaMeta,
    tablaSnapshots,
    esAdmin: !!yo?.isAdmin,
    ordenGuardado: ((prefRaw as { dashboard_orden?: string[] } | null)?.dashboard_orden ?? []) as string[],
    base: {
      fecha: base.fecha,
      libros: base.libros_atrasados,
      empresas: empresasAtrasadas(base),
      alDia: base.libros_al_dia,
    },
    actual: {
      libros: hoySnap.libros_atrasados,
      empresas: empresasAtrasadas(hoySnap),
      alDia: hoySnap.libros_al_dia,
      total: atraso.libros.length,
      empresasTotal: new Set(atraso.libros.map((l) => l.clienteId)).size,
      sinDatoLibros: sinDato.length,
      sinDatoEmpresas: new Set(sinDato.map((l) => l.clienteId)).size,
      sinLibroLibros: sinLibro.length,
      sinLibroEmpresas: new Set(sinLibro.map((l) => l.clienteId)).size,
    },
    pendienteLibro,
    pendienteSocietario,
    masAtrasados: atrasados
      .sort((a, b) => b.periodos - a.periodos || a.clienteNombre.localeCompare(b.clienteNombre, "es"))
      .slice(0, 12),
    logrado: {
      porLibro: logradoPorLibro,
      porSocietario: logradoPorSocietario,
      puestosAlDia,
      enviosCopiados,
    },
    evolucion,
    envios: {
      completos: atraso.envios.filter((e) => e.faltan === 0).length,
      total: atraso.envios.length,
      pendientes: atraso.envios
        .filter((e) => e.faltan > 0)
        .sort((a, b) => Number(b.legalizado) - Number(a.legalizado) || b.faltan - a.faltan),
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
