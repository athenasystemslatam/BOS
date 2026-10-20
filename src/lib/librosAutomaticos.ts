import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TAG_LIBROS,
  AVISOS_MANDATO,
  CHECKLIST_RENOVACION,
  UMBRAL_FOLIOS,
  diasHasta,
  fmtFecha,
  foliosLibres,
  hoyISO,
  mesIndice,
  vencimientoFinal,
} from "@/lib/libros";

type Admin = ReturnType<typeof createAdminClient>;

type LibroRaw = {
  id: string;
  cliente_id: string;
  catalogo_id: string;
  tomo: number;
  estado: string;
  folios_totales: number | null;
  folios_usados: number;
  ultimo_periodo_copiado: string | null;
};
type BalanceRaw = { id: string; cliente_id: string; fecha_cierre: string; estado: string };
type TareaRaw = { libro_id: string; cliente_id: string; balance_id: string | null; estado_id: string; orden_manual: number };
type PedidoRaw = {
  id: string;
  cliente_id: string;
  libro_id: string | null;
  tipo: string;
  estado: string;
  prioridad: string | null;
  mandato_vence: string | null;
};

const ESTADOS_ABIERTOS = ["abierto", "esperando_cliente", "esperando_tercero"];

// 23505 = otra carga de la pantalla ya lo creó (índices únicos).
function ignorarDuplicado(error: { code?: string; message: string } | null, que: string) {
  if (error && error.code !== "23505") console.error(`[libros] ${que}: ${error.message}`);
}

export type ConfigLibros = {
  umbralFolios: number;
  avisosMandato: number[];
  fechaMeta: string | null;
  /** Personas del equipo de Libros que NO reciben el mail diario. */
  mailDiarioExcluidos: string[];
  /** Quiénes reciben el resumen semanal; null = los administradores. */
  mailSemanalIds: string[] | null;
  /** Día del resumen semanal: 1 = lunes … 5 = viernes. */
  mailSemanalDia: number;
};

/**
 * Avisos de mandato de mayor a menor. select("*") para que funcione con las
 * columnas que existan (etapa 6: mandato_avisos; 7: fecha_meta_puesta; 10: mails).
 */
