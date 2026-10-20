import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularAtraso } from "@/lib/librosTablero";
import { estadoRenovacion, hoyISO, vencimientoFinal, type DatosMandato } from "@/lib/libros";
import type { EstadoPedido, ItemChecklist } from "@/types";

type Admin = ReturnType<typeof createAdminClient>;

export * from "@/lib/librosObjetivosMetricas";
import type { MetricaObjetivo, Objetivo, ObjetivoConAvance, ValorMetrica } from "@/lib/librosObjetivosMetricas";

const DIAS_ENVIO = 60;
const pct = (cumplen: number, total: number): ValorMetrica => ({
  valor: total ? Math.round((cumplen / total) * 1000) / 10 : null,
  cumplen,
  total,
});

function diasEntre(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86_400_000);
}

/** Las 6 métricas de los objetivos, calculadas con los datos de hoy. */
export async function calcularMetricas(admin: Admin, hoy: string = hoyISO()): Promise<Record<MetricaObjetivo, ValorMetrica>> {
  const [atraso, { data: servicios }, { data: societariosRaw }, { data: pedidosRaw }, { data: librosRaw }, { data: tareasRaw }, { data: estadosRaw }] =
    await Promise.all([
      calcularAtraso(admin, hoy),
      admin.from("servicios_cliente").select("cliente_id").eq("servicio", "libros").eq("estado", true),
      admin.from("clientes_societario").select("*"),
      admin.from("libros_pedidos").select("*").eq("tipo", "renovacion_autoridades"),
      admin.from("libros").select("cliente_id, estado, ultimo_periodo_copiado, folios_totales").eq("estado", "activo"),
      admin.from("libros_tareas").select("cliente_id, balance_id, estado_id, fecha_fin, creado_en").eq("origen", "balance"),
      admin.from("libros_estados").select("id, es_final"),
    ]);

  const clientes = new Set((servicios ?? []).map((s) => s.cliente_id as string));
  const societarios = ((societariosRaw ?? []) as (DatosMandato & { cliente_id: string; tipo_societario: string | null })[]).filter(
    (s) => clientes.has(s.cliente_id)
  );

  // Mandatos cargados: SA y SAS con designación o vencimiento preciso.
  const conMandato = societarios.filter((s) => s.tipo_societario === "SA" || s.tipo_societario === "SAS");
  const mandatosCargados = pct(conMandato.filter((s) => s.mandato_designacion || s.mandato_vence_preciso).length, conMandato.length);

  // Renovaciones: universo = mandatos vencidos hoy + renovaciones de mandatos
  // que ya vencieron (las cerradas cargan el mandato nuevo y dejan de estar
  // vencidas, pero tienen que seguir contando como cerradas).
  const pedidos = ((pedidosRaw ?? []) as {
    cliente_id: string; mandato_vence: string | null; estado: EstadoPedido; checklist: ItemChecklist[] | null; ultimo_seguimiento: string | null;
  }[]).filter((p) => clientes.has(p.cliente_id));
  const casos = new Map<string, "sin_pedido" | "pendiente" | "en_curso" | "cerrada">();
  for (const s of societarios) {
    const vence = vencimientoFinal(s);
    if (vence && vence < hoy) casos.set(`${s.cliente_id}|${vence}`, "sin_pedido");
  }
  for (const p of pedidos) {
    if (!p.mandato_vence || p.mandato_vence >= hoy) continue;
    casos.set(`${p.cliente_id}|${p.mandato_vence}`, estadoRenovacion(p));
  }
  const estadosCasos = Array.from(casos.values());
  const renovacionesIniciadas = pct(estadosCasos.filter((e) => e === "en_curso" || e === "cerrada").length, estadosCasos.length);
  const renovacionesCerradas = pct(estadosCasos.filter((e) => e === "cerrada").length, estadosCasos.length);

  // Datos completos: libros activos con último copiado y folios totales.
  const libros = ((librosRaw ?? []) as { cliente_id: string; ultimo_periodo_copiado: string | null; folios_totales: number | null }[]).filter(
    (l) => clientes.has(l.cliente_id)
  );
  const datosCompletos = pct(libros.filter((l) => l.ultimo_periodo_copiado && l.folios_totales != null).length, libros.length);

  // Puesta al día: clientes con todos sus libros calculables al día.
  const porCliente = new Map<string, boolean>();
  for (const l of atraso.libros) porCliente.set(l.clienteId, (porCliente.get(l.clienteId) ?? true) && l.estado === "al_dia");
  const estadosClientes = Array.from(porCliente.values());
  const puestaAlDia = pct(estadosClientes.filter(Boolean).length, estadosClientes.length);

  // Envíos anuales dentro de 60 días: un envío = las tareas del mismo balance.
  // Cuenta desde que se crearon (cuando el balance quedó legalizado). Los que
  // siguen abiertos dentro del plazo todavía no se miden.
  const finales = new Set((estadosRaw ?? []).filter((e) => e.es_final).map((e) => e.id as string));
  const envios = new Map<string, { inicio: string; fin: string | null; abiertas: boolean }>();
  for (const t of (tareasRaw ?? []) as { cliente_id: string; balance_id: string | null; estado_id: string; fecha_fin: string | null; creado_en: string }[]) {
    if (!t.balance_id || !clientes.has(t.cliente_id)) continue;
    const e = envios.get(t.balance_id) ?? { inicio: t.creado_en.slice(0, 10), fin: null, abiertas: false };
    if (t.creado_en.slice(0, 10) < e.inicio) e.inicio = t.creado_en.slice(0, 10);
    if (finales.has(t.estado_id)) {
      if (t.fecha_fin && (!e.fin || t.fecha_fin > e.fin)) e.fin = t.fecha_fin;
    } else e.abiertas = true;
    envios.set(t.balance_id, e);
  }
  let aTiempo = 0;
  let medidos = 0;
  for (const e of Array.from(envios.values())) {
    if (e.abiertas) {
      if (diasEntre(e.inicio, hoy) > DIAS_ENVIO) medidos++;
      continue;
    }
    medidos++;
    if (e.fin && diasEntre(e.inicio, e.fin) <= DIAS_ENVIO) aTiempo++;
  }
  const envios60 = pct(aTiempo, medidos);

  return {
    mandatos_cargados: mandatosCargados,
    renovaciones_iniciadas: renovacionesIniciadas,
    renovaciones_cerradas: renovacionesCerradas,
    datos_completos: datosCompletos,
    puesta_al_dia: puestaAlDia,
    envios_60_dias: envios60,
  };
}

