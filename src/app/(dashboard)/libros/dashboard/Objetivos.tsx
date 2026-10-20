import clsx from "clsx";
import { fmtFecha } from "@/lib/libros";
import type { ObjetivoConAvance } from "@/lib/librosObjetivosMetricas";
import { METRICA_LABEL } from "@/lib/librosObjetivosMetricas";
import { CHIP, MONO, PANEL, SEMAFORO } from "../ui";

function Tarjeta({ o }: { o: ObjetivoConAvance }) {
  const avance = o.valor ?? 0;
  const relleno = Math.max(0, Math.min(100, (avance / o.meta) * 100));
  const llego = o.valor != null && o.valor >= o.meta;
  const vencido = o.diasRestantes != null && o.diasRestantes < 0 && !llego;
  return (
    <article className={clsx(PANEL, "p-4 flex flex-col gap-2")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-archivo text-[14px] font-bold text-ink leading-snug">{o.nombre}</h3>
        {o.fecha_limite ? (
          <span className={clsx(CHIP, vencido ? SEMAFORO.rojo : o.diasRestantes! <= 30 ? SEMAFORO.amarillo : SEMAFORO.sinDato)}>
            {vencido ? "Vencido" : <span className={MONO}>{o.diasRestantes} días</span>}
          </span>
        ) : (
          <span className={clsx(CHIP, SEMAFORO.sinDato)}>Permanente</span>
        )}
      </div>
      <p className="text-[12px] text-ink-subtle">{METRICA_LABEL[o.metrica]}</p>
      <div className="flex items-baseline gap-2">
        <span className={clsx("font-archivo text-[26px] font-extrabold tabular-nums", llego ? "text-green-700" : "text-ink")}>
          {o.valor == null ? "—" : `${o.valor}%`}
        </span>
        <span className="text-[12px] text-ink-muted">
          meta <span className={MONO}>{o.meta}%</span>
          {o.fecha_limite && (
            <>
              {" "}
              al <span className={MONO}>{fmtFecha(o.fecha_limite)}</span>
            </>
          )}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-paper-hover overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={o.meta}
        aria-valuenow={avance}
        aria-label={`Avance de ${o.nombre}`}
      >
        <div className={clsx("h-full rounded-full", llego ? "bg-green-600" : "bg-bordo")} style={{ width: `${relleno}%` }} />
      </div>
      <p className="text-[11.5px] text-ink-subtle">
        {o.valor == null ? (
          "Todavía no hay casos para medir."
        ) : (
          <>
            <span className={MONO}>{o.cumplen}</span> de <span className={MONO}>{o.total}</span>
          </>
        )}
      </p>
    </article>
  );
}

/** Primera sección del Dashboard: objetivos vigentes y, aparte, los cumplidos. */
export function ObjetivosDashboard({ objetivos }: { objetivos: ObjetivoConAvance[] }) {
  if (objetivos.length === 0) return null;
  const actuales = objetivos.filter((o) => o.estado === "actual");
  const cumplidos = objetivos.filter((o) => o.estado === "cumplido");
  return (
    <section className="mb-6 space-y-3" aria-labelledby="titulo-objetivos">
      <h2 id="titulo-objetivos" className="font-archivo text-[16px] font-bold text-ink">
        Objetivos
      </h2>
      {actuales.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actuales.map((o) => (
            <Tarjeta key={o.id} o={o} />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">No hay objetivos vigentes. Se cargan en Configuración.</p>
      )}
      {cumplidos.length > 0 && (
        <div className={clsx(PANEL, "p-4")}>
          <h3 className="font-archivo text-[14px] font-bold text-ink mb-2">Cumplidos</h3>
          <ul className="divide-y divide-line-row">
            {cumplidos.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-[13px]">
                <span className="text-ink">
                  {o.nombre}{" "}
                  <span className="text-ink-subtle">
                    · meta <span className={MONO}>{o.meta}%</span>
                  </span>
                </span>
                <span className={clsx(CHIP, SEMAFORO.verde)}>
                  Cumplido el <span className={MONO}>{fmtFecha(o.fecha_cumplimiento)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
