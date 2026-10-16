"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import { TIPO_SOCIETARIO_LABEL, diasHasta, fmtFecha } from "@/lib/libros";
import type { OrganismoSocietario, TipoSocietario } from "@/types";

export type FilaClienteLibros = {
  id: string;
  nombre: string;
  cuit: string;
  responsable: string | null;
  tipo: TipoSocietario | null;
  organismo: OrganismoSocietario | null;
  librosCorresponden: number;
  librosCargados: number;
  sinLibro: number;
  pocosFolios: number;
  mandatoVence: string | null;
};

const TH = "text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3";

export function ClientesLibrosClient({ filas }: { filas: FilaClienteLibros[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroResp, setFiltroResp] = useState("");

  const responsables = useMemo(
    () => Array.from(new Set(filas.map((f) => f.responsable).filter(Boolean) as string[])).sort(),
    [filas]
  );

  const visibles = filas.filter((f) => {
    const q = busqueda.trim().toLowerCase();
    if (q && !f.nombre.toLowerCase().includes(q) && !f.cuit.includes(q)) return false;
    if (filtroResp && f.responsable !== filtroResp) return false;
    return true;
  });

  const sinTipo = filas.filter((f) => !f.tipo).length;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 rounded-full bg-violet-500" />
          <div>
            <h1 className="text-[17px] font-semibold text-gray-900">Libros — Clientes</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Datos societarios y libros de cada cliente con el servicio Libros activo
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-gray-400">{filas.length} clientes</span>
          {sinTipo > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span>
                <span className="font-semibold text-amber-600">{sinTipo}</span>
                <span className="text-gray-400"> sin tipo societario cargado</span>
              </span>
            </>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o CUIT…"
              className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg pl-7 pr-2.5 py-1.5 w-56 focus:outline-none focus:border-violet-400"
            />
          </div>
          <select
            value={filtroResp}
            onChange={(e) => setFiltroResp(e.target.value)}
            className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 cursor-pointer"
          >
            <option value="">Todos los responsables</option>
            {responsables.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] pb-2">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={clsx(TH, "text-left px-6")}>Cliente</th>
              <th className={clsx(TH, "text-left")}>Responsable</th>
              <th className={clsx(TH, "text-left")}>Tipo</th>
              <th className={clsx(TH, "text-left")}>Organismo</th>
              <th className={clsx(TH, "text-center")}>Libros cargados</th>
              <th className={clsx(TH, "text-center")}>Alertas</th>
              <th className={clsx(TH, "text-center")}>Mandato vence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 text-sm py-16">
                  {filas.length === 0
                    ? "Ningún cliente tiene el servicio Libros activo. Se activa desde Panel General → Editar cliente."
                    : "Sin resultados para el filtro aplicado"}
                </td>
              </tr>
            )}
            {visibles.map((f) => {
              const dias = f.mandatoVence ? diasHasta(f.mandatoVence) : null;
              return (
                <tr key={f.id} className="hover:bg-violet-50/40 transition-colors">
                  <td className="px-6 py-2.5">
                    <Link href={`/libros/clientes/${f.id}`} className="block">
                      <p className="text-[13px] font-medium text-gray-800 hover:text-violet-700">{f.nombre}</p>
                      <p className="text-[11px] text-gray-400">{f.cuit}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-600">{f.responsable ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-700">
                    {f.tipo ? TIPO_SOCIETARIO_LABEL[f.tipo] : <span className="text-amber-600">Sin cargar</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-600">{f.organismo ?? "—"}</td>
                  <td className="px-3 py-2.5 text-center text-[12px] text-gray-600">
                    {f.tipo ? `${f.librosCargados} / ${f.librosCorresponden}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {f.sinLibro > 0 && (
                        <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-red-50 text-red-600">
                          {f.sinLibro} sin libro
                        </span>
                      )}
                      {f.pocosFolios > 0 && (
                        <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">
                          {f.pocosFolios} con pocos folios
                        </span>
                      )}
                      {f.sinLibro === 0 && f.pocosFolios === 0 && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {f.mandatoVence ? (
                      <span
                        className={clsx(
                          "text-[12px]",
                          dias != null && dias < 0 && "text-red-600 font-medium",
                          dias != null && dias >= 0 && dias <= 90 && "text-amber-600 font-medium",
                          dias != null && dias > 90 && "text-gray-600"
                        )}
                      >
                        {fmtFecha(f.mandatoVence)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