/**
 * Objetivos con su avance de hoy. Los que tienen fecha límite y llegaron a la
 * meta pasan solos a "cumplido" con la fecha (los permanentes, sin fecha, no
 * se cierran nunca). Memoizado por request: lo usan el cartel de Libros y el
 * Dashboard en la misma carga. Sin la tabla (etapa 11 sin correr) devuelve [].
 */
export const objetivosConAvance = cache(async (): Promise<ObjetivoConAvance[]> => {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("libros_objetivos").select("*").order("orden").order("creado_en");
    if (error || !data?.length) return [];
    const hoy = hoyISO();
    const metricas = await calcularMetricas(admin, hoy);
    const objetivos = (data as (Objetivo & { meta: number | string })[]).map((o) => ({ ...o, meta: Number(o.meta) }));

    const resultado: ObjetivoConAvance[] = [];
    for (const o of objetivos) {
      const m = metricas[o.metrica] ?? { valor: null, cumplen: 0, total: 0 };
      let { estado, fecha_cumplimiento } = o;
      if (estado === "actual" && o.fecha_limite && m.valor != null && m.valor >= o.meta) {
        estado = "cumplido";
        fecha_cumplimiento = hoy;
        await admin
          .from("libros_objetivos")
          .update({ estado, fecha_cumplimiento, actualizado_en: new Date().toISOString() })
          .eq("id", o.id)
          .eq("estado", "actual");
      }
      resultado.push({
        ...o,
        ...m,
        estado,
        fecha_cumplimiento,
        diasRestantes: o.fecha_limite ? diasEntre(hoy, o.fecha_limite) : null,
      });
    }
    return resultado;
  } catch (e) {
    console.error("[libros] objetivosConAvance:", e);
    return [];
  }
});
