import { createAdminClient } from "@/lib/supabase/admin";
import { Cliente, Liquidadora, Tarea } from "@/types";
import { getVencimientosGrupos, getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { getObjetivoSueldos } from "@/lib/objetivos";
import { objetivoLimiteF931, objetivoRecibos, limiteRecibos, clasificarEstado, type Color } from "@/lib/objetivoSueldos";
import { TrendingUp, Building2, CheckCircle2, Clock, CalendarDays, AlertTriangle, Target } from "lucide-react";
import clsx from "clsx";
import { MonthSelector } from "./MonthSelector";
import { fetchPeriodo } from "../seguimiento/actions";
import { getCurrentLiquidadora } from "@/lib/auth";
import { BackupButton } from "@/components/BackupButton";

const CAMPO_LABELS: Record<string, string> = {
  f931: "F.931", recibos: "Recibos", rec_q1: "Recibos Q1",
  bol_sind: "Boleta sindical", rub_lsd: "Rúbrica LSD", sac: "SAC",
};

function fmtCorta(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const supabase = createAdminClient();
  const hoy = new Date();

  const { mes: mesTrabajo, anio: anioTrabajo } = getMesTrabajoActual();
  const mesActual = parseInt(searchParams.mes ?? "") || mesTrabajo;
  const anioActual = parseInt(searchParams.anio ?? "") || anioTrabajo;

  const esMesSAC = mesActual === 6 || mesActual === 12;

  const esMesActual = mesActual === mesTrabajo && anioActual === anioTrabajo;
  const monthOptions = generateMonthOptions(mesTrabajo, anioTrabajo);

  // Misma función que usa Seguimiento para crear/pedir el período — antes
  // este dashboard lo creaba por su cuenta con un simple upsert, sin repetir
  // los legajos del mes anterior; si alguien entraba acá primero en un mes
  // nuevo, esa copia no pasaba y quedaba en 0 hasta que alguien lo cargara
  // a mano en Seguimiento. Todo lo que no depende del período va en paralelo.
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

  // "clientes" trae toda empresa activa, tenga o no Sueldos contratado (ej:
  // una que solo hace Monotributo) — este dashboard es de Seguimiento de
  // Sueldos, así que el total (y todo lo que sale de él) tiene que salir
  // solo de las que sí tienen el servicio activo, no de todas las activas.
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

  // Ítem 69: objetivo/límite de Recibos del mes — el límite no depende del
  // cliente, el objetivo sí (por la excepción de Preliquidado, ítem 97).
  const limiteRecibosGeneral = limiteRecibos(anioActual, mesActual, objetivoGeneral);
  const objetivoRecibosGeneral = objetivoRecibos(anioActual, mesActual, objetivoGeneral, {
    preliquidado: false, preliquidado_fecha: null, novedades_recibidas_fecha: null,
  });

  const resumen = liquidadorasList.map((liq) => {
    const mis = clientesList.filter((c) => c.liquidador_id === liq.id);
    let recibosOk = 0, f931Ok = 0, sacOk = 0, pendientes = 0, legajos = 0;
    let f931Verde = 0, f931Amarillo = 0, f931Rojo = 0;
    let recibosVerde = 0, recibosAmarillo = 0, recibosRojo = 0;
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

      // Ítem 69: estado en vivo contra el objetivo del área — a diferencia
      // de Productividad (histórico, solo tareas ya marcadas), acá una
      // tarea pendiente también se clasifica, comparando "hoy" contra el
      // objetivo/límite (¿vamos a tiempo o ya estamos tarde?).
      const { objetivo: objF931, limite: limF931 } = objetivoLimiteF931(c.terminacion_cuit, anioActual, mesActual, objetivoGeneral);
      const colorF931 = clasificarEstado(tieneF931, t?.f931_manual_en ?? null, objF931, limF931, hoy);
      if (colorF931 === "verde") f931Verde++; else if (colorF931 === "amarillo") f931Amarillo++; else f931Rojo++;

      const objRecibos = objetivoRecibos(anioActual, mesActual, objetivoGeneral, {
        preliquidado: t?.preliquidado ?? false,
        preliquidado_fecha: t?.preliquidado_fecha ?? null,
        novedades_recibidas_fecha: t?.novedades_recibidas_fecha ?? null,
      });
      const colorRecibos = clasificarEstado(tieneRecibos, t?.recibos_manual_en ?? null, objRecibos, limiteRecibosGeneral, hoy);
      if (colorRecibos === "verde") recibosVerde++; else if (colorRecibos === "amarillo") recibosAmarillo++; else recibosRojo++;
    }
    return {
      liq, total: mis.length, recibosOk, f931Ok, sacOk, pendientes, legajos,
      f931Verde, f931Amarillo, f931Rojo, recibosVerde, recibosAmarillo, recibosRojo,
    };
  });
  const totalLegajos = resumen.reduce((sum, r) => sum + r.legajos, 0);

  // F.931 por grupo de CUIT — vencimientos del mes de trabajo
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

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Sueldos · Resumen mensual</p>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-[22px] font-semibold text-gray-900 tracking-tight">
              {MESES_NOMBRES[mesActual]} {anioActual}
            </h1>
            <MonthSelector options={monthOptions} currentMes={mesActual} currentAnio={anioActual} />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!esMesActual && (
            <a href="/dashboard" className="text-[12px] text-bordo font-medium hover:underline">
              Mes actual
            </a>
          )}
          {yo?.isAdmin && <BackupButton modulo="sueldos" />}
        </div>
      </div>

      {/* Objetivo del área (ítem 69) — días configurables desde
          /productividad/configuracion. Acá se muestra sin la excepción de
          Preliquidado (ítem 97), que es por cliente/período. */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-bordo" />
          <span className="text-[13px] font-semibold text-gray-900">Objetivo del área</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-gray-400 mb-2">
              F.931 — objetivo: {objetivoGeneral.f931_dias_habiles_antes_vencimiento} días hábiles antes del vencimiento · límite: el vencimiento
            </p>
            <div className="flex gap-4 flex-wrap">
              {gruposF931.map((g) => (
                <div key={g.label} className="text-[12px]">
                  <p className="text-gray-500 font-medium">{g.label}</p>
                  <p className="text-gray-700">Objetivo: <span className="font-medium">{fmtCorta(g.objetivo)}</span></p>
                  <p className="text-gray-700">Límite: <span className="font-medium">{fmtCorta(g.fecha)}</span></p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 mb-2">
              Recibos — objetivo: {objetivoGeneral.recibos_dias_antes_fin_mes} días antes de fin de mes · límite: {objetivoGeneral.recibos_limite_dia_habil_mes_siguiente}º día hábil del mes siguiente
            </p>
            <div className="text-[12px]">
              <p className="text-gray-700">Objetivo: <span className="font-medium">{fmtCorta(objetivoRecibosGeneral)}</span></p>
              <p className="text-gray-700">Límite: <span className="font-medium">{fmtCorta(limiteRecibosGeneral)}</span></p>
              <p className="text-[11px] text-amber-600 mt-1">
                Con &quot;Preliquidado&quot; (ítem 97), el objetivo pasa a ser novedades recibidas + 1 día hábil.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-7">
        <StatCard label="Total clientes" value={total} icon={<Building2 size={16} className="text-gray-400" />} />
        <StatCard
          label="Recibos"
          value={recibosOk}
          icon={<CheckCircle2 size={16} className="text-success" />}
          valueColor="text-success"
          sub={total > 0 ? `${Math.round((recibosOk / total) * 100)}%` : undefined}
        />
        <StatCard
          label="Cargas F.931"
          value={cargasOk}
          icon={<Clock size={16} className="text-warning" />}
          valueColor="text-warning"
          sub={total > 0 ? `${Math.round((cargasOk / total) * 100)}%` : undefined}
        />
        <ProgressCard pct={pctAvance} completadas={recibosOk + cargasOk} total={total * 2} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {/* Avance por liquidadora */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Avance por liquidadora</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {MESES_NOMBRES[mesActual]} {anioActual}
            </p>
          </div>

          {resumen.length === 0 ? (
            <div className="flex-1 py-14 text-center text-[13px] text-gray-400">
              No hay liquidadoras configuradas
            </div>
          ) : (
            <div className="flex-1 min-h-[160px] overflow-auto [scrollbar-gutter:stable]">
            <table className="w-full min-w-[520px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-50">
                  {["Liquidadora", "Clientes", "Legajos", "Recibos", "F.931", "En objetivo F.931", "En objetivo Recibos", ...(esMesSAC ? ["SAC"] : []), "Pendientes"].map((h) => (
                    <th
                      key={h}
                      className={clsx(
                        "py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider",
                        h === "Liquidadora" ? "px-6 text-left" : "px-4 text-center"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resumen.map(({
                  liq, total: tot, recibosOk, f931Ok, sacOk, pendientes, legajos,
                  f931Verde, f931Amarillo, f931Rojo, recibosVerde, recibosAmarillo, recibosRojo,
                }) => (
                  <tr key={liq.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-bordo/10 flex items-center justify-center text-[11px] font-bold text-bordo shrink-0">
                          {liq.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-800">{liq.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-[13px] text-gray-600">{tot}</td>
                    <td className="px-4 py-3.5 text-center text-[13px] text-gray-600">{legajos}</td>
                    <td className="px-4 py-3.5 text-center">
                      <ProgressPill done={recibosOk} total={tot} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ProgressPill done={f931Ok} total={tot} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ObjetivoPill verde={f931Verde} amarillo={f931Amarillo} rojo={f931Rojo} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ObjetivoPill verde={recibosVerde} amarillo={recibosAmarillo} rojo={recibosRojo} />
                    </td>
                    {esMesSAC && (
                      <td className="px-4 py-3.5 text-center">
                        <ProgressPill done={sacOk} total={tot} />
                      </td>
                    )}
                    <td className="px-4 py-3.5 text-center">
                      {pendientes > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-danger text-[11px] font-bold">
                          {pendientes}
                        </span>
                      ) : (
                        <CheckCircle2 size={14} className="text-success mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-100">
                  <td className="px-6 py-3 text-[12px] font-semibold text-gray-500">Total</td>
                  <td className="px-4 py-3 text-center text-[13px] font-semibold text-gray-700">{total}</td>
                  <td className="px-4 py-3 text-center text-[13px] font-semibold text-gray-700">{totalLegajos}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  {esMesSAC && <td className="px-4 py-3" />}
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </div>

        {/* F.931 por grupo de CUIT */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[14px] font-semibold text-gray-900">Vencimientos F.931</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Liq. {MESES_NOMBRES[mesActual]} — vence en{" "}
              {mesActual === 12 ? "enero" : MESES_NOMBRES[mesActual + 1].toLowerCase()}
            </p>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {gruposF931.map((g) => {
              const vencido = g.diasRestantes < 0;
              const urgente = !vencido && g.diasRestantes <= 2;
              const proximo = !vencido && g.diasRestantes <= 7;
              return (
                <div
                  key={g.label}
                  className={clsx(
                    "rounded-lg p-3.5 border",
                    vencido || urgente
                      ? "bg-red-50 border-red-200"
                      : proximo
                      ? "bg-amber-50 border-amber-200"
                      : "bg-green-50 border-green-100"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-gray-600">{g.label}</span>
                    <span
                      className={clsx(
                        "text-[12px] font-bold",
                        vencido || urgente
                          ? "text-danger"
                          : proximo
                          ? "text-amber-700"
                          : "text-success"
                      )}
                    >
                      {vencido
                        ? "Vencido"
                        : g.diasRestantes === 0
                        ? "¡Hoy!"
                        : `${g.diasRestantes}d`}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-600 font-medium">
                    {g.fecha.toLocaleDateString("es-AR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-gray-500">F.931 presentados</span>
                    <span
                      className={clsx(
                        "text-[11px] font-semibold",
                        g.ok === g.total && g.total > 0 ? "text-success" : "text-gray-500"
                      )}
                    >
                      {g.ok}/{g.total}
                    </span>
                  </div>
                  {g.total > 0 && (
                    <div className="mt-1.5 h-1 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          g.ok === g.total ? "bg-success" : "bg-gray-400"
                        )}
                        style={{ width: `${Math.round((g.ok / g.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-gray-100">
            <a
              href={`/vencimientos?anio=${anioActual}`}
              className="text-[11px] font-medium text-bordo hover:text-bordo-dark flex items-center gap-1.5 transition-colors"
            >
              <CalendarDays size={12} />
              Ver calendario completo {anioActual}
            </a>
          </div>
        </div>
      </div>

      {/* Modificaciones fuera de término */}
      {alertasPostcierre && alertasPostcierre.length > 0 && (
        <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-orange-200">
            <AlertTriangle size={13} className="shrink-0 text-orange-500" />
            <span className="text-[13px] font-semibold text-orange-900">Modificaciones fuera de término</span>
            <span className="ml-auto text-[11px] text-orange-400">últimos 60 días</span>
          </div>
          <div className="overflow-auto max-h-[45vh] [scrollbar-gutter:stable]">
          <table className="w-full min-w-[560px] text-[12px] text-orange-900">
            <thead className="sticky top-0 z-10 bg-orange-50">
              <tr className="border-b border-orange-100">
                <th className="px-5 py-2 text-left text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Ítem</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Período</th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {alertasPostcierre.map((a) => (
                <tr key={a.id} className="border-b border-orange-100 last:border-0 hover:bg-orange-100/40 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{(a.cliente as { nombre: string })?.nombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-orange-700">{CAMPO_LABELS[a.campo] ?? a.campo}</td>
                  <td className="px-4 py-2.5 text-orange-500">{(a.periodo as { nombre_mes: string })?.nombre_mes ?? "—"}</td>
                  <td className="px-4 py-2.5 text-orange-400 text-right">
                    {new Date(a.modificado_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, valueColor = "text-gray-900", sub }: {
  label: string; value: number; icon: React.ReactNode; valueColor?: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
        {icon}
      </div>
      <p className={clsx("text-[22px] md:text-[28px] font-bold leading-none tracking-tight", valueColor)}>{value}</p>
      {sub && <p className="text-[10px] md:text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ProgressCard({ pct, completadas, total }: { pct: number; completadas: number; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avance global</p>
        <TrendingUp size={16} className="text-bordo" />
      </div>
      <p className={clsx("text-[22px] md:text-[28px] font-bold leading-none tracking-tight",
        pct >= 80 ? "text-success" : pct >= 40 ? "text-warning" : "text-danger"
      )}>
        {pct}%
      </p>
      <div className="mt-2 md:mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all",
            pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] md:text-[11px] text-gray-400 mt-1">{completadas}/{total} docs</p>
    </div>
  );
}

function ProgressPill({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[12px] text-gray-700 font-medium">{done}/{total}</span>
      <span className={clsx("text-[10px] font-semibold",
        pct === 100 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"
      )}>
        {pct}%
      </span>
    </div>
  );
}

/** Ítem 69: "en objetivo" (verde) sobre el total, con el desglose de
 * amarillo/rojo debajo cuando corresponde — ej. 20/28 en objetivo, con
 * 5 amarillo y 3 rojo. */
function ObjetivoPill({ verde, amarillo, rojo }: { verde: number; amarillo: number; rojo: number }) {
  const total = verde + amarillo + rojo;
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  const colorPrincipal: Color = verde === total ? "verde" : rojo > 0 ? "rojo" : "amarillo";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={clsx("text-[12px] font-medium",
        colorPrincipal === "verde" ? "text-success" : colorPrincipal === "amarillo" ? "text-warning" : "text-danger"
      )}>
        {verde}/{total}
      </span>
      {(amarillo > 0 || rojo > 0) && (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold">
          {amarillo > 0 && <span className="text-warning">{amarillo}</span>}
          {rojo > 0 && <span className="text-danger">{rojo}</span>}
        </span>
      )}
    </div>
  );
}
