import { MESES_NOMBRES } from "@/lib/vencimientos";
import { obtenerDatosDashboardSueldos, type ConteoObjetivo } from "./datos";
import { TrendingUp, Building2, CheckCircle2, Clock, CalendarDays, AlertTriangle, Target } from "lucide-react";
import clsx from "clsx";
import { MonthSelector } from "./MonthSelector";
import { BackupButton } from "@/components/BackupButton";
import { DescargarExcelButton } from "@/components/DescargarExcelButton";

const CAMPO_LABELS: Record<string, string> = {
  f931: "F.931", recibos: "Recibos", rec_q1: "Recibos Q1",
  bol_sind: "Boleta sindical", rub_lsd: "Rúbrica LSD", sac: "SAC",
};

function fmtCorta(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const {
    mesActual, anioActual, esMesSAC, esMesActual, monthOptions,
    resumen, totalLegajos, gruposF931,
    total, recibosOk, cargasOk,
    objetivoGeneral, tarjetasObjetivo,
    alertasPostcierre, yo,
  } = await obtenerDatosDashboardSueldos(searchParams);

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
          {yo?.isAdmin && (
            <DescargarExcelButton
              href={`/api/exportar/sueldos/dashboard?mes=${mesActual}&anio=${anioActual}`}
              title="Descargar este tablero (avance por liquidadora, F.931) a Excel"
            />
          )}
          {yo?.isAdmin && <BackupButton modulo="sueldos" />}
        </div>
      </div>

      {/* Objetivo del área (ítem 69) — días configurables desde
          /productividad/configuracion. Acá se muestra sin la excepción de
          Preliquidado (ítem 97), que es por cliente/período. */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Target size={16} className="text-bordo" />
          <span className="text-[13px] font-semibold text-gray-900">Objetivo del área</span>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          F.931: objetivo {objetivoGeneral.f931_dias_habiles_antes_vencimiento} días hábiles antes del vencimiento, límite el vencimiento ·
          Recibos: objetivo {objetivoGeneral.recibos_dias_antes_fin_mes} días antes de fin de mes, límite el {objetivoGeneral.recibos_limite_dia_habil_mes_siguiente}º día hábil del mes siguiente
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tarjetasObjetivo.map((tj) => (
            <div
              key={tj.clave}
              className={clsx(
                "rounded-lg border px-4 py-3",
                tj.proxima
                  ? "border-bordo bg-bordo/5 ring-1 ring-bordo/20"
                  : tj.pasada
                  ? "border-gray-100 bg-gray-50"
                  : "border-gray-100 bg-white"
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className={clsx("text-[13px] font-semibold", tj.pasada ? "text-gray-400" : "text-gray-900")}>{tj.titulo}</p>
                <p className="text-[11px] text-gray-400">{tj.subtitulo}</p>
              </div>
              <div className={clsx("mt-2 space-y-0.5 text-[12px]", tj.pasada ? "text-gray-400" : "text-gray-600")}>
                <p className="flex justify-between">
                  <span>Objetivo</span>
                  <span className={clsx("font-semibold", !tj.pasada && "text-gray-900")}>{fmtCorta(tj.objetivo)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Límite</span>
                  <span className={clsx("font-semibold", !tj.pasada && "text-gray-900")}>{fmtCorta(tj.limite)}</span>
                </p>
              </div>
              <p className={clsx("mt-2 text-[11px] font-semibold",
                tj.pasada ? "text-gray-400" : tj.proxima ? "text-bordo" : "text-gray-500"
              )}>
                {tj.pasada
                  ? "Ya pasó"
                  : tj.diasHabiles === 0
                  ? `${tj.hacia === "objetivo" ? "Objetivo" : "Límite"}: hoy`
                  : `Faltan ${tj.diasHabiles} ${tj.diasHabiles === 1 ? "día hábil" : "días hábiles"} ${tj.hacia === "objetivo" ? "para el objetivo" : "para el límite"}`}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-amber-600 mt-3">
          Recibos: con &quot;Preliquidado&quot; (ítem 97), el objetivo de ese cliente pasa a ser novedades recibidas + 1 día hábil.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-7">
        <StatCard label="Total clientes" value={total} icon={<Building2 size={16} className="text-gray-400" />} />
        <ProgressCard
          label="Recibos liquidados"
          icon={<CheckCircle2 size={16} className="text-success" />}
          completadas={recibosOk}
          total={total}
          detalle={`${recibosOk} de ${total} clientes`}
        />
        <ProgressCard
          label="F.931 presentados"
          icon={<Clock size={16} className="text-warning" />}
          completadas={cargasOk}
          total={total}
          detalle={`${cargasOk} de ${total} clientes`}
        />
        <ProgressCard
          label="Avance global"
          icon={<TrendingUp size={16} className="text-bordo" />}
          completadas={recibosOk + cargasOk}
          total={total * 2}
          detalle={`${recibosOk + cargasOk} de ${total * 2} tareas`}
          aclaracion={`Recibos + F.931 de ${total} clientes (2 por cliente)`}
        />
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
            <table className="w-full min-w-[640px]">
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
                  objF931, objRecibos,
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
                      <ObjetivoPill c={objF931} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ObjetivoPill c={objRecibos} />
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

function ProgressCard({ label, icon, completadas, total, detalle, aclaracion }: {
  label: string; icon: React.ReactNode; completadas: number; total: number; detalle: string; aclaracion?: string;
}) {
  const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
        {icon}
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
      <p className="text-[10px] md:text-[11px] text-gray-500 font-medium mt-1">{detalle}</p>
      {aclaracion && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{aclaracion}</p>}
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

/** Ítem 69: "en objetivo" = solo lo HECHO con tilde en o antes del objetivo.
 * Debajo: fuera (hecho tarde: amarillo antes del límite, rojo después),
 * pendientes (gris en plazo, rojo con el límite vencido) y sin fecha
 * (detectado por Drive, no se puede verificar). */
function ObjetivoPill({ c }: { c: ConteoObjetivo }) {
  const total = c.verde + c.amarillo + c.rojo + c.vencido + c.gris + c.sin_fecha;
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  const fuera = c.amarillo + c.rojo;
  const pendientes = c.gris + c.vencido;
  const detalle = [
    `${c.verde} en objetivo`,
    `${c.amarillo} entre objetivo y límite`,
    `${c.rojo} hechos después del límite`,
    `${c.vencido} pendientes con el límite vencido`,
    `${c.gris} pendientes en plazo`,
    `${c.sin_fecha} hechos sin fecha (Drive)`,
  ].join("\n");
  return (
    <div className="flex flex-col items-center gap-0.5" title={detalle}>
      <span className={clsx("text-[12px] font-medium", c.verde === total ? "text-success" : "text-gray-700")}>
        {c.verde}/{total} <span className="text-[10px] font-normal text-gray-400">en objetivo</span>
      </span>
      {(fuera > 0 || pendientes > 0 || c.sin_fecha > 0) && (
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
          {fuera > 0 && <span className={clsx("font-semibold", c.rojo > 0 ? "text-danger" : "text-warning")}>{fuera} fuera</span>}
          {fuera > 0 && (pendientes > 0 || c.sin_fecha > 0) && <span>·</span>}
          {pendientes > 0 && <span className={clsx("font-semibold", c.vencido > 0 ? "text-danger" : "text-gray-400")}>{pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}</span>}
          {pendientes > 0 && c.sin_fecha > 0 && <span>·</span>}
          {c.sin_fecha > 0 && <span className="font-semibold text-gray-500">{c.sin_fecha} sin fecha</span>}
        </span>
      )}
    </div>
  );
}
