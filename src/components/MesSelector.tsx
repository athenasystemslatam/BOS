"use client";

import { useRouter } from "next/navigation";
import { MESES_NOMBRES } from "@/lib/vencimientos";

interface Option {
  mes: number;
  anio: number;
  label?: string;
}

// Selector de mes genérico para páginas de módulo (Impuestos/Monotributo).
// Copia el patrón que ya funciona en src/app/(dashboard)/dashboard/MonthSelector.tsx
// (Sueldos) — ese usa <select onChange> con router.push, a diferencia de las
// páginas nuevas que tenían un <select> con onChange vacío que no navegaba.
export function MesSelector({
  basePath,
  options,
  currentMes,
  currentAnio,
  className,
}: {
  basePath: string;
  options: Option[];
  currentMes: number;
  currentAnio: number;
  className?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={`${currentAnio}-${currentMes}`}
      onChange={(e) => {
        const [anio, mes] = e.target.value.split("-").map(Number);
        router.push(`${basePath}?mes=${mes}&anio=${anio}`);
      }}
      className={
        className ??
        "text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 cursor-pointer"
      }
    >
      {options.map((o) => (
        <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
          {o.label ?? `${MESES_NOMBRES[o.mes]} ${o.anio}`}
        </option>
      ))}
    </select>
  );
}
