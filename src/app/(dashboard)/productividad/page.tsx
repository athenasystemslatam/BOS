import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getObjetivoSueldos } from "@/lib/objetivos";
import { clasificar, objetivoLimiteF931, objetivoRecibos, limiteRecibos, diffDias } from "@/lib/objetivoSueldos";
import { ProductividadClient, FilaLiquidadora } from "./ProductividadClient";

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
    admin.from("clientes").select("id, nombre, liquidador_id, terminacion_cuit").eq("estado", "activo"),
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
  // Ítem 72: cuántas veces se marcó "Preliquidado" cada cliente, acumulado
  // en toda la ventana de períodos — sirve para ver quién manda tarde.
  const preliquidadoPorCliente = new Map<string, Map<string, { nombre: string; veces: number; totalPeriodos: number }>>();
  for (const liq of liquidadoras) {
    liqData.set(liq.id, { id: liq.id, nombre: liq.nombre, meses: [], clientesPreliquidado: [] });
    preliquidadoPorCliente.set(liq.id, new Map());
  }

  for (const periodo of periodos) {
    // Agrupar clientes por liquidadora en este período
    const porLiq = new Map<string, { terminacion: number; clienteId: string; nombre: string; tarea: typeof tareas[0] | null }[]>();

    for (const cliente of clientes) {
      const liqId = resolverLiquidadora(cliente.id, periodo.anio, periodo.mes);
      if (!liqId) continue;
      if (!porLiq.has(liqId)) porLiq.set(liqId, []);
      const tarea = tareasMap.get(`${cliente.id}:${periodo.id}`) ?? null;
      porLiq.get(liqId)!.push({ terminacion: cliente.terminacion_cuit, clienteId: cliente.id, nombre: cliente.nombre, tarea });
    }

    for (const [liqId, items] of Array.from(porLiq.entries())) {
      const entry = liqData.get(liqId);
      const preliqMap = preliquidadoPorCliente.get(liqId);
      if (!entry || !preliqMap) continue;

      let f931Verde = 0, f931Amarillo = 0, f931Rojo = 0, f931SinTs = 0;
      let recibosVerde = 0, recibosAmarillo = 0, recibosRojo = 0, recibosSinTs = 0;
      let completadas = 0;
      let legajos = 0;
      let preliquidadoCount = 0;
      const diasF931Objetivo: number[] = [];
      const diasF931Limite: number[] = [];
      const diasRecibosObjetivo: number[] = [];
      const diasRecibosLimite: number[] = [];
      const limiteRecibosPeriodo = limiteRecibos(periodo.anio, periodo.mes, objetivoGeneral);

      for (const { terminacion, clienteId, nombre, tarea } of items) {
        // Ítem 72: por cliente, independiente de si ya marcó F.931/Recibos.
        const registro = preliqMap.get(clienteId) ?? { nombre, veces: 0, totalPeriodos: 0 };
        registro.totalPeriodos++;
        if (tarea?.preliquidado) { registro.veces++; preliquidadoCount++; }
        preliqMap.set(clienteId, registro);

        if (!tarea) continue;
        const tieneF931 = tarea.f931_manual || tarea.f931_drive;
        const tieneRecibos = tarea.recibos_manual || tarea.recibos_drive;
        if (tieneF931 && tieneRecibos) completadas++;
        if (tieneF931 && tieneRecibos) legajos += tarea.legajos_cantidad ?? 0;

        if (tarea.f931_manual) {
          if (tarea.f931_manual_en) {
            const { objetivo, limite: venc } = objetivoLimiteF931(terminacion, periodo.anio, periodo.mes, objetivoGeneral);
            const color = clasificar(tarea.f931_manual_en, objetivo, venc);
            if (color === "verde") f931Verde++; else if (color === "amarillo") f931Amarillo++; else f931Rojo++;
            const marcado = new Date(tarea.f931_manual_en);
            diasF931Objetivo.push(diffDias(marcado, objetivo));
            diasF931Limite.push(diffDias(marcado, venc));
          } else {
            f931SinTs++;
          }
        }

        if (tarea.recibos_manual) {
          if (tarea.recibos_manual_en) {
            const objetivo = objetivoRecibos(periodo.anio, periodo.mes, objetivoGeneral, tarea);
            const color = clasificar(tarea.recibos_manual_en, objetivo, limiteRecibosPeriodo);
            if (color === "verde") recibosVerde++; else if (color === "amarillo") recibosAmarillo++; else recibosRojo++;
            const marcado = new Date(tarea.recibos_manual_en);
            diasRecibosObjetivo.push(diffDias(marcado, objetivo));
            diasRecibosLimite.push(diffDias(marcado, limiteRecibosPeriodo));
          } else {
            recibosSinTs++;
          }
        }
      }

      const promedio = (valores: number[]) => valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;

      entry.meses.push({
        periodoId: periodo.id,
        anio: periodo.anio,
        mes: periodo.mes,
        total: items.length,
        f931Verde, f931Amarillo, f931Rojo, f931SinTs,
        recibosVerde, recibosAmarillo, recibosRojo, recibosSinTs,
        completadas,
        legajos,
        preliquidadoCount,
        avgDiasF931Objetivo: promedio(diasF931Objetivo),
        avgDiasF931Limite: promedio(diasF931Limite),
        avgDiasRecibosObjetivo: promedio(diasRecibosObjetivo),
        avgDiasRecibosLimite: promedio(diasRecibosLimite),
      });
    }
  }

  for (const [liqId, entry] of Array.from(liqData.entries())) {
    const preliqMap = preliquidadoPorCliente.get(liqId);
    if (!preliqMap) continue;
    entry.clientesPreliquidado = Array.from(preliqMap.entries())
      .map(([clienteId, r]) => ({ clienteId, ...r }))
      .filter((r) => r.veces > 0)
      .sort((a, b) => b.veces - a.veces);
  }

  // Solo liquidadoras con al menos 1 período con datos
  const filas = Array.from(liqData.values()).filter((f) => f.meses.some((m) => m.total > 0));

  return (
    <ProductividadClient
      filas={filas}
    />
  );
}
