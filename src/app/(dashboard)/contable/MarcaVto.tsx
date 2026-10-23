import clsx from "clsx";
import type { Vto } from "@/lib/vencimientosContables";

// Marca de un vencimiento que no sale de la regla general (ítem 91):
// P = prórroga por período, M = fecha manual del balance. El motivo va en
// el globito. Sin marca = regla general.
export function MarcaVto({ vto }: { vto: Vto }) {
  if (vto.origen === "regla") return null;
  const prorroga = vto.origen === "prorroga";
  return (
    <span
      title={`${prorroga ? "Prórroga" : "Fecha manual"}${vto.motivo ? `: ${vto.motivo}` : ""}`}
      className={clsx(
        "inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white align-middle ml-1 cursor-help shrink-0",
        prorroga ? "bg-blue-500" : "bg-fuchsia-500"
      )}
    >
      {prorroga ? "P" : "M"}
    </span>
  );
}
