import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getVencimientoF931, restarDiasHabiles, sumarDiasHabiles, enesimoDiaHabilDelMes } from "@/lib/vencimientos";
import { getObjetivoSueldos, ObjetivoSueldos } from "@/lib/objetivos";
import { ProductividadClient, FilaLiquidadora } from "./ProductividadClient";

type Color = "verde" | "amarillo" | "rojo";

/** Ítem 69: objetivo = fin de la ventana ideal, límite = tope real antes de
 * considerarlo tarde. Verde = dentro del objetivo, amarillo = después del
 * objetivo pero dentro del límite, rojo = pasado el límite. */
function clasificar(marcadoEn: string, objetivo: Date, limite: Date): Color {
  const marcado = new Date(marcadoEn);
  if (diffDias(marcado, objetivo) >= 0) return "verde";
  if (diffDias(marcado, limite) >= 0) return "amarillo";
  return "rojo";
}

/** Objetivo de Recibos del período: por defecto N días calendario antes del
 * último día del mes liquidado. Si el cliente se marcó "Preliquidado" antes
 * de fin de mes y ya se recibieron las novedades, el objetivo pasa a ser esa
 * fecha + 1 día hábil (ítem 97) — el F.931 nunca se ve afectado por esto y
 * el límite de Recibos tampoco cambia. */
function objetivoRecibos(
  anio: number,
  mes: number,
  objetivoGeneral: ObjetivoSueldos,
  tarea: { preliquidado: boolean; preliquidado_fecha: string | null; novedades_recibidas_fecha: string | null }
): Date {
  const finDeMes = new Date(anio, mes, 0, 23, 59, 59);
  if (tarea.preliquidado && tarea.preliquidado_fecha && tarea.novedades_recibidas_fecha) {
    const preliquidadoEn = new Date(tarea.preliquidado_fecha);
    if (preliquidadoEn <= finDeMes) {
      return sumarDiasHabiles(new Date(tarea.novedades_recibidas_fecha), 1);
    }
  }
  const d = new Date(anio, mes, 0); // último día del mes liquidado
  d.setDate(d.getDate() - objetivoGeneral.recibos_dias_antes_fin_mes);
  return d;
}

function limiteRecibos(anio: number, mes: number, objetivoGeneral: ObjetivoSueldos): Date {
  const mesSiguiente = mes === 12 ? 1 : mes + 1;
  const anioSiguiente = mes === 12 ? anio + 1 : anio;
  return enesimoDiaHabilDelMes(anioSiguiente, mesSiguiente, objetivoGeneral.recibos_limite_dia_habil_mes_siguiente);
}

/** Todas las filas de una consulta, de a 1000: PostgREST corta en 1000 por
 * defecto y tareas (clientes × meses) y asignaciones ya lo superan. */
async function traerTodas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await pagina(desde, desde + 999);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

