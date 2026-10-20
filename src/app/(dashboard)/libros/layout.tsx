import Link from "next/link";
import clsx from "clsx";
import { objetivosConAvance, type ObjetivoConAvance } from "@/lib/librosObjetivos";
import { MONO } from "./ui";

function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return y === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`;
}

function Item({ o }: { o: ObjetivoConAvance }) {
  const llego = o.valor != null && o.valor >= o.meta;
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-cell">{o.nombre}</span>{" "}
      <b className={clsx(MONO, llego ? "text-green-700" : "text-ink")}>{o.valor == null ? "—" : `${o.valor}%`}</b>
      <span className="text-ink-subtle">
        {" "}
        · meta <span className={MONO}>{o.meta}%</span>
        {o.fecha_limite ? (
          <>
            {" "}
            al <span className={MONO}>{fechaCorta(o.fecha_limite)}</span>
          </>
        ) : (
          " permanente"
        )}
      </span>
    </span>
  );
}

/** Cartel fijo con los objetivos vigentes del módulo, arriba de todas las pantallas de Libros. */
export default async function LibrosLayout({ children }: { children: React.ReactNode }) {
  const actuales = (await objetivosConAvance()).filter((o) => o.estado === "actual");
  return (
    <div className="flex flex-col h-full">
      {actuales.length > 0 && (
        <div className="shrink-0 bg-paper-group border-b border-line-group px-4 sm:px-6 py-1.5 flex items-center gap-3 text-[12px] overflow-x-auto">
          <span className="font-semibold text-ink-subtle uppercase tracking-[0.08em] text-[10.5px] shrink-0">Objetivos</span>
          <div className="flex items-center gap-x-4">
            {actuales.map((o, i) => (
              <span key={o.id} className="flex items-center gap-4">
                {i > 0 && <span aria-hidden="true" className="text-line-rule">|</span>}
                <Item o={o} />
              </span>
            ))}
          </div>
          <Link href="/libros/dashboard" className="ml-auto shrink-0 font-semibold text-bordo hover:underline">
            Ver en el Dashboard
          </Link>
        </div>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
