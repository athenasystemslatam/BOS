"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import clsx from "clsx";
import { Liquidadora } from "@/types";
import { NuevaLiquidadoraModal } from "./NuevaLiquidadoraModal";
import { EditarLiquidadoraModal } from "./EditarLiquidadoraModal";

const ROL_LABELS: Record<string, { label: string; cls: string }> = {
  admin:       { label: "Admin",        cls: "bg-purple-50 text-purple-700" },
  supervisor:  { label: "Supervisora",  cls: "bg-blue-50 text-blue-700" },
  liquidadora: { label: "Liquidadora",  cls: "bg-bordo/10 text-bordo" },
  viewer:      { label: "Solo lectura", cls: "bg-gray-100 text-gray-500" },
};

type Filtro = "todas" | "activas" | "inactivas";

export function LiquidadorasClient({ lista }: { lista: Liquidadora[] }) {
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [editando, setEditando] = useState<Liquidadora | null>(null);

  const filtradas =
    filtro === "todas"
      ? lista
      : filtro === "activas"
      ? lista.filter((l) => l.activa)
      : lista.filter((l) => !l.activa);

  return (
    <>
      <div className="p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Configuración</p>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">Liquidadoras</h1>
          </div>
          <NuevaLiquidadoraModal />
        </div>

        {/* Filtro tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
          {(["activas", "inactivas", "todas"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={clsx(
                "px-4 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                filtro === f
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f === "todas" ? `Todas (${lista.length})` : f === "activas" ? `Activas (${lista.filter(l => l.activa).length})` : `Inactivas (${lista.filter(l => !l.activa).length})`}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filtradas.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-gray-400 text-sm">No hay liquidadoras en esta categoría</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Nombre</th>
                  <th className="px-6 py-3 text-left font-medium">Email</th>
                  <th className="px-6 py-3 text-center font-medium">Rol</th>
                  <th className="px-6 py-3 text-center font-medium">Estado</th>
                  <th className="px-6 py-3 text-left font-medium">Alta</th>
                  <th className="px-6 py-3 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((liq) => {
                  const rol =
                    ROL_LABELS[liq.rol] ?? { label: liq.rol, cls: "bg-gray-100 text-gray-500" };
                  return (
                    <tr key={liq.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-bordo/10 flex items-center justify-center text-[12px] font-bold text-bordo shrink-0">
                            {liq.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-medium text-gray-900">{liq.nombre}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-[13px] text-gray-500">
                        {liq.email ? (
                          liq.email.endsWith("@kma.internal") ? (
                            <span className="text-gray-300 italic">sin email</span>
                          ) : (
                            liq.email
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span
                          className={clsx(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            rol.cls
                          )}
                        >
                          {rol.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span
                          className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            liq.activa
                              ? "bg-green-50 text-success"
                              : "bg-gray-100 text-gray-400"
                          )}
                        >
                          {liq.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-[13px] text-gray-400">
                        {new Date(liq.fecha_alta).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <button
                          onClick={() => setEditando(liq)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-bordo hover:bg-bordo/5 px-2.5 py-1.5 rounded-md transition-colors"
                        >
                          <Pencil size={12} />
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <EditarLiquidadoraModal
          liquidadora={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}
