"use client";

import { useRouter } from "next/navigation";

interface Option { label: string; mes: number; anio: number; }

export function MonthSelector({ options, currentMes, currentAnio }: {
  options: Option[];
  currentMes: number;
  currentAnio: number;
}) {
  const router = useRouter();
  return (
    <select
      value={`${currentAnio}-${currentMes}`}
      onChange={(e) => {
        const [anio, mes] = e.target.value.split("-").map(Number);
        router.push(`/dashboard?mes=${mes}&anio=${anio}`);
      }}
      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-bordo focus:border-bordo cursor-pointer"
    >
      {options.map((o) => (
        <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
