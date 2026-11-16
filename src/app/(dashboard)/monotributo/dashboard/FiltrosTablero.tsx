"use client";

import { useRouter } from "next/navigation";
import { MESES_NOMBRES } from "@/lib/vencimientos";

const SELECT =
  "text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 cursor-pointer";

/** Filtros del Dashboard de Monotributo: mes y responsable, en la URL. */
export function FiltrosTablero({
  opciones,
  mes,
  anio,
  resp,
  responsables,
}: {
  opciones: { mes: number; anio: number }[];
  mes: number;
  anio: number;
  resp: string;
  responsables: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const ir = (m: number, a: number, r: string) =>
    router.push(`/monotributo/dashboard?mes=${m}&anio=${a}${r ? `&resp=${encodeURIComponent(r)}` : ""}`);

  return (
    <>
      <select
        value={`${anio}-${mes}`}
        onChange={(e) => {
          const [a, m] = e.target.value.split("-").map(Number);
          ir(m, a, resp);
        }}
        className={SELECT}
      >
        {opciones.map((o) => (
          <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
            {MESES_NOMBRES[o.mes]} {o.anio}
          </option>
        ))}
      </select>
      <select value={resp} onChange={(e) => ir(mes, anio, e.target.value)} className={SELECT}>
        <option value="">Todos los responsables</option>
        {responsables.map((r) => (
          <option key={r.id} value={r.id}>{r.nombre}</option>
        ))}
        <option value="sin">Sin responsable</option>
      </select>
    </>
  );
}
