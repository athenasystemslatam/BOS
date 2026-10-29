import { createAdminClient } from "@/lib/supabase/admin";
import { Cliente, Liquidadora, Tarea } from "@/types";
import { getVencimientosGrupos, getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { getObjetivoSueldos } from "@/lib/objetivos";
import {
  objetivoLimiteF931, objetivoRecibos, limiteRecibos, clasificarEnVivo, diasHabilesHasta, diaAR, diaFecha,
  type ColorEnVivo,
} from "@/lib/objetivoSueldos";
import { fetchPeriodo } from "../seguimiento/actions";
import { getCurrentLiquidadora } from "@/lib/auth";

export type ConteoObjetivo = Record<ColorEnVivo, number>;

function conteoVacio(): ConteoObjetivo {
  return { verde: 0, amarillo: 0, rojo: 0, vencido: 0, gris: 0, sin_fecha: 0 };
}

function generateMonthOptions(mesTrabajo: number, anioTrabajo: number) {
  let mes = mesTrabajo;
  let anio = anioTrabajo;
  for (let i = 0; i < 12; i++) {
    if (mes === 1) { mes = 12; anio--; } else mes--;
  }
  const options = [];
  for (let i = 0; i < 15; i++) {
    options.push({ label: `${MESES_NOMBRES[mes]} ${anio}`, mes, anio });
    if (mes === 12) { mes = 1; anio++; } else mes++;
  }
  return options;
}

// Extraído de page.tsx (antes todo esto vivía ahí adentro) para que
// /api/exportar/sueldos/dashboard pueda generar el Excel con los mismos
// números que ve el tablero (ítem 147).
export async function obtenerDatosDashboardSueldos(searchParams: { mes?: string; anio?: string }) {
  const supabase = createAdminClient();
  const hoy = new Date();

  const { mes: mesTrabajo, anio: anioTrabajo } = getMesTrabajoActual();
  const mesActual = parseInt(searchParams.mes ?? "") || mesTrabajo;
  const anioActual = parseInt(searchParams.anio ?? "") || anioTrabajo;

  const esMesSAC = mesActual === 6 || mesActual === 12;
  const esMesActual = mesActual === mesTrabajo && anioActual === anioTrabajo;
  const monthOptions = generateMonthOptions(mesTrabajo, anioTrabajo);

  const [{ data: liquidadoras }, { data: clientes }, { data: serviciosSueldos }, periodoActual, { data: alertasPostcierre }, objetivoGeneral, yo] = await Promise.all([
    supabase.from("liquidadoras").select("*").eq("activa", true).order("nombre"),
    supabase.from("clientes").select("*, liquidadora:liquidadoras!liquidador_id(*)").eq("estado", "activo"),
    supabase
      .from("servicios_cliente")
      .select("cliente_id")
      .eq("servicio", "sueldos")
      .eq("subtipo", "general")
      .eq("estado", true),
    fetchPeriodo(anioActual, mesActual),
    supabase
      .from("alertas_postcierre")
      .select("*, cliente:clientes(nombre), periodo:periodos(nombre_mes)")
      .gte("modificado_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .order("modificado_at", { ascending: false })
      .limit(50),
    getObjetivoSueldos(),
    getCurrentLiquidadora(),
  ]);

  const idsConSueldos = new Set((serviciosSueldos ?? []).map((s) => s.cliente_id));

  const { data: tareas } = periodoActual
    ? await supabase.from("tareas").select("*").eq("periodo_id", periodoActual.id)
    : { data: [] };

  const clientesList = ((clientes as (Cliente & { liquidadora: Liquidadora })[]) ?? []).filter((c) =>
    idsConSueldos.has(c.id)
  );
  const clienteLiqIds = new Set(clientesList.map((c) => c.liquidador_id).filter(Boolean));
  const liquidadorasList = ((liquidadoras as Liquidadora[]) ?? []).filter((l) => clienteLiqIds.has(l.id));
  const tareasList = (tareas as Tarea[]) ?? [];
  const tareasMap = new Map(tareasList.map((t) => [t.cliente_id, t]));

  let recibosOk = 0;
  let cargasOk = 0;
  for (const c of clientesList) {
    const t = tareasMap.get(c.id);
    if (!t) continue;
    if (t.recibos_manual || t.recibos_drive) recibosOk++;
    if (t.f931_manual || t.f931_drive) cargasOk++;
  }

  const total = clientesList.length;
  const pctAvance = total > 0 ? Math.round(((recibosOk + cargasOk) / (total * 2)) * 100) : 0;

  const limiteRecibosGeneral = limiteRecibos(anioActual, mesActual, objetivoGeneral);
  const objetivoRecibosGeneral = objetivoRecibos(anioActual, mesActual, objetivoGeneral, {
    preliquidado: false, preliquidado_fecha: null, novedades_recibidas_fecha: null,
  });

  const resumen = liquidadorasList.map((liq) => {
    const mis = clientesList.filter((c) => c.liquidador_id === liq.id);
    let recibosOk = 0, f931Ok = 0, sacOk = 0, pendientes = 0, legajos = 0;
    const objF931 = conteoVacio();
    const objRecibos = conteoVacio();
    for (const c of mis) {
      const t = tareasMap.get(c.id);
      const tieneRecibos = !!t && (t.recibos_manual || t.recibos_drive);
      const tieneF931 = !!t && (t.f931_manual || t.f931_drive);
      if (!t) {
        pendientes++;
      } else {
        if (tieneRecibos) recibosOk++;
        if (tieneF931) f931Ok++;
        if (esMesSAC && (t.sac_manual || t.sac_drive)) sacOk++;
        legajos += t.legajos_cantidad ?? 0;
        if (!tieneRecibos || !tieneF931) pendientes++;
      }

      const { objetivo: objetivoF931, limite: limF931 } = objetivoLimiteF931(c.terminacion_cuit, anioActual, mesActual, objetivoGeneral);
      objF931[clasificarEnVivo(tieneF931, t?.f931_manual ? t.f931_manual_en ?? null : null, objetivoF931, limF931, hoy)]++;

      const objetivoRec = objetivoRecibos(anioActual, mesActual, objetivoGeneral, {
        preliquidado: t?.preliquidado ?? false,
        preliquidado_fecha: t?.preliquidado_fecha ?? null,
        novedades_recibidas_fecha: t?.novedades_recibidas_fecha ?? null,
      });
      objRecibos[clasificarEnVivo(tieneRecibos, t?.recibos_manual ? t.recibos_manual_en ?? null : null, objetivoRec, limiteRecibosGeneral, hoy)]++;
    }
    return {
      liq, total: mis.length, recibosOk, f931Ok, sacOk, pendientes, legajos, objF931, objRecibos,
    };
  });
  const totalLegajos = resumen.reduce((sum, r) => sum + r.legajos, 0);

  const gruposF931 = getVencimientosGrupos(anioActual, mesActual).map((g) => {
    const clientesGrupo = clientesList.filter(
      (c) => c.terminacion_cuit >= g.min && c.terminacion_cuit <= g.max
    );
    const ok = clientesGrupo.filter((c) => {
      const t = tareasMap.get(c.id);
      return t ? t.f931_manual || t.f931_drive : false;
    }).length;
    const ms = g.fecha.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(ms / 86400000);
    const { objetivo } = objetivoLimiteF931(g.min, anioActual, mesActual, objetivoGeneral);
    return { ...g, ok, total: clientesGrupo.length, diasRestantes, objetivo };
  });

  // Tarjetas del cuadro de objetivo: una por tanda de CUIT + Recibos. Pasada =
  // límite vencido. Próxima = la de fecha pendiente más cercana (el objetivo
  // si todavía no pasó; si no, el límite).
  const hoyDia = diaAR(hoy);
  const tarjetasBase = [
    ...gruposF931.map((g) => ({ clave: g.label, titulo: "F.931", subtitulo: g.label, objetivo: g.objetivo, limite: g.fecha })),
    { clave: "recibos", titulo: "Recibos", subtitulo: "Todos los clientes", objetivo: objetivoRecibosGeneral, limite: limiteRecibosGeneral },
  ].map((tj) => {
    const pasada = hoyDia > diaFecha(tj.limite);
    const objetivoPasado = hoyDia > diaFecha(tj.objetivo);
    const fechaHacia = objetivoPasado ? tj.limite : tj.objetivo;
    return {
      ...tj, pasada, fechaHacia,
      hacia: objetivoPasado ? ("limite" as const) : ("objetivo" as const),
      diasHabiles: diasHabilesHasta(fechaHacia, hoy),
    };
  });
  const proxima = tarjetasBase
    .filter((tj) => !tj.pasada)
    .sort((a, b) => a.fechaHacia.getTime() - b.fechaHacia.getTime())[0]?.clave;
  const tarjetasObjetivo = tarjetasBase.map((tj) => ({ ...tj, proxima: tj.clave === proxima }));

  return {
    tarjetasObjetivo,
    mesActual, anioActual, esMesSAC, esMesActual, monthOptions,
    resumen, totalLegajos, gruposF931,
    total, recibosOk, cargasOk, pctAvance,
    objetivoGeneral, objetivoRecibosGeneral, limiteRecibosGeneral,
    alertasPostcierre: alertasPostcierre ?? [],
    yo,
  };
}

export type DatosDashboardSueldos = Awaited<ReturnType<typeof obtenerDatosDashboardSueldos>>;
