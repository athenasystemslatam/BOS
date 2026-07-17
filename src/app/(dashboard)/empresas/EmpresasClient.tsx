"use client";

import { useState, useMemo } from "react";
import { Search, Pencil } from "lucide-react";
import clsx from "clsx";
import { Cliente, Liquidadora, TipoContribuyente } from "@/types";
import { NuevaEmpresaModal } from "./NuevaEmpresaModal";
import { EditarEmpresaModal } from "./EditarEmpresaModal";

type ClienteConLiq = Cliente & { liquidadora?: Liquidadora };

const TIPO_CONTRIB_LABELS: Record<TipoContribuyente, { label: string; cls: string }> = {
  empresa: { label: "Empresa", cls: "bg-blue-50 text-blue-700" },
  monotributista: { label: "Monotributista", cls: "bg-amber-50 text-amber-700" },
  inscripto: { label: "Inscripto", cls: "bg-teal-50 text-teal-700" },
};

export function EmpresasClient({
  clientes,
  liquidadoras,
  isAdmin,
}: {
  clientes: ClienteConLiq[];
  liquidadoras: Liquidadora[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filtroLiq, setFiltroLiq] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activo");
  const [editando, setEditando] = useState<ClienteConLiq | null>(null);

  const filtrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clientes.filter((c) => {
      if (q && !c.nombre.toLowerCase().includes(q) && !c.cuit.includes(q)) return false;
      if (filtroLiq && c.liquidador_id !== filtroLiq) return false;
      if (filtroEstado && c.estado !== filtroEstado) return false;
      return true;
    });
  }, [clientes, search, filtroLiq, filtroEstado]);

  return (
    <>
      <div className="p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">
              Módulo Sueldos
            </p>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">Empresas</h1>
          </div>
          <NuevaEmpresaModal liquidadoras={liquidadoras} />
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Búsqueda */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500 font-medium block mb-1">
                Buscar empresa
              </label>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre o CUIT…"
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-bordo transition-colors"
                />
              </div>
            </div>

            {/* Liquidadora */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Liquidadora</label>
              <select
                value={filtroLiq}
                onChange={(e) => setFiltroLiq(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
              >
                <option value="">Todas</option>
                {liquidadoras.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Estado */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
              >
                <option value="activo">Activas</option>
                <option value="inactivo">Inactivas</option>
                <option value="">Todas</option>
              </select>
            </div>

            <div className="text-sm text-gray-400 pb-1.5 ml-auto">
              {filtrados.length} empresa{filtrados.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Tabla con scroll horizontal */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {filtrados.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-gray-400 text-sm">
                  {search || filtroLiq || filtroEstado !== "activo"
                    ? "No hay empresas que coincidan con los filtros"
                    : "No hay empresas cargadas aún"}
                </p>
              </div>
            ) : (
              <table className="w-full min-w-[960px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-6 py-3 text-left font-medium">Empresa</th>
                    <th className="px-5 py-3 text-left font-medium">CUIT</th>
                    <th className="px-5 py-3 text-left font-medium">Liquidadora</th>
                    <th className="px-4 py-3 text-center font-medium">Tipo</th>
                    <th className="px-4 py-3 text-center font-medium">Sindicato</th>
                    <th className="px-4 py-3 text-center font-medium">Rúb.LSD</th>
                    <th className="px-4 py-3 text-left font-medium">Jurisdicción</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-center font-medium">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtrados.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="text-[13px] font-medium text-gray-900 whitespace-nowrap">
                          {c.nombre}
                        </p>
                        {c.observaciones && (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[220px]">
                            {c.observaciones}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-gray-600 font-mono whitespace-nowrap">
                        {c.cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")}
                      </td>
                      <td className="px-5 py-3.5">
                        {c.liquidadora ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <div className="w-6 h-6 rounded-full bg-bordo/10 flex items-center justify-center text-[11px] font-semibold text-bordo shrink-0">
                              {c.liquidadora.nombre.charAt(0)}
                            </div>
                            <span className="text-[13px] text-gray-700">
                              {c.liquidadora.nombre}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <span
                            className={clsx(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
                              TIPO_CONTRIB_LABELS[c.tipo_contribuyente]?.cls ??
                                "bg-gray-100 text-gray-600"
                            )}
                          >
                            {TIPO_CONTRIB_LABELS[c.tipo_contribuyente]?.label ?? c.tipo_contribuyente}
                          </span>
                          {c.es_quincenal && (
                            <span
                              title="Quincenal"
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700"
                            >
                              Q
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-[13px]">
                        {c.tiene_sindicato ? (
                          <span className="text-success font-medium whitespace-nowrap">
                            ✓ {c.sindicato_nombre}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center text-[13px]">
                        {c.tiene_rubrica_lsd ? (
                          <span className="text-success">✓</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">
                        {c.jurisdiccion ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            c.estado === "activo"
                              ? "bg-green-50 text-success"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          {c.estado === "activo" ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => setEditando(c)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-bordo hover:bg-bordo/5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap"
                          >
                            <Pencil size={12} />
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {editando && (
        <EditarEmpresaModal
          cliente={editando}
          liquidadoras={liquidadoras}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}