function diffDias(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function ProductividadPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/seguimiento");

  const admin = createAdminClient();

  type Asignacion = { cliente_id: string; liquidador_id: string; desde_anio: number; desde_mes: number; creado_en: string };

  // Todo lo que no depende de los períodos va en paralelo.
  const [{ data: periodos }, { data: clientes }, asignaciones, { data: liquidadoras }, objetivoGeneral] = await Promise.all([
    // Períodos desde junio 2026 en adelante (antes no se usaba el sistema)
    admin
      .from("periodos")
      .select("id, anio, mes, nombre_mes")
      .or("anio.gt.2026,and(anio.eq.2026,mes.gte.6)")
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
    // Clientes activos con liquidadora
    admin.from("clientes").select("id, liquidador_id, terminacion_cuit").eq("estado", "activo"),
    // Asignaciones para resolver liquidadora histórica
    traerTodas<Asignacion>((desde, hasta) =>
      admin
        .from("asignaciones")
        .select("cliente_id, liquidador_id, desde_anio, desde_mes, creado_en")
        .order("id")
        .range(desde, hasta)
    ),
    // Liquidadoras activas
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    getObjetivoSueldos(),
  ]);

  if (!periodos || periodos.length === 0) {
    return <div className="p-8 text-gray-400 text-sm">Sin períodos registrados.</div>;
  }

  const periodoIds = periodos.map((p) => p.id);

  // Tareas con timestamps y cliente (de a 1000: crecen cada mes)
  const tareas = await traerTodas<{
    cliente_id: string;
    periodo_id: string;
    f931_manual: boolean;
    recibos_manual: boolean;
    f931_manual_en: string | null;
    recibos_manual_en: string | null;
    f931_drive: boolean;
    recibos_drive: boolean;
    legajos_cantidad: number | null;
    preliquidado: boolean;
    preliquidado_fecha: string | null;
    novedades_recibidas: boolean;
    novedades_recibidas_fecha: string | null;
  }>(async (desde, hasta) => {
    const { data } = await admin
      .from("tareas")
      .select(
        "cliente_id, periodo_id, f931_manual, recibos_manual, f931_manual_en, recibos_manual_en, f931_drive, recibos_drive, legajos_cantidad, " +
        "preliquidado, preliquidado_fecha, novedades_recibidas, novedades_recibidas_fecha"
      )
      .in("periodo_id", periodoIds)
      .order("id")
      .range(desde, hasta);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: data as any };
  });

  if (!clientes || !liquidadoras) {
    return <div className="p-8 text-gray-400 text-sm">Sin datos suficientes.</div>;
  }

  // Mapa cliente → terminacion_cuit y liquidador_id actual
  const clienteMap = new Map(clientes.map((c) => [c.id, c]));

  // Asignaciones agrupadas por cliente una sola vez (antes se recorrían todas
  // por cada cliente y cada período).
  const asignacionesPorCliente = new Map<string, Asignacion[]>();
  for (const a of asignaciones) {
    const lista = asignacionesPorCliente.get(a.cliente_id);
    if (lista) lista.push(a);
    else asignacionesPorCliente.set(a.cliente_id, [a]);
  }

  // Función: resolver liquidadora para un cliente en un período
  function resolverLiquidadora(clienteId: string, anio: number, mes: number): string | null {
    const cliente = clienteMap.get(clienteId);
    if (!cliente) return null;
    if (asignaciones.length === 0) return cliente.liquidador_id;

    let mejor: Asignacion | null = null;
    for (const a of asignacionesPorCliente.get(clienteId) ?? []) {
      if (a.desde_anio * 100 + a.desde_mes > anio * 100 + mes) continue;
      // Desempate por creado_en cuando dos asignaciones caen en el mismo
      // desde_anio/desde_mes — mismo criterio que en Seguimiento, así no
      // muestra a la liquidadora vieja cuando hay una corrección para el
      // mismo período.
      if (
        !mejor ||
        a.desde_anio * 100 + a.desde_mes > mejor.desde_anio * 100 + mejor.desde_mes ||
        (a.desde_anio * 100 + a.desde_mes === mejor.desde_anio * 100 + mejor.desde_mes &&
          a.creado_en > mejor.creado_en)
      ) {
        mejor = a;
      }
    }
    return mejor ? mejor.liquidador_id : cliente.liquidador_id;
  }

  // Construir filas por liquidadora
  const tareasMap = new Map<string, typeof tareas[0]>();
  for (const t of tareas) tareasMap.set(`${t.cliente_id}:${t.periodo_id}`, t);

  const liqData = new Map<string, FilaLiquidadora>();
  for (const liq of liquidadoras) {
    liqData.set(liq.id, { id: liq.id, nombre: liq.nombre, meses: [] });
  }

  for (const periodo of periodos) {
    // Agrupar clientes por liquidadora en este período
    const porLiq = new Map<string, { terminacion: number; tarea: typeof tareas[0] | null }[]>();

    for (const cliente of clientes) {
      const liqId = resolverLiquidadora(cliente.id, periodo.anio, periodo.mes);
      if (!liqId) continue;
      if (!porLiq.has(liqId)) porLiq.set(liqId, []);
      const tarea = tareasMap.get(`${cliente.id}:${periodo.id}`) ?? null;
      porLiq.get(liqId)!.push({ terminacion: cliente.terminacion_cuit, tarea });
    }

    for (const [liqId, items] of Array.from(porLiq.entries())) {
      const entry = liqData.get(liqId);
      if (!entry) continue;

      let f931Verde = 0, f931Amarillo = 0, f931Rojo = 0, f931SinTs = 0;
      let recibosVerde = 0, recibosAmarillo = 0, recibosRojo = 0, recibosSinTs = 0;
      let completadas = 0;
      let legajos = 0;
      const diasF931: number[] = [];
      const diasRecibos: number[] = [];
      const limiteRecibosPeriodo = limiteRecibos(periodo.anio, periodo.mes, objetivoGeneral);

      for (const { terminacion, tarea } of items) {
        if (!tarea) continue;
        const tieneF931 = tarea.f931_manual || tarea.f931_drive;
        const tieneRecibos = tarea.recibos_manual || tarea.recibos_drive;
        if (tieneF931 && tieneRecibos) completadas++;
        if (tieneF931 && tieneRecibos) legajos += tarea.legajos_cantidad ?? 0;

        if (tarea.f931_manual) {
          if (tarea.f931_manual_en) {
            const venc = getVencimientoF931(terminacion, periodo.anio, periodo.mes);
            const objetivo = restarDiasHabiles(venc, objetivoGeneral.f931_dias_habiles_antes_vencimiento);
            const color = clasificar(tarea.f931_manual_en, objetivo, venc);
            if (color === "verde") f931Verde++; else if (color === "amarillo") f931Amarillo++; else f931Rojo++;
            diasF931.push(diffDias(new Date(tarea.f931_manual_en), venc));
          } else {
            f931SinTs++;
          }
        }

        if (tarea.recibos_manual) {
          if (tarea.recibos_manual_en) {
            const objetivo = objetivoRecibos(periodo.anio, periodo.mes, objetivoGeneral, tarea);
            const color = clasificar(tarea.recibos_manual_en, objetivo, limiteRecibosPeriodo);
            if (color === "verde") recibosVerde++; else if (color === "amarillo") recibosAmarillo++; else recibosRojo++;
            diasRecibos.push(diffDias(new Date(tarea.recibos_manual_en), limiteRecibosPeriodo));
          } else {
            recibosSinTs++;
          }
        }
      }

      const avgDiasF931 = diasF931.length > 0
        ? diasF931.reduce((a, b) => a + b, 0) / diasF931.length
        : null;
      const avgDiasRecibos = diasRecibos.length > 0
        ? diasRecibos.reduce((a, b) => a + b, 0) / diasRecibos.length
        : null;

      entry.meses.push({
        periodoId: periodo.id,
        anio: periodo.anio,
        mes: periodo.mes,
        total: items.length,
        f931Verde, f931Amarillo, f931Rojo, f931SinTs,
        recibosVerde, recibosAmarillo, recibosRojo, recibosSinTs,
        completadas,
        legajos,
        avgDiasF931,
        avgDiasRecibos,
      });
    }
  }

  // Solo liquidadoras con al menos 1 período con datos
  const filas = Array.from(liqData.values()).filter((f) => f.meses.some((m) => m.total > 0));

  return (
    <ProductividadClient
      filas={filas}
    />
  );
}