export async function configLibros(admin: Admin): Promise<ConfigLibros> {
  const { data } = await admin.from("libros_config").select("*").maybeSingle();
  const cfg = data as {
    umbral_folios?: number;
    mandato_avisos?: number[] | null;
    fecha_meta_puesta?: string | null;
    mail_diario_excluidos?: string[] | null;
    mail_semanal_ids?: string[] | null;
    mail_semanal_dia?: number | null;
  } | null;
  return {
    umbralFolios: cfg?.umbral_folios ?? UMBRAL_FOLIOS,
    avisosMandato: [...(cfg?.mandato_avisos?.length ? cfg.mandato_avisos : AVISOS_MANDATO)].sort((a, b) => b - a),
    fechaMeta: cfg?.fecha_meta_puesta ?? null,
    mailDiarioExcluidos: cfg?.mail_diario_excluidos ?? [],
    mailSemanalIds: cfg?.mail_semanal_ids ?? null,
    mailSemanalDia: cfg?.mail_semanal_dia ?? 5,
  };
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lo que el módulo genera solo, sin que nadie lo cargue. Se corre al abrir
 * Seguimiento y Pedidos, y en el cron diario; es idempotente:
 * - Último balance del cliente en 'legalizado' o 'finalizado': una tarea
 *   (origen 'balance') por cada libro del envío anual no copiado hasta ese
 *   cierre. Una sola vez por libro y balance (libros_tareas_libro_balance_idx).
 * - Mandato a N días de vencer (N = primer aviso, 90 por defecto): un pedido
 *   "Renovación de autoridades" por cliente y mandato, con checklist. Si el
 *   mandato ya venció, ese pedido pasa a P1 (no las copias del cliente).
 * - Folios bajos: un pedido de presupuesto de tomo nuevo por tomo.
 * Nunca corta la carga de la página: los errores van al log.
 */
export async function sincronizarLibrosAutomaticosAhora(): Promise<void> {
  try {
    const admin = createAdminClient();
    const hoy = hoyISO();
    const [
      { data: serviciosRaw },
      { data: societariosRaw },
      { data: catalogoRaw },
      { data: librosRaw },
      { data: balancesRaw },
      { data: estadosRaw },
      { data: tareasRaw },
      { data: pedidosRaw },
      config,
    ] = await Promise.all([
      admin.from("servicios_cliente").select("cliente_id, responsable_id, clientes!inner(estado)").eq("servicio", "libros").eq("estado", true).eq("clientes.estado", "activo"),
      admin.from("clientes_societario").select("*"),
      admin.from("libros_catalogo").select("id, nombre, dispara_con_balance, activo"),
      admin
        .from("libros")
        .select("id, cliente_id, catalogo_id, tomo, estado, folios_totales, folios_usados, ultimo_periodo_copiado"),
      admin.from("balances").select("id, cliente_id, fecha_cierre, estado").order("fecha_cierre", { ascending: false }),
      admin.from("libros_estados").select("id, codigo, es_final"),
      admin.from("libros_tareas").select("libro_id, cliente_id, balance_id, estado_id, orden_manual"),
      admin
        .from("libros_pedidos")
        .select("*")
        .in("tipo", ["renovacion_autoridades", "presupuesto_tomo_nuevo"]),
      configLibros(admin),
    ]);

    const responsableLibros = new Map(
      (serviciosRaw ?? []).map((s) => [s.cliente_id as string, (s.responsable_id as string | null) ?? null])
    );
    const clientes = new Set(responsableLibros.keys());
    const catalogo = new Map(
      ((catalogoRaw ?? []) as { id: string; nombre: string; dispara_con_balance: boolean; activo: boolean }[]).map(
        (k) => [k.id, k]
      )
    );
    const libros = (librosRaw ?? []) as LibroRaw[];
    const estados = (estadosRaw ?? []) as { id: string; codigo: string | null; es_final: boolean }[];
    const finales = new Set(estados.filter((e) => e.es_final).map((e) => e.id));
    const pendiente = estados.find((e) => e.codigo === "pendiente");
    const tareas = (tareasRaw ?? []) as TareaRaw[];
    const abiertas = tareas.filter((t) => !finales.has(t.estado_id));
    const enCola = new Set(abiertas.map((t) => t.libro_id));
    const yaGeneradas = new Set(tareas.filter((t) => t.balance_id).map((t) => `${t.libro_id}|${t.balance_id}`));
    const pedidos = (pedidosRaw ?? []) as PedidoRaw[];

    const ultimoCopiado = new Map<string, string>();
    for (const l of libros) {
      const clave = `${l.cliente_id}|${l.catalogo_id}`;
      const actual = ultimoCopiado.get(clave);
      if (l.ultimo_periodo_copiado && (!actual || l.ultimo_periodo_copiado > actual)) {
        ultimoCopiado.set(clave, l.ultimo_periodo_copiado);
      }
    }

    // ── Balance legalizado / finalizado ──────────────────────────────────────
    const ultimoBalance = new Map<string, BalanceRaw>();
    for (const b of (balancesRaw ?? []) as BalanceRaw[]) {
      if (!ultimoBalance.has(b.cliente_id)) ultimoBalance.set(b.cliente_id, b);
    }
    let ordenFinal = Math.max(0, ...abiertas.map((t) => t.orden_manual));
    if (pendiente) {
      for (const [clienteId, b] of Array.from(ultimoBalance.entries())) {
        if (!clientes.has(clienteId) || (b.estado !== "legalizado" && b.estado !== "finalizado")) continue;
        const pendientes = libros.filter((l) => {
          const item = catalogo.get(l.catalogo_id);
          if (l.cliente_id !== clienteId || l.estado !== "activo" || !item?.activo || !item.dispara_con_balance) return false;
          if (enCola.has(l.id) || yaGeneradas.has(`${l.id}|${b.id}`)) return false;
          const ultimo = ultimoCopiado.get(`${l.cliente_id}|${l.catalogo_id}`);
          return !ultimo || mesIndice(ultimo) < mesIndice(b.fecha_cierre);
        });
        if (pendientes.length === 0) continue;
        const delCliente = abiertas.filter((t) => t.cliente_id === clienteId);
        const orden = delCliente.length ? Math.min(...delCliente.map((t) => t.orden_manual)) : (ordenFinal += 10);
        for (const l of pendientes) {
          const { error } = await admin.from("libros_tareas").insert({
            cliente_id: clienteId,
            libro_id: l.id,
            origen: "balance",
            balance_id: b.id,
            periodo_hasta: b.fecha_cierre,
            estado_id: pendiente.id,
            orden_manual: orden,
            observaciones: `Envío anual: balance con cierre ${fmtFecha(b.fecha_cierre)} ${b.estado}.`,
          });
          ignorarDuplicado(error, "tarea por balance");
        }
      }
    }

    // ── Mandato por vencer o vencido → renovación de autoridades ─────────────
    const primerAviso = config.avisosMandato[0] ?? AVISOS_MANDATO[0];
    for (const s of (societariosRaw ?? []) as {
      cliente_id: string;
      mandato_designacion: string | null;
      mandato_anios: number | null;
      mandato_vence_preciso?: string | null;
    }[]) {
      const vence = vencimientoFinal(s);
      if (!vence || !clientes.has(s.cliente_id)) continue;
      const dias = diasHasta(vence);
      if (dias > primerAviso) continue;
      const prioridad = dias < 0 ? "P1" : "P2";
      // La del mismo mandato; si no, la que esté abierta: si se corrigió el
      // vencimiento (ej. se cargó el preciso) se actualiza, no se abre otra.
      const delCliente = pedidos.filter((p) => p.cliente_id === s.cliente_id && p.tipo === "renovacion_autoridades");
      const abierta = delCliente.find((p) => ESTADOS_ABIERTOS.includes(p.estado) || p.estado === "aprobado");
      if (abierta && abierta.mandato_vence !== vence && !delCliente.some((p) => p.mandato_vence === vence)) {
        const { error } = await admin
          .from("libros_pedidos")
          .update({ mandato_vence: vence, prioridad, actualizado_en: new Date().toISOString() })
          .eq("id", abierta.id);
        ignorarDuplicado(error, "actualizar vencimiento de la renovación");
        continue;
      }
      const existente = delCliente.find((p) => p.mandato_vence === vence);
      if (existente) {
        if (prioridad === "P1" && existente.prioridad !== "P1" && ESTADOS_ABIERTOS.includes(existente.estado)) {
          const { error } = await admin
            .from("libros_pedidos")
            .update({ prioridad: "P1", actualizado_en: new Date().toISOString() })
            .eq("id", existente.id);
          ignorarDuplicado(error, "subir renovación a P1");
        }
        continue;
      }
      const { error } = await admin.from("libros_pedidos").insert({
        cliente_id: s.cliente_id,
        tipo: "renovacion_autoridades",
        mandato_vence: vence,
        prioridad,
        descripcion:
          dias < 0
            ? `El mandato venció el ${fmtFecha(vence)}: hay que renovar autoridades.`
            : `El mandato vence el ${fmtFecha(vence)}: preparar la renovación de autoridades.`,
        responsable_id: responsableLibros.get(s.cliente_id) ?? null,
        proximo_seguimiento: sumarDias(hoy, 7),
        checklist: CHECKLIST_RENOVACION.map((texto) => ({ texto, hecho: false })),
        automatico: true,
      });
      ignorarDuplicado(error, "pedido de renovación");
    }

    // ── Folios bajos → presupuesto de tomo nuevo ─────────────────────────────
    const conPedidoTomo = new Set(pedidos.filter((p) => p.tipo === "presupuesto_tomo_nuevo").map((p) => p.libro_id));
    for (const l of libros) {
      const libres = foliosLibres(l.folios_totales, l.folios_usados);
      if (l.estado !== "activo" || libres == null || libres > config.umbralFolios || !clientes.has(l.cliente_id)) continue;
      if (conPedidoTomo.has(l.id)) continue;
      const nombre = `${catalogo.get(l.catalogo_id)?.nombre ?? "Libro"} tomo ${l.tomo}`;
      const { error } = await admin.from("libros_pedidos").insert({
        cliente_id: l.cliente_id,
        libro_id: l.id,
        tipo: "presupuesto_tomo_nuevo",
        descripcion: `Quedan ${libres} folios libres en ${nombre}.`,
        automatico: true,
      });
      ignorarDuplicado(error, "pedido de tomo nuevo");
    }
  } catch (e) {
    console.error("[libros] sincronizarLibrosAutomaticos:", e);
  }
}

/**
 * Al abrir Seguimiento o Pedidos: corre lo automático como mucho una vez cada
 * 10 minutos (o enseguida después de guardar algo en Libros, que invalida
 * TAG_LIBROS). Antes corría en cada click y era lo más lento de esas pantallas.
 */
export const sincronizarLibrosAutomaticos = unstable_cache(
  async () => {
    await sincronizarLibrosAutomaticosAhora();
    return true;
  },
  ["libros-sincronizar"],
  { revalidate: 600, tags: [TAG_LIBROS] }
);
